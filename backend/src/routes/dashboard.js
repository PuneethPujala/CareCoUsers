const express = require('express');
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { getCachedOrFetch, invalidateCache, CacheKeys, TTL } = require('../config/redis');

const router = express.Router();

/**
 * GET /api/dashboard/super-admin-stats
 * Aggregated dashboard data for Super Admin.
 * Returns: stats counters, organizations list with patient counts, recent activity.
 */
router.get('/super-admin-stats',
    authenticate,
    requireRole('super_admin'),
    async (req, res) => {
        try {
            // If _t cache-bust param is present, invalidate stale cache first
            if (req.query._t) {
                await invalidateCache(CacheKeys.adminDashboard());
            }

            const result = await getCachedOrFetch(
                CacheKeys.adminDashboard(),
                async () => {
                    // ── Stats counters (parallel queries for speed) ──
                    const [
                        totalOrganizations,
                        totalPatients,
                        activeCallers,
                        totalOrgAdmins,
                        totalCareManagers,
                        totalCaretakers,
                        organizations,
                        recentLogs,
                        orgCounts,
                        revenueAgg,
                        orgPatientCounts
                    ] = await Promise.all([
                        Organization.countDocuments(),
                        mongoose.connection.db.collection('patients').countDocuments({ is_active: { $ne: false } }),
                        Profile.countDocuments({ role: 'caller', isActive: { $ne: false } }),
                        Profile.countDocuments({ role: 'org_admin', isActive: { $ne: false } }),
                        Profile.countDocuments({ role: 'care_manager', isActive: { $ne: false } }),
                        Profile.countDocuments({ role: 'caretaker', isActive: { $ne: false } }),
                        Organization.find()
                            .select('name type subscriptionPlan isActive currentPatientCount currentCaretakerCount maxPatients email phone createdAt')
                            .sort({ createdAt: -1 })
                            .lean()
                            .limit(100), // Protect against massive memory usage
                        AuditLog.find({
                            action: { $in: ['create', 'update', 'delete', 'login', 'password_reset', 'password_change', 'register'] }
                        })
                            .sort({ createdAt: -1 })
                            .limit(10)
                            .select('action resourceType details createdAt userId')
                            .lean(),
                        Profile.aggregate([
                            { $match: { isActive: { $ne: false }, organizationId: { $exists: true, $ne: null } } },
                            { $group: { 
                                _id: { orgId: '$organizationId', role: '$role' }, 
                                count: { $sum: 1 } 
                            } }
                        ]),
                        mongoose.connection.db.collection('patients').aggregate([
                            { $match: { 'subscription.status': 'active' } },
                            { $group: { _id: null, total: { $sum: '$subscription.amount' } } }
                        ]).toArray(),
                        mongoose.connection.db.collection('patients').aggregate([
                            { $match: { is_active: { $ne: false }, organization_id: { $exists: true, $ne: null } } },
                            { $group: { _id: '$organization_id', count: { $sum: 1 } } }
                        ]).toArray()
                    ]);

                    // ── Map Aggregation Data to Organizations ──
                    const staffCountMap = {};
                    const staffRoles = ['org_admin', 'care_manager', 'caretaker', 'caller'];

                    orgCounts.forEach(item => {
                        const orgIdStr = item._id.orgId.toString();
                        if (staffRoles.includes(item._id.role)) {
                             staffCountMap[orgIdStr] = (staffCountMap[orgIdStr] || 0) + item.count;
                        }
                    });

                    const patientCountMap = {};
                    orgPatientCounts.forEach(item => {
                        const orgIdStr = item._id ? item._id.toString() : '';
                        if (orgIdStr) {
                             patientCountMap[orgIdStr] = (patientCountMap[orgIdStr] || 0) + item.count;
                        }
                    });

                    // ── Enrich orgs with real counts ──
                    const enrichedOrgs = organizations.map(org => ({
                        ...org,
                        patientCount: patientCountMap[org._id.toString()] || org.currentPatientCount || 0,
                        staffCount: staffCountMap[org._id.toString()] || 0,
                        status: org.isActive !== false ? 'active' : 'inactive',
                    }));

                    // ── Format recent activity ──
                    const recentActivity = recentLogs.map(log => {
                        let text = '';
                        let severity = 'info';

                        switch (log.action) {
                            case 'create':
                                text = `New ${formatResourceType(log.resourceType)} created`;
                                severity = 'info';
                                break;
                            case 'update':
                                text = `${formatResourceType(log.resourceType)} updated`;
                                severity = 'info';
                                break;
                            case 'delete':
                                text = `${formatResourceType(log.resourceType)} deleted`;
                                severity = 'warning';
                                break;
                            case 'login':
                                text = 'Admin login';
                                severity = 'info';
                                break;
                            case 'password_reset':
                                text = 'Password reset completed';
                                severity = 'warning';
                                break;
                            case 'password_change':
                                text = 'Password changed';
                                severity = 'info';
                                break;
                            default:
                                text = `${log.action} on ${formatResourceType(log.resourceType)}`;
                                severity = 'info';
                        }

                        if (log.details) {
                            if (log.details.organizationName) text += `: ${log.details.organizationName}`;
                            else if (log.details.createdProfileEmail) text += `: ${log.details.createdProfileEmail}`;
                        }

                        return {
                            id: log._id,
                            text,
                            severity,
                            time: getTimeAgo(log.createdAt),
                            createdAt: log.createdAt,
                        };
                    });

                    // ── Calculate total revenue natively from patients & tie-ups collections ──
                    const patientRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;
                    
                    const tieupRevenueAgg = await Organization.aggregate([
                        { $match: { totalRevenue: { $type: "number" }, isActive: { $ne: false } } },
                        { $group: { _id: null, total: { $sum: "$totalRevenue" } } }
                    ]);
                    const tieupRevenue = tieupRevenueAgg.length > 0 ? tieupRevenueAgg[0].total : 0;
                    
                    const totalRevenue = patientRevenue + tieupRevenue;

                    return {
                        stats: {
                            totalOrganizations,
                            totalPatients,
                            activeCallers,
                            totalOrgAdmins,
                            totalCareManagers,
                            totalCaretakers,
                            totalRevenue,
                        },
                        organizations: enrichedOrgs,
                        recentActivity,
                    };
                },
                TTL.DASHBOARD  // 5-minute cache
            );

            res.json(result);

        } catch (error) {
            console.error('Super admin stats error:', error);
            res.status(500).json({ error: 'Failed to load dashboard data.' });
        }
    }
);

