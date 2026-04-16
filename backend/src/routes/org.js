const express = require('express');
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Medication = require('../models/Medication');
const Invoice = require('../models/Invoice');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const CaretakerPatient = require('../models/CaretakerPatient');
const { reconcileUnassignedPatients } = require('../services/reconciliationService');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// Supabase admin client for creating user accounts
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── All routes require org_admin ────────────────────────────────
router.use(authenticate, requireRole('org_admin', 'super_admin'));

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getOrgId(req) {
    // super_admin can pass ?organizationId= to act on behalf of any org
    if (req.profile.role === 'super_admin' && req.query.organizationId) {
        return new mongoose.Types.ObjectId(req.query.organizationId);
    }
    return req.profile.organizationId?._id || req.profile.organizationId;
}

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
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

// ═══════════════════════════════════════════════════════════════
// 1. GET /api/org/dashboard — Org-scoped KPIs
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ error: 'Organization ID not found for this admin' });

        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const [
            organization,
            totalCareManagers,
            totalCaretakers,
            totalPatients,
            totalMentors,
            activePatients,
            newPatientsThisMonth,
            callsToday,
            completedCallsToday,
            missedCallsToday,
            callsThisWeek,
            openEscalations,
            criticalEscalations,
            activeMedications,
            unassignedPatientIds,
        ] = await Promise.all([
            Organization.findById(orgId).lean(),
            Profile.countDocuments({ organizationId: orgId, role: 'care_manager', isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: { $in: ['caretaker', 'caller'] }, isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: 'patient', isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: 'patient_mentor', isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: 'patient', isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: 'patient', isActive: true, createdAt: { $gte: thirtyDaysAgo } }),
            CallLog.countDocuments({ organizationId: orgId, scheduledTime: { $gte: startOfToday } }),
            CallLog.countDocuments({ organizationId: orgId, scheduledTime: { $gte: startOfToday }, status: 'completed' }),
            CallLog.countDocuments({ organizationId: orgId, scheduledTime: { $gte: startOfToday }, status: { $in: ['missed', 'no_answer'] } }),
            CallLog.countDocuments({ organizationId: orgId, scheduledTime: { $gte: sevenDaysAgo } }),
            Escalation.countDocuments({ organizationId: orgId, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Escalation.countDocuments({ organizationId: orgId, priority: 'critical', status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Medication.countDocuments({ organizationId: orgId, isActive: true }),
            // Find patients without active caretaker assignment
            (async () => {
                const assignedIds = await CaretakerPatient.find({ status: 'active' }).distinct('patientId');
                return Profile.countDocuments({
                    organizationId: orgId,
                    role: 'patient',
                    isActive: true,
                    _id: { $nin: assignedIds },
                });
            })(),
        ]);

        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Org adherence rate (last 30 days)
        const adherenceResult = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: thirtyDaysAgo },
                    status: { $in: ['completed', 'missed', 'no_answer'] },
                },
            },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                },
            },
        ]);
        const orgAdherence = adherenceResult.length
            ? Math.round((adherenceResult[0].confirmed / adherenceResult[0].total) * 100)
            : 0;

        // Manager workload
        const managers = await Profile.find({ organizationId: orgId, role: 'care_manager', isActive: true })
            .select('fullName email avatarUrl')
            .lean();

        const managerWorkloads = await Promise.all(managers.map(async (mgr) => {
            const managedCaretakers = await Profile.countDocuments({ managedBy: mgr._id, role: { $in: ['caretaker', 'caller'] }, isActive: true });
            const managedAssignments = await CaretakerPatient.countDocuments({ assignedBy: mgr._id, status: 'active' });
            return {
                id: mgr._id,
                name: mgr.fullName,
                email: mgr.email,
                avatarUrl: mgr.avatarUrl,
                caretakers: managedCaretakers,
                patients: managedAssignments,
                load: Math.min(Math.round((managedAssignments / 30) * 100), 100),
            };
        }));

        // Routing queue (unassigned patients)
        const routingQueue = await Profile.find({
            organizationId: orgId,
            role: 'patient',
            isActive: true,
            _id: { $nin: await CaretakerPatient.find({ status: 'active' }).distinct('patientId') },
        })
            .select('fullName createdAt')
            .sort({ createdAt: 1 })
            .limit(20)
            .lean();

        // Recent activity
        const recentProfiles = await Profile.find({ organizationId: orgId }).select('supabaseUid').lean();
        const orgUids = recentProfiles.map(p => p.supabaseUid);
        const recentLogs = await AuditLog.find({ supabaseUid: { $in: orgUids } })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        res.json({
            organization: {
                name: organization.name,
                type: organization.type,
                plan: organization.subscriptionPlan,
                maxPatients: organization.maxPatients,
            },
            stats: {
                careManagers: totalCareManagers,
                caretakers: totalCaretakers,
                patients: { total: totalPatients, active: activePatients, new: newPatientsThisMonth, unassigned: unassignedPatientIds },
                mentors: totalMentors,
                adherence: orgAdherence,
                medications: activeMedications,
                calls: {
                    today: { total: callsToday, completed: completedCallsToday, missed: missedCallsToday },
                    thisWeek: callsThisWeek,
                },
                escalations: { open: openEscalations, critical: criticalEscalations },
            },
            managers: managerWorkloads,
            routingQueue: routingQueue.map(p => ({
                id: p._id,
                patient: p.fullName,
                waitTime: getTimeAgo(p.createdAt),
                priority: 'medium',
            })),
            recentActivity: recentLogs.map(log => ({
                id: log._id,
                action: log.action,
                resourceType: log.resourceType,
                outcome: log.outcome,
                time: getTimeAgo(log.createdAt),
                createdAt: log.createdAt,
            })),
        });
    } catch (error) {
        console.error('Org dashboard error:', error);
        res.status(500).json({ error: 'Failed to load organization dashboard' });
    }
});

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 1b. POST /api/org/reconcile — Org Admin Round-Robin Reconciliation
// Auto-assigns ALL unassigned patients in the org to available callers
// ═══════════════════════════════════════════════════════════════
router.post('/reconcile', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const result = await reconcileUnassignedPatients(orgId, req.profile._id);
        res.json(result);
    } catch (error) {
        console.error('Org reconciliation error:', error);
        res.status(500).json({ error: 'Reconciliation failed', details: error.message });
    }
});
// 2. GET /api/org/care-managers — Managers in org
// ═══════════════════════════════════════════════════════════════
router.get('/care-managers', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { page, limit, skip } = parsePagination(req.query);
        const filter = { organizationId: orgId, role: 'care_manager', isActive: true };

        if (req.query.search) {
            filter.$or = [
                { fullName: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }
        if (req.query.status === 'inactive') filter.isActive = false;

        const [managers, total] = await Promise.all([
            Profile.find(filter)
                .select('fullName email phone avatarUrl isActive languages hireDate createdAt lastLoginAt')
                .sort({ fullName: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Profile.countDocuments(filter),
        ]);

        // Enrich with workload metrics
        const enriched = await Promise.all(managers.map(async (mgr) => {
            const [caretakerCount, patientCount, openAlerts] = await Promise.all([
                Profile.countDocuments({ managedBy: mgr._id, role: { $in: ['caretaker', 'caller'] }, isActive: true }),
                CaretakerPatient.countDocuments({ assignedBy: mgr._id, status: 'active' }),
                Escalation.countDocuments({ assignedTo: mgr._id, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            ]);
            return {
                ...mgr,
                caretakerCount,
                patientCount,
                openAlerts,
                performanceScore: patientCount > 0 ? Math.min(95, 70 + Math.round(25 * (1 - openAlerts / Math.max(patientCount, 1)))) : 0,
            };
        }));

        res.json({
            careManagers: enriched,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get care managers error:', error);
        res.status(500).json({ error: 'Failed to fetch care managers' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. POST /api/org/care-managers — Create care manager
// ═══════════════════════════════════════════════════════════════
router.post('/care-managers', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { fullName, email, phone, languages, tempPassword } = req.body;

        if (!fullName || !email) {
            return res.status(400).json({ error: 'fullName and email are required' });
        }

        // Check if email already exists
        const existing = await Profile.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: 'A user with this email already exists' });
        }

        // Create Supabase auth user
        const password = tempPassword || `CareConnect_${Math.random().toString(36).slice(2, 10)}!`;
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, role: 'care_manager' },
        });

        if (authError) {
            console.error('Supabase create user error:', authError);
            return res.status(500).json({ error: 'Failed to create authentication account', details: authError.message });
        }

        // Create MongoDB profile
        const profile = await Profile.create({
            supabaseUid: authData.user.id,
            email: email.toLowerCase(),
            fullName,
            phone,
            role: 'care_manager',
            organizationId: orgId,
            languages: languages || ['English'],
            hireDate: new Date(),
            mustChangePassword: true,
            emailVerified: true,
            createdBy: req.profile._id,
        });

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'create_care_manager',
            resourceType: 'profile',
            resourceId: profile._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: { createdProfileEmail: email, role: 'care_manager', organizationId: orgId },
        });

        // Send notification
        await Notification.create({
            recipientId: profile._id,
            organizationId: orgId,
            type: 'new_user_added',
            channel: 'in_app',
            title: 'Welcome to CareConnect',
            body: `Your care manager account has been created by ${req.profile.fullName}. Please change your temporary password.`,
            priority: 'high',
        });

        res.status(201).json({
            careManager: profile,
            tempPassword: password,
            message: 'Care manager created. Temporary password must be changed on first login.',
        });
    } catch (error) {
        console.error('Create care manager error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Validation error', details: Object.values(error.errors).map(e => e.message) });
        }
        res.status(500).json({ error: 'Failed to create care manager' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 4. GET /api/org/caretakers — Caretakers in org
// ═══════════════════════════════════════════════════════════════
router.get('/caretakers', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { page, limit, skip } = parsePagination(req.query);
        const filter = { organizationId: orgId, role: { $in: ['caretaker', 'caller'] }, isActive: true };

        if (req.query.search) {
            filter.$or = [
                { fullName: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }
        if (req.query.status === 'inactive') filter.isActive = false;
        if (req.query.managerId) filter.managedBy = new mongoose.Types.ObjectId(req.query.managerId);

        const [caretakers, total] = await Promise.all([
            Profile.find(filter)
                .select('fullName email phone avatarUrl isActive languages hireDate managedBy createdAt lastLoginAt')
                .populate('managedBy', 'fullName')
                .sort({ fullName: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Profile.countDocuments(filter),
        ]);

        // Enrich with real metrics
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const enriched = await Promise.all(caretakers.map(async (ct) => {
            const [assignedPatients, performance, callsToday, completedToday] = await Promise.all([
                CaretakerPatient.countDocuments({ caretakerId: ct._id, status: 'active' }),
                CallLog.getCaretakerPerformance(ct._id, 30),
                CallLog.countDocuments({ caretakerId: ct._id, scheduledTime: { $gte: startOfToday, $lte: endOfToday } }),
                CallLog.countDocuments({ caretakerId: ct._id, scheduledTime: { $gte: startOfToday, $lte: endOfToday }, status: 'completed' }),
            ]);

            // Determine status based on current activity
            let status = 'available';
            const activeCall = await CallLog.findOne({ caretakerId: ct._id, status: 'in_progress' });
            if (activeCall) status = 'on_call';
            else if (!ct.isActive) status = 'off_duty';

            return {
                ...ct,
                assignedPatients,
                performanceScore: performance.completionRate,
                callsScheduledToday: callsToday,
                callsCompletedToday: completedToday,
                avgCallDuration: performance.avgDuration,
                status,
            };
        }));

        res.json({
            caretakers: enriched,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get caretakers error:', error);
        res.status(500).json({ error: 'Failed to fetch caretakers' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. GET /api/org/patients — Patients in org
// ═══════════════════════════════════════════════════════════════
router.get('/patients', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { page, limit, skip } = parsePagination(req.query);
        const filter = { organizationId: orgId, role: 'patient', isActive: true };

        if (req.query.search) {
            filter.$or = [
                { fullName: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }
        if (req.query.status === 'inactive') filter.isActive = false;
        if (req.query.status === 'paused') {
            // Patients with paused assignments
            const pausedPatientIds = await CaretakerPatient.find({ status: 'suspended' }).distinct('patientId');
            filter._id = { $in: pausedPatientIds };
        }

        const [patients, total] = await Promise.all([
            Profile.find(filter)
                .select('fullName email phone avatarUrl isActive dateOfBirth gender allergies conditions emergencyContact createdAt')
                .sort({ fullName: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Profile.countDocuments(filter),
        ]);

        // Enrich with assignment, medication, and adherence data
        const enriched = await Promise.all(patients.map(async (patient) => {
            const [assignment, medications, adherenceRate, lastCall] = await Promise.all([
                CaretakerPatient.findOne({ patientId: patient._id, status: 'active' })
                    .populate('caretakerId', 'fullName avatarUrl')
                    .lean(),
                Medication.countDocuments({ patientId: patient._id, isActive: true }),
                CallLog.calculateAdherenceRate(patient._id, 30),
                CallLog.findOne({ patientId: patient._id, status: 'completed' })
                    .sort({ scheduledTime: -1 })
                    .select('scheduledTime')
                    .lean(),
            ]);

            // Calculate age from DOB
            let age = null;
            if (patient.dateOfBirth) {
                const today = new Date();
                const birth = new Date(patient.dateOfBirth);
                age = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
            }

            return {
                ...patient,
                age,
                assignedCaretaker: assignment?.caretakerId?.fullName || null,
                assignedCaretakerAvatar: assignment?.caretakerId?.avatarUrl || null,
                medicationCount: medications,
                adherenceRate,
                lastCallDate: lastCall?.scheduledTime || null,
                status: patient.isActive ? (assignment ? 'active' : 'unassigned') : 'inactive',
            };
        }));

        res.json({
            patients: enriched,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get patients error:', error);
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 6. GET /api/org/analytics/adherence — Weekly adherence trends
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/adherence', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const weeks = parseInt(req.query.weeks) || 8;
        const startDate = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

        // Weekly adherence trend
        const weeklyAdherence = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: startDate },
                    status: { $in: ['completed', 'missed', 'no_answer'] },
                },
            },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-W%V', date: '$scheduledTime' } },
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                },
            },
            {
                $project: {
                    week: '$_id',
                    adherenceRate: { $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 1] },
                    totalConfirmations: '$total',
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Top and bottom adherence patients
        const patientAdherence = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: startDate },
                    status: { $in: ['completed', 'missed', 'no_answer'] },
                },
            },
            { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: '$patientId',
                    total: { $sum: 1 },
                    confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
                },
            },
            {
                $project: {
                    adherenceRate: { $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 1] },
                    totalConfirmations: '$total',
                },
            },
            { $sort: { adherenceRate: -1 } },
        ]);

        // Look up patient names
        const patientIds = patientAdherence.map(p => p._id);
        const patientProfiles = await Profile.find({ _id: { $in: patientIds } }, 'fullName avatarUrl').lean();
        const profileMap = Object.fromEntries(patientProfiles.map(p => [p._id.toString(), p]));

        const enrichedPatients = patientAdherence.map(p => ({
            patientId: p._id,
            name: profileMap[p._id.toString()]?.fullName || 'Unknown',
            avatarUrl: profileMap[p._id.toString()]?.avatarUrl || null,
            adherenceRate: p.adherenceRate,
        }));

        res.json({
            weeklyAdherence,
            topPatients: enrichedPatients.slice(0, 5),
            bottomPatients: enrichedPatients.slice(-5).reverse(),
            overallRate: enrichedPatients.length
                ? Math.round(enrichedPatients.reduce((s, p) => s + p.adherenceRate, 0) / enrichedPatients.length)
                : 0,
        });
    } catch (error) {
        console.error('Org adherence analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch adherence analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 7. GET /api/org/analytics/calls — Call stats
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/calls', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Daily call breakdown
        const dailyCalls = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                    avgDuration: { $avg: { $cond: [{ $gt: ['$duration', 0] }, '$duration', null] } },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Calls by caretaker
        const callsByCaretaker = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: '$caretakerId',
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                    avgDuration: { $avg: '$duration' },
                },
            },
            {
                $lookup: {
                    from: 'profiles',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'caretaker',
                },
            },
            { $unwind: '$caretaker' },
            {
                $project: {
                    caretakerName: '$caretaker.fullName',
                    total: 1,
                    completed: 1,
                    missed: 1,
                    completionRate: { $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 1] },
                    avgDuration: { $round: ['$avgDuration', 0] },
                },
            },
            { $sort: { completionRate: -1 } },
        ]);

        // Calls by outcome
        const callsByOutcome = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: '$outcome',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ]);

        // Peak hours analysis
        const peakHours = await CallLog.aggregate([
            {
                $match: {
                    organizationId: new mongoose.Types.ObjectId(orgId),
                    scheduledTime: { $gte: startDate },
                    status: 'completed',
                },
            },
            {
                $group: {
                    _id: { $hour: '$scheduledTime' },
                    count: { $sum: 1 },
                    avgDuration: { $avg: '$duration' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            dailyCalls,
            callsByCaretaker,
            callsByOutcome,
            peakHours: peakHours.map(h => ({ hour: h._id, count: h.count, avgDuration: Math.round(h.avgDuration || 0) })),
        });
    } catch (error) {
        console.error('Org call analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch call analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 8. GET /api/org/billing/subscription — Subscription details
// ═══════════════════════════════════════════════════════════════
router.get('/billing/subscription', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const org = await Organization.findById(orgId)
            .select('name subscriptionPlan maxPatients currentPatientCount currentCaretakerCount billing settings')
            .lean();

        if (!org) return res.status(404).json({ error: 'Organization not found' });

        // Real-time usage counts
        const [patientCount, caretakerCount, managerCount] = await Promise.all([
            Profile.countDocuments({ organizationId: orgId, role: 'patient', isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: { $in: ['caretaker', 'caller'] }, isActive: true }),
            Profile.countDocuments({ organizationId: orgId, role: 'care_manager', isActive: true }),
        ]);

        // Current month invoice
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const currentInvoice = await Invoice.findOne({
            organizationId: orgId,
            'billingPeriod.startDate': { $lte: new Date() },
            'billingPeriod.endDate': { $gte: startOfMonth },
        }).lean();

        res.json({
            subscription: {
                plan: org.subscriptionPlan,
                maxPatients: org.maxPatients,
                features: getPlanFeatures(org.subscriptionPlan),
            },
            usage: {
                patients: patientCount,
                caretakers: caretakerCount,
                careManagers: managerCount,
                patientUtilization: org.maxPatients > 0 ? Math.round((patientCount / org.maxPatients) * 100) : 0,
            },
            billing: {
                ...org.billing,
                currentInvoice: currentInvoice ? {
                    invoiceNumber: currentInvoice.invoiceNumber,
                    total: currentInvoice.total,
                    status: currentInvoice.status,
                    dueDate: currentInvoice.dueDate,
                } : null,
            },
        });
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription details' });
    }
});

function getPlanFeatures(plan) {
    const features = {
        starter: { maxPatients: 100, maxCaretakers: 10, analytics: 'basic', support: 'email', compliance: false },
        professional: { maxPatients: 500, maxCaretakers: 50, analytics: 'advanced', support: 'priority', compliance: true },
        enterprise: { maxPatients: 10000, maxCaretakers: 500, analytics: 'full', support: '24/7', compliance: true },
    };
    return features[plan] || features.starter;
}

// ═══════════════════════════════════════════════════════════════
// 9. GET /api/org/billing/invoices — Invoice history
// ═══════════════════════════════════════════════════════════════
router.get('/billing/invoices', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { page, limit, skip } = parsePagination(req.query);
        const filter = { organizationId: orgId };

        if (req.query.status) filter.status = req.query.status;
        if (req.query.year) {
            const year = parseInt(req.query.year);
            filter.createdAt = {
                $gte: new Date(year, 0, 1),
                $lt: new Date(year + 1, 0, 1),
            };
        }

        const [invoices, total] = await Promise.all([
            Invoice.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Invoice.countDocuments(filter),
        ]);

        // Summary stats
        const summary = await Invoice.aggregate([
            { $match: { organizationId: new mongoose.Types.ObjectId(orgId) } },
            {
                $group: {
                    _id: '$status',
                    total: { $sum: '$total' },
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            invoices,
            summary: Object.fromEntries(summary.map(s => [s._id, { total: s.total, count: s.count }])),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 10. GET /api/org/audit-logs — Audit logs (org-scoped)
// ═══════════════════════════════════════════════════════════════
router.get('/audit-logs', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const { page, limit, skip } = parsePagination(req.query);

        // Get all users in the org
        const orgProfiles = await Profile.find({ organizationId: orgId })
            .select('supabaseUid fullName email role')
            .lean();
        const orgUids = orgProfiles.map(p => p.supabaseUid);
        const profileMap = Object.fromEntries(orgProfiles.map(p => [p.supabaseUid, p]));

        const filter = { supabaseUid: { $in: orgUids } };

        if (req.query.action) filter.action = req.query.action;
        if (req.query.resourceType) filter.resourceType = req.query.resourceType;
        if (req.query.outcome) filter.outcome = req.query.outcome;
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

        const enrichedLogs = logs.map(log => ({
            ...log,
            user: profileMap[log.supabaseUid] || { fullName: 'Unknown', email: null },
            timeAgo: getTimeAgo(log.createdAt),
        }));

        res.json({
            auditLogs: enrichedLogs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 11. PUT /api/org/settings — Update org settings
// ═══════════════════════════════════════════════════════════════
router.put('/settings', async (req, res) => {
    try {
        const orgId = getOrgId(req);
        const org = await Organization.findById(orgId);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const previousValues = {};
        const newValues = {};

        // Allowed fields for org admin to update
        const allowedUpdates = ['phone', 'email', 'address', 'settings'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                previousValues[field] = org[field];
                newValues[field] = req.body[field];
                if (field === 'settings') {
                    // Merge settings instead of replacing
                    org.settings = { ...org.settings.toObject?.() || org.settings, ...req.body.settings };
                } else {
                    org[field] = req.body[field];
                }
            }
        });

        if (Object.keys(newValues).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        await org.save();

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'update_organization_settings',
            resourceType: 'organization',
            resourceId: org._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            previousValues,
            newValues,
            details: { organizationName: org.name },
        });

        res.json({
            message: 'Organization settings updated successfully',
            organization: org,
        });
    } catch (error) {
        console.error('Update settings error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Validation error', details: Object.values(error.errors).map(e => e.message) });
        }
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
