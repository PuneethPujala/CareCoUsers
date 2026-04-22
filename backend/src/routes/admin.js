const express = require('express');
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Medication = require('../models/Medication');
const Invoice = require('../models/Invoice');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const CaretakerPatient = require('../models/CaretakerPatient');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// ── All routes require super_admin ──────────────────────────────
router.use(authenticate, requireRole('super_admin'));

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

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

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

function buildSortObject(query, defaults = { createdAt: -1 }) {
    if (!query.sortBy) return defaults;
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    return { [query.sortBy]: direction };
}

// ═══════════════════════════════════════════════════════════════
// 1. GET /api/admin/stats — Platform-wide KPIs
// ═══════════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        // Advanced Net-Change Algorithm to support true Negative (-) Growth Percentages
        // netChange = (Created Today) - (Deactivated Today)
        const getNetGrowth = (activeNow, newToday, deactivatedToday) => {
            const netChange = newToday - deactivatedToday;
            const prevTotal = activeNow - netChange; // mathematical count exactly 24h ago
            return prevTotal > 0 ? (netChange / prevTotal) * 100 : (netChange > 0 ? 100 : 0);
        };

        const [
            // Current Active
            totalOrganizations, totalOrgAdmins, totalCareManagers, activeCallers, totalPatients,
            
            // New Today
            newOrgs, newOrgAdmins, newCareManagers, newCallers, newPatients,
            
            // Deactivated Today
            lostOrgs, lostOrgAdmins, lostCareManagers, lostCallers, lostPatients,
            
            // Revenue
            revenueData, prevRevenueData,
        ] = await Promise.all([
            // 1. Current Active
            Organization.countDocuments({ isActive: true }),
            Profile.countDocuments({ role: 'org_admin', isActive: true }),
            Profile.countDocuments({ role: 'care_manager', isActive: true }),
            Profile.countDocuments({ role: { $in: ['caretaker', 'caller'] }, isActive: true }),
            Profile.countDocuments({ role: 'patient', isActive: true }),

            // 2. New Today
            Organization.countDocuments({ isActive: true, createdAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: 'org_admin', isActive: true, createdAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: 'care_manager', isActive: true, createdAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: { $in: ['caretaker', 'caller'] }, isActive: true, createdAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: 'patient', isActive: true, createdAt: { $gte: startOfToday } }),

            // 3. Deactivated Today (Loss/Churn tracking for negatives!)
            Organization.countDocuments({ isActive: false, updatedAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: 'org_admin', isActive: false, updatedAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: 'care_manager', isActive: false, updatedAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: { $in: ['caretaker', 'caller'] }, isActive: false, updatedAt: { $gte: startOfToday } }),
            Profile.countDocuments({ role: 'patient', isActive: false, updatedAt: { $gte: startOfToday } }),

            // 4. Revenue (Only Counting Active Orgs!)
            Invoice.aggregate([
                { $match: { status: 'paid' } },
                { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
                { $unwind: '$org' },
                { $match: { 'org.isActive': true } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Invoice.aggregate([
                { $match: { status: 'paid', paidAt: { $lt: startOfToday } } },
                { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
                { $unwind: '$org' },
                { $match: { 'org.isActive': true } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
        ]);

        const totalRevenue = revenueData.length ? revenueData[0].total : 0;
        const prevRevenue = prevRevenueData.length ? prevRevenueData[0].total : 0;
        const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : (totalRevenue > 0 ? 100 : 0);

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.json({
            stats: {
                totalOrganizations,
                totalOrganizations_change: parseFloat(getNetGrowth(totalOrganizations, newOrgs, lostOrgs).toFixed(1)),
                
                totalOrgAdmins,
                totalOrgAdmins_change: parseFloat(getNetGrowth(totalOrgAdmins, newOrgAdmins, lostOrgAdmins).toFixed(1)),
                
                totalCareManagers,
                totalCareManagers_change: parseFloat(getNetGrowth(totalCareManagers, newCareManagers, lostCareManagers).toFixed(1)),
                
                activeCallers,
                activeCallers_change: parseFloat(getNetGrowth(activeCallers, newCallers, lostCallers).toFixed(1)),
                
                totalPatients,
                totalPatients_change: parseFloat(getNetGrowth(totalPatients, newPatients, lostPatients).toFixed(1)),
                
                totalRevenue,
                totalRevenue_change: parseFloat(revenueGrowth.toFixed(1)),
            },
        });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Failed to load platform statistics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 2. GET /api/admin/organizations — All orgs (paginated)
// ═══════════════════════════════════════════════════════════════
router.get('/organizations', async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const sort = buildSortObject(req.query);
        const filter = {};

        // Search
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }
        // Filters
        if (req.query.type) filter.type = req.query.type;
        if (req.query.plan) filter.subscriptionPlan = req.query.plan;
        if (req.query.status === 'active') filter.isActive = true;
        else if (req.query.status === 'inactive') filter.isActive = false;

        const [organizations, total] = await Promise.all([
            Organization.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Organization.countDocuments(filter),
        ]);

        // Enrich with real-time counts
        const orgIds = organizations.map(o => o._id);

        const [patientCounts, staffCounts] = await Promise.all([
            Profile.aggregate([
                { $match: { role: 'patient', isActive: true, organizationId: { $in: orgIds } } },
                { $group: { _id: '$organizationId', count: { $sum: 1 } } },
            ]),
            Profile.aggregate([
                { $match: { isActive: true, organizationId: { $in: orgIds }, role: { $in: ['org_admin', 'care_manager', 'caretaker', 'caller'] } } },
                { $group: { _id: '$organizationId', count: { $sum: 1 } } },
            ]),
        ]);

        const patientMap = Object.fromEntries(patientCounts.map(p => [p._id.toString(), p.count]));
        const staffMap = Object.fromEntries(staffCounts.map(s => [s._id.toString(), s.count]));

        const enriched = organizations.map(org => ({
            ...org,
            patientCount: patientMap[org._id.toString()] || 0,
            staffCount: staffMap[org._id.toString()] || 0,
            status: org.isActive ? 'active' : 'inactive',
        }));

        res.json({
            organizations: enriched,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get organizations error:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. POST /api/admin/organizations — Create org
// ═══════════════════════════════════════════════════════════════
router.post('/organizations', async (req, res) => {
    try {
        const {
            name, type, subscriptionPlan, maxPatients,
            address, phone, email, licenseNumber, licenseExpiryDate,
            settings,
        } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        const existing = await Organization.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existing) {
            return res.status(409).json({ error: 'Organization with this name already exists' });
        }

        const org = await Organization.create({
            name,
            type,
            subscriptionPlan: subscriptionPlan || 'starter',
            maxPatients: maxPatients || 100,
            address,
            phone,
            email,
            licenseNumber,
            licenseExpiryDate,
            settings,
            createdBy: req.profile.supabaseUid,
        });

        // Audit log
        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'create_organization',
            resourceType: 'organization',
            resourceId: org._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: { organizationName: name, type, subscriptionPlan },
        });

        res.status(201).json({ organization: org });
    } catch (error) {
        console.error('Create organization error:', error);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: 'Validation error', details: errors });
        }
        res.status(500).json({ error: 'Failed to create organization' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 4. PUT /api/admin/organizations/:id — Update org
// ═══════════════════════════════════════════════════════════════
router.put('/organizations/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid organization ID' });
        }

        const org = await Organization.findById(req.params.id);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        const allowedUpdates = [
            'name', 'type', 'subscriptionPlan', 'maxPatients', 'isActive',
            'address', 'phone', 'email', 'licenseNumber', 'licenseExpiryDate',
            'accreditationStatus', 'settings',
        ];
        const previousValues = {};
        const newValues = {};

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                previousValues[field] = org[field];
                newValues[field] = req.body[field];
                org[field] = req.body[field];
            }
        });

        await org.save();

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'update_organization',
            resourceType: 'organization',
            resourceId: org._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            previousValues,
            newValues,
            details: { organizationName: org.name },
        });

        res.json({ organization: org });
    } catch (error) {
        console.error('Update organization error:', error);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: 'Validation error', details: errors });
        }
        res.status(500).json({ error: 'Failed to update organization' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. DELETE /api/admin/organizations/:id — Soft-delete org
// ═══════════════════════════════════════════════════════════════
router.delete('/organizations/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid organization ID' });
        }

        const org = await Organization.findById(req.params.id);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Soft delete: deactivate org and all its users
        org.isActive = false;
        await org.save();

        // Deactivate all users in the organization
        const deactivatedCount = await Profile.updateMany(
            { organizationId: org._id, isActive: true },
            { $set: { isActive: false } }
        );

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'delete_organization',
            resourceType: 'organization',
            resourceId: org._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: {
                organizationName: org.name,
                usersDeactivated: deactivatedCount.modifiedCount,
            },
        });

        res.json({
            message: 'Organization deactivated successfully',
            usersDeactivated: deactivatedCount.modifiedCount,
        });
    } catch (error) {
        console.error('Delete organization error:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 6. GET /api/admin/users — All users (filtered, paginated)
// ═══════════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const sort = buildSortObject(req.query);
        const filter = {};

        // Search across name, email
        if (req.query.search) {
            filter.$or = [
                { fullName: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }
        // Filters
        if (req.query.role) filter.role = req.query.role;
        if (req.query.organizationId) {
            if (mongoose.Types.ObjectId.isValid(req.query.organizationId)) {
                filter.organizationId = new mongoose.Types.ObjectId(req.query.organizationId);
            }
        }
        if (req.query.status === 'active') filter.isActive = true;
        else if (req.query.status === 'inactive') filter.isActive = false;

        const [users, total] = await Promise.all([
            Profile.find(filter)
                .select('-passwordHistory -failedLoginAttempts -accountLockedUntil')
                .populate('organizationId', 'name type')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Profile.countDocuments(filter),
        ]);

        res.json({
            users,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 7. PUT /api/admin/users/:id/status — Activate/deactivate user
// ═══════════════════════════════════════════════════════════════
router.put('/users/:id/status', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const { isActive, reason } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'isActive (boolean) is required' });
        }

        const user = await Profile.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deactivating yourself
        if (user._id.equals(req.profile._id) && !isActive) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        const previousStatus = user.isActive;
        user.isActive = isActive;
        await user.save();

        // If deactivating a caretaker, handle their patient assignments
        if (!isActive && user.role === 'caretaker') {
            await CaretakerPatient.updateMany(
                { caretakerId: user._id, status: 'active' },
                { $set: { status: 'suspended' } }
            );
        }

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: isActive ? 'activate_user' : 'deactivate_user',
            resourceType: 'profile',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            previousValues: { isActive: previousStatus },
            newValues: { isActive },
            details: { email: user.email, role: user.role, reason },
        });

        res.json({
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user: { _id: user._id, email: user.email, fullName: user.fullName, isActive: user.isActive },
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 8. GET /api/admin/activity — Recent audit logs
// ═══════════════════════════════════════════════════════════════
router.get('/activity', async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const filter = {};

        // Filters
        if (req.query.action) filter.action = req.query.action;
        if (req.query.resourceType) filter.resourceType = req.query.resourceType;
        if (req.query.outcome) filter.outcome = req.query.outcome;
        if (req.query.userId) filter.supabaseUid = req.query.userId;

        // Date range
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(filter),
        ]);

        // Enrich with profile info
        const supabaseUids = [...new Set(logs.map(l => l.supabaseUid).filter(uid => uid !== 'anonymous'))];
        const profiles = await Profile.find(
            { supabaseUid: { $in: supabaseUids } },
            'supabaseUid fullName email role'
        ).lean();
        const profileMap = Object.fromEntries(profiles.map(p => [p.supabaseUid, p]));

        const enrichedLogs = logs.map(log => ({
            ...log,
            user: profileMap[log.supabaseUid] || { fullName: 'System', email: null },
            timeAgo: getTimeAgo(log.createdAt),
        }));

        res.json({
            activity: enrichedLogs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 9. GET /api/admin/alerts — System-wide escalations/alerts
// ═══════════════════════════════════════════════════════════════
router.get('/alerts', async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const filter = {};

        if (req.query.priority) filter.priority = req.query.priority;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.status) {
            filter.status = req.query.status;
        } else {
            // Default: show open alerts
            filter.status = { $in: ['open', 'acknowledged', 'in_progress', 'escalated'] };
        }

        const [alerts, total] = await Promise.all([
            Escalation.find(filter)
                .populate('patientId', 'fullName avatarUrl')
                .populate('caretakerId', 'fullName')
                .populate('assignedTo', 'fullName')
                .populate('organizationId', 'name')
                .sort({ priority: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Escalation.countDocuments(filter),
        ]);

        // Stats summary
        const [openCount, criticalCount, breachedCount] = await Promise.all([
            Escalation.countDocuments({ status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Escalation.countDocuments({ priority: 'critical', status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Escalation.countDocuments({ slaBreached: true, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
        ]);

        res.json({
            alerts,
            summary: { open: openCount, critical: criticalCount, slaBreached: breachedCount },
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 10. GET /api/admin/analytics/revenue — Revenue chart data
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/revenue', async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        // Monthly revenue breakdown (Active Orgs Only)
        const revenueByMonth = await Invoice.aggregate([
            {
                $match: {
                    status: 'paid',
                    paidAt: { $gte: startDate },
                },
            },
            { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
            { $unwind: '$org' },
            { $match: { 'org.isActive': true } },
            {
                $group: {
                    _id: {
                        year: { $year: '$paidAt' },
                        month: { $month: '$paidAt' },
                    },
                    revenue: { $sum: '$total' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        // Revenue by plan
        const revenueByPlan = await Invoice.aggregate([
            {
                $match: {
                    status: 'paid',
                    paidAt: { $gte: startDate },
                },
            },
            {
                $lookup: {
                    from: 'organizations',
                    localField: 'organizationId',
                    foreignField: '_id',
                    as: 'org',
                },
            },
            { $unwind: '$org' },
            { $match: { 'org.isActive': true } },
            {
                $group: {
                    _id: '$org.subscriptionPlan',
                    revenue: { $sum: '$total' },
                    orgCount: { $addToSet: '$organizationId' },
                },
            },
            {
                $project: {
                    plan: '$_id',
                    revenue: 1,
                    orgCount: { $size: '$orgCount' },
                },
            },
        ]);

        // Outstanding balance (Active Orgs Only)
        const outstanding = await Invoice.aggregate([
            {
                $match: {
                    status: { $in: ['pending', 'overdue'] },
                },
            },
            { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
            { $unwind: '$org' },
            { $match: { 'org.isActive': true } },
            {
                $group: {
                    _id: '$status',
                    total: { $sum: '$total' },
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            revenueByMonth: revenueByMonth.map(r => ({
                month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
                revenue: r.revenue,
                invoiceCount: r.count,
            })),
            revenueByPlan,
            outstanding,
        });
    } catch (error) {
        console.error('Revenue analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch revenue analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 11. GET /api/admin/analytics/adherence — Adherence trends
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/adherence', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Daily adherence trend (platform-wide)
        const dailyAdherence = await CallLog.aggregate([
            {
                $match: {
                    scheduledTime: { $gte: startDate },
                    status: { $in: ['completed', 'missed', 'no_answer'] },
                },
            },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                },
            },
            {
                $project: {
                    date: '$_id',
                    adherenceRate: {
                        $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 1],
                    },
                    totalConfirmations: '$total',
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Adherence by organization
        const adherenceByOrg = await CallLog.aggregate([
            {
                $match: {
                    scheduledTime: { $gte: startDate },
                    status: { $in: ['completed', 'missed', 'no_answer'] },
                },
            },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: '$organizationId',
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                },
            },
            {
                $lookup: {
                    from: 'organizations',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'org',
                },
            },
            { $unwind: '$org' },
            {
                $project: {
                    organizationName: '$org.name',
                    adherenceRate: {
                        $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 1],
                    },
                    totalConfirmations: '$total',
                },
            },
            { $sort: { adherenceRate: -1 } },
        ]);

        // Call completion trends
        const callTrends = await CallLog.aggregate([
            {
                $match: { scheduledTime: { $gte: startDate } },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                },
            },
            {
                $project: {
                    date: '$_id',
                    total: 1,
                    completed: 1,
                    missed: 1,
                    completionRate: {
                        $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 1],
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            dailyAdherence,
            adherenceByOrg,
            callTrends,
        });
    } catch (error) {
        console.error('Adherence analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch adherence analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 12. POST /api/admin/reports/export — Export CSV/PDF
// ═══════════════════════════════════════════════════════════════
router.post('/reports/export', async (req, res) => {
    try {
        const { reportType, format = 'csv', startDate, endDate, organizationId } = req.body;

        if (!reportType) {
            return res.status(400).json({ error: 'reportType is required' });
        }

        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        let data = [];
        let headers = [];

        switch (reportType) {
            case 'users': {
                const filter = {};
                if (organizationId) filter.organizationId = new mongoose.Types.ObjectId(organizationId);
                if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

                data = await Profile.find(filter)
                    .select('fullName email role isActive organizationId createdAt lastLoginAt')
                    .populate('organizationId', 'name')
                    .lean();

                headers = ['Name', 'Email', 'Role', 'Status', 'Organization', 'Created', 'Last Login'];
                data = data.map(u => ({
                    Name: u.fullName,
                    Email: u.email,
                    Role: u.role,
                    Status: u.isActive ? 'Active' : 'Inactive',
                    Organization: u.organizationId?.name || 'N/A',
                    Created: u.createdAt?.toISOString()?.split('T')[0] || '',
                    'Last Login': u.lastLoginAt?.toISOString()?.split('T')[0] || 'Never',
                }));
                break;
            }

            case 'calls': {
                const filter = {};
                if (organizationId) filter.organizationId = new mongoose.Types.ObjectId(organizationId);
                if (Object.keys(dateFilter).length) filter.scheduledTime = dateFilter;

                data = await CallLog.find(filter)
                    .populate('patientId', 'fullName')
                    .populate('caretakerId', 'fullName')
                    .sort({ scheduledTime: -1 })
                    .limit(10000)
                    .lean();

                headers = ['Date', 'Patient', 'Caretaker', 'Status', 'Outcome', 'Duration', 'Medications Confirmed'];
                data = data.map(c => ({
                    Date: c.scheduledTime?.toISOString()?.split('T')[0] || '',
                    Patient: c.patientId?.fullName || 'N/A',
                    Caretaker: c.caretakerId?.fullName || 'N/A',
                    Status: c.status,
                    Outcome: c.outcome || '',
                    Duration: c.duration ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : '',
                    'Medications Confirmed': c.medicationConfirmations
                        ? `${c.medicationConfirmations.filter(m => m.confirmed).length}/${c.medicationConfirmations.length}`
                        : '0/0',
                }));
                break;
            }

            case 'escalations': {
                const filter = {};
                if (organizationId) filter.organizationId = new mongoose.Types.ObjectId(organizationId);
                if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

                data = await Escalation.find(filter)
                    .populate('patientId', 'fullName')
                    .populate('caretakerId', 'fullName')
                    .populate('assignedTo', 'fullName')
                    .sort({ createdAt: -1 })
                    .limit(10000)
                    .lean();

                headers = ['Date', 'Type', 'Priority', 'Status', 'Patient', 'Caretaker', 'Assigned To', 'SLA Breached'];
                data = data.map(e => ({
                    Date: e.createdAt?.toISOString()?.split('T')[0] || '',
                    Type: e.type,
                    Priority: e.priority,
                    Status: e.status,
                    Patient: e.patientId?.fullName || 'N/A',
                    Caretaker: e.caretakerId?.fullName || 'N/A',
                    'Assigned To': e.assignedTo?.fullName || 'Unassigned',
                    'SLA Breached': e.slaBreached ? 'Yes' : 'No',
                }));
                break;
            }

            case 'organizations': {
                data = await Organization.find({})
                    .sort({ createdAt: -1 })
                    .lean();

                headers = ['Name', 'Type', 'Plan', 'Status', 'Patients', 'Max Patients', 'Created'];
                data = data.map(o => ({
                    Name: o.name,
                    Type: o.type,
                    Plan: o.subscriptionPlan,
                    Status: o.isActive ? 'Active' : 'Inactive',
                    Patients: o.currentPatientCount || 0,
                    'Max Patients': o.maxPatients,
                    Created: o.createdAt?.toISOString()?.split('T')[0] || '',
                }));
                break;
            }

            default:
                return res.status(400).json({ error: `Unknown report type: ${reportType}. Valid types: users, calls, escalations, organizations` });
        }

        // Generate CSV
        if (format === 'csv') {
            if (data.length === 0) {
                return res.status(200).json({ message: 'No data found for the given filters', data: [], headers });
            }

            const csvHeaders = headers.join(',');
            const csvRows = data.map(row =>
                headers.map(h => {
                    const val = String(row[h] || '').replace(/"/g, '""');
                    return `"${val}"`;
                }).join(',')
            );
            const csv = [csvHeaders, ...csvRows].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report_${Date.now()}.csv`);
            return res.send(csv);
        }

        // JSON format (for frontend to handle)
        res.json({
            reportType,
            format,
            totalRecords: data.length,
            headers,
            data,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Export report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

module.exports = router;