/**
 * GET /api/dashboard/org-admin-stats
 * Aggregated dashboard data for Organizational Admin.
 * Returns: role counts, routing queue, manager workload.
 */
router.get('/org-admin-stats',
    authenticate,
    requireRole('org_admin'),
    async (req, res) => {
        try {
            const org = req.profile.organizationId;
            const organizationId = typeof org === 'object' ? (org._id || org).toString() : org;
            
            if (!organizationId) {
                return res.status(400).json({ error: 'Organization ID not found for this admin.' });
            }

            // If _t cache-bust param is present, invalidate stale cache first
            if (req.query._t) {
                await invalidateCache(CacheKeys.orgDashboard(organizationId));
            }

            const result = await getCachedOrFetch(
                CacheKeys.orgDashboard(organizationId),
                async () => {
                    // ── Role counts for the organization ──
                    const roles = ['care_manager', 'caller', 'patient_mentor'];
                    const objId = mongoose.Types.ObjectId.isValid(organizationId) ? new mongoose.Types.ObjectId(organizationId) : organizationId;
                    
                    const roleCounts = await Profile.aggregate([
                        { 
                            $match: { 
                                organizationId: { $in: [organizationId, organizationId.toString(), objId] }, 
                                role: { $in: roles }, 
                                isActive: { $ne: false } 
                            } 
                        },
                        { $group: { _id: '$role', count: { $sum: 1 } } }
                    ]);

                    const stats = roles.reduce((acc, role) => {
                        const found = roleCounts.find(r => r._id === role);
                        acc[role] = found ? found.count : 0;
                        return acc;
                    }, {});

                    // ── Accurate Patient Count from Native Collection ──
                    const patientCount = await mongoose.connection.db.collection('patients').countDocuments({
                        $or: [
                            { organization_id: organizationId },
                            { organization_id: organizationId.toString() },
                            { organization_id: new mongoose.Types.ObjectId(organizationId) }
                        ],
                        is_active: { $ne: false }
                    });
                    stats.patient = patientCount;

                    // ── Routing Queue (Patients without active caretaker) ──
                    const CaretakerPatient = require('../models/CaretakerPatient');
                    const assignedPatientIds = await CaretakerPatient.find({ status: 'active' }).distinct('patientId');

                    const routingQueue = await Profile.find({
                        organizationId,
                        role: 'patient',
                        isActive: true,
                        _id: { $nin: assignedPatientIds }
                    }).limit(20).select('fullName createdAt').lean();

                    // ── Manager Workload ──
                    const managers = await Profile.find({ organizationId, role: 'care_manager', isActive: true })
                        .select('fullName email')
                        .lean();

                    const workloads = await Promise.all(managers.map(async (mgr) => {
                        // Real data: count patients assigned via this manager
                        const assignedPatients = await CaretakerPatient.countDocuments({ assignedBy: mgr._id, status: 'active' });
                        
                        // Count callers managed by this manager
                        const managedCallers = await Profile.countDocuments({ 
                            organizationId, 
                            role: 'caller', 
                            managedBy: mgr._id, 
                            isActive: true 
                        });
                        
                        // If no callers are directly managed, fallback to proportional split
                        const totalCallersOrg = await Profile.countDocuments({ organizationId, role: 'caller', isActive: true });
                        const callers = managedCallers > 0 ? managedCallers : Math.floor(totalCallersOrg / Math.max(managers.length, 1));
                        
                        // Max capacity: 30 patients per caller under this manager
                        const maxCapacity = Math.max(callers * 30, 20); // minimum 20 even with no callers
                        const load = Math.min(Math.round((assignedPatients / maxCapacity) * 100), 100);
                        
                        // Production-accurate status tiers
                        let status;
                        if (assignedPatients === 0) status = 'IDLE';
                        else if (load < 40) status = 'LOW';
                        else if (load < 70) status = 'OPTIMAL';
                        else if (load < 85) status = 'HIGH';
                        else status = 'OVERLOADED';

                        return {
                            id: mgr._id,
                            name: mgr.fullName,
                            patients: assignedPatients,
                            callers,
                            load,
                            status
                        };
                    }));

                    // ── Recent Activity for Organization ──
                    const orgUsers = await Profile.find({ organizationId }).distinct('supabaseUid');
                    const recentLogs = await AuditLog.find({ 
                        supabaseUid: { $in: orgUsers },
                        action: { $in: ['create', 'update', 'delete', 'login', 'password_reset', 'password_change', 'register'] }
                    })
                        .sort({ createdAt: -1 })
                        .limit(10)
                        .select('action resourceType details createdAt supabaseUid')
                        .lean();
                    
                    const recentActivity = recentLogs.map(log => {
                        let text = '';
                        let severity = 'info';

                        switch (log.action) {
                            case 'create':
                                text = `New ${formatResourceType(log.resourceType)} created`;
                                severity = 'info';
                                break;
                            case 'update':
                                text = `${formatResourceType(log.resourceType)} updated`;
                                severity = 'info';
                                break;
                            case 'delete':
                                text = `${formatResourceType(log.resourceType)} deleted`;
                                severity = 'warning';
                                break;
                            case 'login':
                                text = 'User login';
                                severity = 'info';
                                break;
                            default:
                                text = `${log.action} on ${formatResourceType(log.resourceType)}`;
                                severity = 'info';
                        }
                        
                        if (log.details?.createdProfileEmail) {
                            text += `: ${log.details.createdProfileEmail}`;
                        }

                        return {
                            id: log._id,
                            text,
                            severity,
                            time: getTimeAgo(log.createdAt),
                            createdAt: log.createdAt,
                        };
                    });
                    // ── Organization Revenue ──
                    const revenueAgg = await mongoose.connection.db.collection('patients').aggregate([
                        { $match: { 
                            'subscription.status': 'active',
                            $or: [
                                { organization_id: organizationId },
                                { organization_id: organizationId.toString() },
                                { organization_id: new mongoose.Types.ObjectId(organizationId) }
                            ]
                        } },
                        { $group: { _id: null, total: { $sum: '$subscription.amount' } } }
                    ]).toArray();
                    
                    const recentSubscriptions = await mongoose.connection.db.collection('patients').find({
                        'subscription.status': 'active',
                        $or: [
                            { organization_id: organizationId },
                            { organization_id: organizationId.toString() },
                            { organization_id: new mongoose.Types.ObjectId(organizationId) }
                        ]
                    })
                    .sort({ 'subscription.startDate': -1, 'created_at': -1 })
                    .limit(20)
                    .project({ name: 1, first_name: 1, last_name: 1, 'subscription.amount': 1, 'subscription.startDate': 1, created_at: 1 })
                    .toArray();
                    
                    const orgDoc = await Organization.findById(organizationId).select('totalRevenue collaborations').lean();
                    const tieupRevenue = orgDoc?.totalRevenue || 0;
                    
                    const patientRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;
                    const revenue = patientRevenue + tieupRevenue;

                    // ── 24H Growth Rate Calculation ──
                    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    
                    const recentStatsAgg = await Profile.aggregate([
                        { $match: { organizationId: { $in: [organizationId, organizationId.toString(), objId] }, role: { $in: roles }, isActive: { $ne: false }, createdAt: { $gte: yesterday } } },
                        { $group: { _id: '$role', count: { $sum: 1 } } }
                    ]);
                    
                    const recentPatientCount = await mongoose.connection.db.collection('patients').countDocuments({
                        $or: [ { organization_id: organizationId }, { organization_id: organizationId.toString() }, { organization_id: objId } ],
                        is_active: { $ne: false },
                        created_at: { $gte: yesterday }
                    });

                    const recentRevenueAgg = await mongoose.connection.db.collection('patients').aggregate([
                        { $match: { 
                            'subscription.status': 'active',
                            'subscription.startDate': { $gte: yesterday },
                            $or: [ { organization_id: organizationId }, { organization_id: organizationId.toString() }, { organization_id: objId } ]
                        } },
                        { $group: { _id: null, total: { $sum: '$subscription.amount' } } }
                    ]).toArray();
                    const recentPatientRevenue = recentRevenueAgg.length > 0 ? recentRevenueAgg[0].total : 0;
                    
                    const recentTieupRevenue = (orgDoc?.collaborations || [])
                        .filter(c => c.status === 'Active' && new Date(c.date) >= yesterday)
                        .reduce((sum, c) => sum + (c.dealAmount || 0), 0);
                    
                    const recentRevenueTotal = recentPatientRevenue + recentTieupRevenue;

                    // ── 24H Change: raw count of new additions (production-accurate) ──
                    // Percentage growth is misleading for small orgs. Instead, show the
                    // actual number of new items added in the last 24 hours.
                    stats.care_manager_change = recentStatsAgg.find(r => r._id === 'care_manager')?.count || 0;
                    stats.caller_change = recentStatsAgg.find(r => r._id === 'caller')?.count || 0;
                    stats.patient_change = recentPatientCount;
                    stats.revenue_change = recentRevenueTotal;

                    return {
                        stats: { ...stats, revenue, patientRevenue, tieupRevenue },
                        recentSubscriptions,
                        routingQueue: routingQueue.map(p => ({
                            id: p._id,
                            patient: p.fullName,
                            priority: 'medium',
                            waitTime: getTimeAgo(p.createdAt)
                        })),
                        managers: workloads,
                        recentActivity
                    };
                },
                TTL.DASHBOARD  // 5-minute cache
            );

            res.json(result);

        } catch (error) {
            console.error('Org admin stats error:', error);
            res.status(500).json({ error: 'Failed to load organization dashboard data.' });
        }
    }
);

/**
 * GET /api/dashboard/care-manager-stats
 * Aggregated dashboard data for Care Manager.
 * Returns: case stats, top performers, recent team activity.
 */
router.get('/care-manager-stats',
    authenticate,
    requireRole('care_manager'),
    async (req, res) => {
        try {
            const managerId = req.profile._id;
            const CaretakerPatient = require('../models/CaretakerPatient');
            const CallLog = require('../models/CallLog');

            // If _t cache-bust param is present, invalidate stale cache first
            if (req.query._t) {
                await invalidateCache(CacheKeys.managerDashboard(managerId));
            }

            const result = await getCachedOrFetch(
                CacheKeys.managerDashboard(managerId),
                async () => {
                    // ── Stats ──
                    const totalCallers = await Profile.countDocuments({
                        organizationId: req.profile.organizationId,
                        role: 'caller',
                        isActive: true
                    });
                    
                    const Patient = require('../models/Patient');
                    const totalPatients = await Patient.countDocuments({
                        organization_id: req.profile.organizationId,
                        is_active: true
                    });
                    
                    const activeAssignedPatients = await CaretakerPatient.find({ status: 'active' }).distinct('patientId');
                    const assignedCount = activeAssignedPatients.length;
                    const unassignedCount = await Patient.countDocuments({
                        organization_id: req.profile.organizationId,
                        is_active: true,
                        _id: { $nin: activeAssignedPatients }
                    });

                    // ── Capacity Forecasting Engine (Enhanced) ──
                    const MAX_PATIENTS_PER_CALLER = 30;
                    const maxCapacity = totalCallers * MAX_PATIENTS_PER_CALLER;
                    const availableSlots = Math.max(0, maxCapacity - assignedCount);
                    const utilizationPct = maxCapacity > 0 ? Math.round((assignedCount / maxCapacity) * 100) : 0;

                    // Growth rate: use multiple windows for accuracy
                    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
                    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

                    const patientsLast7Days = await Patient.countDocuments({
                        organization_id: req.profile.organizationId,
                        is_active: true,
                        createdAt: { $gte: sevenDaysAgo }
                    });
                    const patientsLast14Days = await Patient.countDocuments({
                        organization_id: req.profile.organizationId,
                        is_active: true,
                        createdAt: { $gte: fourteenDaysAgo }
                    });
                    const patientsLast30Days = await Patient.countDocuments({
                        organization_id: req.profile.organizationId,
                        is_active: true,
                        createdAt: { $gte: thirtyDaysAgo }
                    });

                    // Use 30-day average for stable rate, 7-day for recent trend
                    const dailyGrowth30d = Math.round((patientsLast30Days / 30) * 10) / 10;
                    const dailyGrowth7d = Math.round((patientsLast7Days / 7) * 10) / 10;
                    // Use recent trend if available, else long-term average
                    const dailyGrowthRate = dailyGrowth7d > 0 ? dailyGrowth7d : dailyGrowth30d;

                    // Week-over-week trend (this week vs last week)
                    const prevWeekPatients = patientsLast14Days - patientsLast7Days;
                    let weekTrend = 'stable'; // stable, growing, declining
                    if (patientsLast7Days > prevWeekPatients && prevWeekPatients >= 0) weekTrend = 'growing';
                    else if (patientsLast7Days < prevWeekPatients) weekTrend = 'declining';

                    // Prediction: days until callers are fully loaded
                    let daysUntilFull = -1; // -1 means stable / no growth
                    if (dailyGrowthRate > 0 && availableSlots > 0) {
                        daysUntilFull = Math.ceil(availableSlots / dailyGrowthRate);
                    } else if (dailyGrowthRate > 0 && availableSlots === 0) {
                        daysUntilFull = 0; // already full
                    }

                    // Hiring recommendation: callers needed for the next 30 days
                    let callersNeeded = 0;
                    if (dailyGrowthRate > 0) {
                        const patientsIn30Days = dailyGrowthRate * 30;
                        const shortfall = patientsIn30Days - availableSlots;
                        if (shortfall > 0) {
                            callersNeeded = Math.ceil(shortfall / MAX_PATIENTS_PER_CALLER);
                        }
                    }
                    if (totalCallers === 0 && totalPatients > 0) {
                        callersNeeded = Math.max(1, Math.ceil(totalPatients / MAX_PATIENTS_PER_CALLER));
                    }

                    // ── Top Performers — batch aggregation instead of N+1 ──
                    const callers = await Profile.find({
                        organizationId: req.profile.organizationId,
                        role: 'caller',
                        isActive: true
                    }).limit(10).select('_id fullName').lean();

                    const callerIds = callers.map(c => c._id);
                    let performers = [];

                    if (callerIds.length > 0) {
                        const perfResults = await CallLog.aggregate([
                            { $match: { caretakerId: { $in: callerIds }, scheduledTime: { $gte: thirtyDaysAgo } } },
                            { $group: {
                                _id: '$caretakerId',
                                totalScheduled: { $sum: 1 },
                                totalCompleted: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                            }},
                        ]);

                        const perfMap = Object.fromEntries(perfResults.map(p => [p._id.toString(), p]));

                        performers = callers.map(c => {
                            const perf = perfMap[c._id.toString()] || { totalScheduled: 0, totalCompleted: 0 };
                            const completionRate = perf.totalScheduled > 0
                                ? Math.round((perf.totalCompleted / perf.totalScheduled) * 100)
                                : 0;
                            return {
                                id: c._id,
                                name: c.fullName,
                                score: completionRate,
                                calls: perf.totalCompleted,
                                totalAssigned: perf.totalScheduled,
                                status: 'active'
                            };
                        }).sort((a, b) => b.score !== a.score ? b.score - a.score : b.calls - a.calls);
                    }

                    // ── Recent Activity ──
                    const recentLogs = await AuditLog.find({ supabaseUid: req.profile.supabaseUid })
                        .sort({ createdAt: -1 })
                        .limit(5)
                        .lean();

                    return {
                        stats: {
                            totalCallers,
                            totalPatients,
                            unassignedPatients: unassignedCount
                        },
                        capacity: {
                            maxCapacity,
                            assignedPatients: assignedCount,
                            availableSlots,
                            utilizationPct,
                            patientsLast7Days,
                            patientsLast30Days,
                            dailyGrowthRate,
                            dailyGrowth30d,
                            weekTrend,
                            daysUntilFull,
                            callersNeeded
                        },
                        performers,
                        activities: recentLogs.map(log => ({
                            id: log._id,
                            icon: 'activity',
                            text: `${req.profile.fullName} ${log.action} ${formatResourceType(log.resourceType)}`,
                            time: getTimeAgo(log.createdAt)
                        }))
                    };
                },
                TTL.DASHBOARD
            );

            res.json(result);

        } catch (error) {
            console.error('Care manager stats error:', error);
            res.status(500).json({ error: 'Failed to load care manager dashboard data.' });
        }
    }
);

// ── Helpers ──

function formatResourceType(type) {
    const map = {
        profile: 'user account',
        organizations: 'organization',
        organization: 'organization',
        patient: 'patient',
        caretaker: 'caretaker',
    };
    return map[type] || type;
}

function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
}

module.exports = router;
