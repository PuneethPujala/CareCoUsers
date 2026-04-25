const express = require('express');
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Medication = require('../models/Medication');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CaretakerPatient = require('../models/CaretakerPatient');
const { reconcileUnassignedPatients } = require('../services/reconciliationService');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// ── All routes require care_manager (or higher) ─────────────
router.use(authenticate, requireRole('care_manager', 'org_admin', 'super_admin'));

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

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

/**
 * Returns the set of caretaker IDs managed by this care manager.
 * Used to scope all downstream queries (patients, calls, etc.)
 */
async function getManagedCaretakerIds(managerId) {
    const caretakers = await Profile.find({
        managedBy: managerId,
        role: { $in: ['caretaker', 'caller'] },
        isActive: true,
    }).select('_id').lean();
    return caretakers.map(c => c._id);
}

/**
 * Returns patient IDs reachable through managed caretakers.
 */
async function getManagedPatientIds(managerId) {
    const caretakerIds = await getManagedCaretakerIds(managerId);
    const assignments = await CaretakerPatient.find({
        caretakerId: { $in: caretakerIds },
        status: 'active',
    }).select('patientId').lean();
    return [...new Set(assignments.map(a => a.patientId.toString()))].map(id => new mongoose.Types.ObjectId(id));
}

// ═══════════════════════════════════════════════════════════════
// 1. GET /api/manager/dashboard — Operations KPIs
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;

        const caretakerIds = await getManagedCaretakerIds(managerId);
        const patientIds = await getManagedPatientIds(managerId);

        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        const [
            totalCaretakers,
            totalPatients,
            callsToday,
            completedCallsToday,
            missedCallsToday,
            pendingCallsToday,
            openEscalations,
            criticalEscalations,
            activeMedications,
        ] = await Promise.all([
            caretakerIds.length,
            patientIds.length,
            CallLog.countDocuments({ caretakerId: { $in: caretakerIds }, scheduledTime: { $gte: startOfToday, $lte: endOfToday } }),
            CallLog.countDocuments({ caretakerId: { $in: caretakerIds }, scheduledTime: { $gte: startOfToday, $lte: endOfToday }, status: 'completed' }),
            CallLog.countDocuments({ caretakerId: { $in: caretakerIds }, scheduledTime: { $gte: startOfToday, $lte: endOfToday }, status: { $in: ['missed', 'no_answer'] } }),
            CallLog.countDocuments({ caretakerId: { $in: caretakerIds }, scheduledTime: { $gte: startOfToday, $lte: endOfToday }, status: 'scheduled' }),
            Escalation.countDocuments({
                $or: [{ assignedTo: managerId }, { caretakerId: { $in: caretakerIds } }],
                status: { $in: ['open', 'acknowledged', 'in_progress'] },
            }),
            Escalation.countDocuments({
                $or: [{ assignedTo: managerId }, { caretakerId: { $in: caretakerIds } }],
                priority: 'critical',
                status: { $in: ['open', 'acknowledged', 'in_progress'] },
            }),
            Medication.countDocuments({ patientId: { $in: patientIds }, isActive: true }),
        ]);

        // Team adherence (30 days)
        const adherenceResult = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: { $in: caretakerIds },
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
        const teamAdherence = adherenceResult.length
            ? Math.round((adherenceResult[0].confirmed / adherenceResult[0].total) * 100)
            : 0;

        // Caretaker performance summary
        const caretakerPerformance = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: { $in: caretakerIds },
                    scheduledTime: { $gte: thirtyDaysAgo },
                },
            },
            {
                $group: {
                    _id: '$caretakerId',
                    totalCalls: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    avgDuration: { $avg: '$duration' },
                    avgRating: { $avg: '$callQuality.rating' },
                },
            },
            {
                $lookup: {
                    from: 'profiles',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'profile',
                },
            },
            { $unwind: '$profile' },
            {
                $project: {
                    id: '$_id',
                    name: '$profile.fullName',
                    avatarUrl: '$profile.avatarUrl',
                    totalCalls: 1,
                    completed: 1,
                    completionRate: {
                        $round: [{ $multiply: [{ $divide: ['$completed', { $max: ['$totalCalls', 1] }] }, 100] }, 0],
                    },
                    avgDuration: { $round: [{ $ifNull: ['$avgDuration', 0] }, 0] },
                    avgRating: { $round: [{ $ifNull: ['$avgRating', 0] }, 1] },
                },
            },
            { $sort: { completionRate: -1 } },
        ]);

        // Recent activity (from managed scope)
        const managedUids = await Profile.find({ _id: { $in: [...caretakerIds, managerId] } })
            .select('supabaseUid').lean();
        const uids = managedUids.map(p => p.supabaseUid);
        const recentActivity = await AuditLog.find({ supabaseUid: { $in: uids } })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // ── Slot Prediction Analysis ──
        const Patient = require('../models/Patient');
        const MAX_PATIENTS_PER_CALLER = 25; // configurable cap

        // Total patients in org (from both Patient and Profile collections)
        const [orgPatientCount, orgProfilePatientCount] = await Promise.all([
            Patient.countDocuments({ organization_id: orgId, is_active: true }),
            Profile.countDocuments({ organizationId: orgId, role: 'patient', isActive: { $ne: false } }),
        ]);
        const totalOrgPatients = Math.max(orgPatientCount, orgProfilePatientCount);

        // Active callers in org
        const activeCallers = await Profile.countDocuments({
            organizationId: orgId,
            role: { $in: ['caller', 'caretaker'] },
            isActive: { $ne: false },
        });

        // Unassigned patients
        const assignedPatientIds = await CaretakerPatient.distinct('patientId', { status: 'active' });
        const unassignedCount = totalOrgPatients - assignedPatientIds.length;

        // Total capacity and available slots
        const totalCapacity = activeCallers * MAX_PATIENTS_PER_CALLER;
        const availableSlots = Math.max(0, totalCapacity - assignedPatientIds.length);

        // Patient growth rate (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newPatientsLast7Days = await Patient.countDocuments({
            organization_id: orgId,
            created_at: { $gte: sevenDaysAgo },
        });
        const dailyGrowthRate = newPatientsLast7Days / 7;

        // Predict days until slots fill
        let daysUntilFull = null;
        if (dailyGrowthRate > 0 && availableSlots > 0) {
            daysUntilFull = Math.ceil(availableSlots / dailyGrowthRate);
        } else if (availableSlots <= 0) {
            daysUntilFull = 0; // already full
        }

        // Hiring recommendation
        const needsHiring = availableSlots <= 0 || (daysUntilFull !== null && daysUntilFull <= 14);

        const slotPrediction = {
            totalPatients: totalOrgPatients,
            activeCallers,
            maxPatientsPerCaller: MAX_PATIENTS_PER_CALLER,
            totalCapacity,
            assignedPatients: assignedPatientIds.length,
            unassignedPatients: Math.max(0, unassignedCount),
            availableSlots,
            newPatientsLast7Days,
            dailyGrowthRate: Math.round(dailyGrowthRate * 10) / 10,
            daysUntilFull,
            needsHiring,
            recommendation: needsHiring
                ? (availableSlots <= 0
                    ? '⚠️ All caller slots are full. Hire new callers immediately!'
                    : `⏳ Slots will fill in ~${daysUntilFull} days at current growth rate. Consider hiring soon.`)
                : '✅ Sufficient caller capacity available.',
        };

        res.json({
            stats: {
                caretakers: totalCaretakers,
                patients: totalPatients,
                adherence: teamAdherence,
                medications: activeMedications,
                calls: {
                    today: { total: callsToday, completed: completedCallsToday, missed: missedCallsToday, pending: pendingCallsToday },
                    completionRate: callsToday > 0 ? Math.round((completedCallsToday / callsToday) * 100) : 0,
                },
                escalations: { open: openEscalations, critical: criticalEscalations },
            },
            slotPrediction,
            performers: caretakerPerformance,
            recentActivity: recentActivity.map(log => ({
                id: log._id,
                action: log.action,
                resourceType: log.resourceType,
                time: getTimeAgo(log.createdAt),
            })),
        });
    } catch (error) {
        console.error('Manager dashboard error:', error);
        res.status(500).json({ error: 'Failed to load manager dashboard' });
    }
});

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 1b. POST /api/manager/reconcile — Continuous Round-Robin Reconciliation
// Auto-assigns ALL unassigned patients in the org to available callers
// ═══════════════════════════════════════════════════════════════
router.post('/reconcile', async (req, res) => {
    try {
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const result = await reconcileUnassignedPatients(orgId, req.profile._id);
        res.json(result);
    } catch (error) {
        console.error('Reconciliation error:', error);
        res.status(500).json({ error: 'Reconciliation failed', details: error.message });
    }
});
// 2. GET /api/manager/alerts — Escalations assigned to me
// ═══════════════════════════════════════════════════════════════
router.get('/alerts', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const caretakerIds = await getManagedCaretakerIds(managerId);
        const { page, limit, skip } = parsePagination(req.query);

        const filter = {
            $or: [
                { assignedTo: managerId },
                { caretakerId: { $in: caretakerIds }, assignedTo: null },
            ],
        };

        if (req.query.priority) filter.priority = req.query.priority;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.status) {
            filter.status = req.query.status;
        } else {
            filter.status = { $in: ['open', 'acknowledged', 'in_progress', 'escalated'] };
        }

        const [alerts, total] = await Promise.all([
            Escalation.find(filter)
                .populate('patientId', 'fullName avatarUrl phone')
                .populate('caretakerId', 'fullName avatarUrl')
                .populate('relatedCallLogId', 'scheduledTime status outcome')
                .populate('relatedMedicationId', 'name dosage')
                .sort({ priority: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Escalation.countDocuments(filter),
        ]);

        // Summary counts
        const [openCount, highCount, breachedCount] = await Promise.all([
            Escalation.countDocuments({ ...filter, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Escalation.countDocuments({ ...filter, priority: { $in: ['high', 'critical'] }, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Escalation.countDocuments({ ...filter, slaBreached: true, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
        ]);

        res.json({
            alerts: alerts.map(a => ({
                ...a,
                timeAgo: getTimeAgo(a.createdAt),
                responseTime: a.history?.length
                    ? (() => {
                        const ack = a.history.find(h => h.toStatus === 'acknowledged');
                        return ack ? Math.round((new Date(ack.changedAt) - new Date(a.createdAt)) / 60000) : null;
                    })()
                    : null,
            })),
            summary: { open: openCount, highPriority: highCount, slaBreached: breachedCount },
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Manager alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. GET /api/manager/call-queue — Today's calls (supervised)
// ═══════════════════════════════════════════════════════════════
router.get('/call-queue', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const caretakerIds = await getManagedCaretakerIds(managerId);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Allow querying a specific date
        const queryDate = req.query.date ? new Date(req.query.date) : null;
        const dayStart = queryDate || startOfDay;
        const dayEnd = queryDate
            ? new Date(new Date(req.query.date).setHours(23, 59, 59, 999))
            : endOfDay;

        const filter = {
            caretakerId: { $in: caretakerIds },
            scheduledTime: { $gte: dayStart, $lte: dayEnd },
        };

        if (req.query.status) filter.status = req.query.status;
        if (req.query.priority) filter.priority = req.query.priority;
        if (req.query.caretakerId && caretakerIds.some(id => id.equals(req.query.caretakerId))) {
            filter.caretakerId = new mongoose.Types.ObjectId(req.query.caretakerId);
        }

        const calls = await CallLog.find(filter)
            .populate('patientId', 'fullName avatarUrl phone dateOfBirth')
            .populate('caretakerId', 'fullName avatarUrl')
            .sort({ scheduledTime: 1 })
            .lean();

        // Enrich with medication count per call
        const enriched = calls.map(call => ({
            ...call,
            durationFormatted: call.duration ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')}` : null,
            medicationCount: call.medicationConfirmations?.length || 0,
            confirmedCount: call.medicationConfirmations?.filter(m => m.confirmed).length || 0,
            isOverdue: call.status === 'scheduled' && new Date(call.scheduledTime) < new Date(),
        }));

        // Group by status for dashboard
        const statusSummary = {
            scheduled: enriched.filter(c => c.status === 'scheduled').length,
            in_progress: enriched.filter(c => c.status === 'in_progress').length,
            completed: enriched.filter(c => c.status === 'completed').length,
            missed: enriched.filter(c => ['missed', 'no_answer'].includes(c.status)).length,
            overdue: enriched.filter(c => c.isOverdue).length,
        };

        // Group by caretaker for workload view
        const byCaretaker = {};
        enriched.forEach(call => {
            const ctId = call.caretakerId?._id?.toString() || 'unassigned';
            if (!byCaretaker[ctId]) {
                byCaretaker[ctId] = {
                    caretaker: call.caretakerId,
                    calls: [],
                    completed: 0,
                    total: 0,
                };
            }
            byCaretaker[ctId].calls.push(call);
            byCaretaker[ctId].total++;
            if (call.status === 'completed') byCaretaker[ctId].completed++;
        });

        res.json({
            calls: enriched,
            statusSummary,
            byCaretaker: Object.values(byCaretaker),
            total: enriched.length,
        });
    } catch (error) {
        console.error('Manager call queue error:', error);
        res.status(500).json({ error: 'Failed to fetch call queue' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 4. GET /api/manager/caretakers — My supervised caretakers
// ═══════════════════════════════════════════════════════════════
router.get('/caretakers', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const { page, limit, skip } = parsePagination(req.query);

        const filter = {
            managedBy: managerId,
            role: { $in: ['caretaker', 'caller'] },
            isActive: true,
        };

        if (req.query.search) {
            filter.$or = [
                { fullName: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }

        const [caretakers, total] = await Promise.all([
            Profile.find(filter)
                .select('fullName email phone avatarUrl languages hireDate lastLoginAt')
                .sort({ fullName: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Profile.countDocuments(filter),
        ]);

        // Enrich with real-time metrics
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const enriched = await Promise.all(caretakers.map(async (ct) => {
            const [
                assignedPatients,
                performance,
                callsScheduled,
                callsCompleted,
                activeCall,
                openAlerts,
            ] = await Promise.all([
                CaretakerPatient.countDocuments({ caretakerId: ct._id, status: 'active' }),
                CallLog.getCaretakerPerformance(ct._id, 30),
                CallLog.countDocuments({ caretakerId: ct._id, scheduledTime: { $gte: startOfToday, $lte: endOfToday } }),
                CallLog.countDocuments({ caretakerId: ct._id, scheduledTime: { $gte: startOfToday, $lte: endOfToday }, status: 'completed' }),
                CallLog.findOne({ caretakerId: ct._id, status: 'in_progress' }).lean(),
                Escalation.countDocuments({ caretakerId: ct._id, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            ]);

            let status = 'available';
            if (activeCall) status = 'on_call';

            return {
                ...ct,
                assignedPatients,
                performanceScore: performance.completionRate,
                avgCallDuration: performance.avgDuration,
                avgRating: performance.avgRating,
                callsScheduledToday: callsScheduled,
                callsCompletedToday: callsCompleted,
                openAlerts,
                status,
            };
        }));

        res.json({
            caretakers: enriched,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Manager caretakers error:', error);
        res.status(500).json({ error: 'Failed to fetch caretakers' });
    }
});

// ═══════════════════════════════════════════════════════════════
// NEW: DELETE /api/manager/caretakers/:id — Soft-delete caller
// ═══════════════════════════════════════════════════════════════
router.delete('/caretakers/:id', async (req, res) => {
    try {
        const callerId = req.params.id;
        const managerId = req.profile._id;
        const orgId = req.profile.organizationId;

        if (!mongoose.Types.ObjectId.isValid(callerId)) {
            return res.status(400).json({ error: 'Invalid caller ID' });
        }

        const caller = await Profile.findOne({
            _id: callerId,
            organizationId: orgId,
            role: { $in: ['caller', 'caretaker'] }
        });

        if (!caller) return res.status(404).json({ error: 'Caller not found or access denied.' });
        if (!caller.isActive && caller.fullName.includes('[Deleted]')) return res.status(400).json({ error: 'Caller is already deleted.' });

        const assignments = await CaretakerPatient.find({ caretakerId: callerId, status: 'active' });
        const patientIds = assignments.map(a => a.patientId);

        await CaretakerPatient.updateMany(
            { caretakerId: callerId },
            { $set: { status: 'terminated' } }
        );

        await Profile.updateMany({ _id: { $in: patientIds } }, { $unset: { caller_id: 1, assigned_caller_id: 1 } });
        try {
            await mongoose.model('Patient').updateMany(
                { _id: { $in: patientIds } },
                { $unset: { caller_id: 1, assigned_caller_id: 1 } }
            );
        } catch (e) { }

        caller.isActive = false;
        caller.fullName = `${caller.fullName} [Deleted]`;
        await caller.save();

        const reconResult = await reconcileUnassignedPatients(orgId, managerId);

        if (reconResult.remaining > 0) {
            await Notification.create({
                recipientId: managerId,
                title: '⚠️ Critical Caller Shortage',
                body: `You deleted a caller, and ${reconResult.remaining} patients could not be reassigned. Please hire/add more callers immediately.`,
                type: 'system_announcement',
                isRead: false
            });
        }

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'delete_caller',
            resourceType: 'profile',
            resourceId: caller._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: { strandedPatients: patientIds.length, reallocated: reconResult.assigned }
        });

        res.json({
            message: 'Caller successfully removed. Reallocation algorithm triggered.',
            patientsStranded: patientIds.length,
            patientsReallocated: reconResult.assigned,
            shortageWarning: reconResult.remaining > 0
        });

    } catch (error) {
        console.error('Delete caller error:', error);
        res.status(500).json({ error: 'Failed to process caller deletion workflow.' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. GET /api/manager/patients — Patients under supervision
// ═══════════════════════════════════════════════════════════════
router.get('/patients', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const { page, limit, skip } = parsePagination(req.query);

        const patientIds = await getManagedPatientIds(managerId);

        const filter = { _id: { $in: patientIds }, role: 'patient', isActive: true };

        if (req.query.search) {
            filter.$or = [
                { fullName: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ];
        }

        const [patients, total] = await Promise.all([
            Profile.find(filter)
                .select('fullName email phone avatarUrl dateOfBirth gender allergies conditions emergencyContact createdAt')
                .sort({ fullName: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Profile.countDocuments(filter),
        ]);

        const enriched = await Promise.all(patients.map(async (patient) => {
            const [assignment, medCount, adherenceRate, currentStreak, lastCall] = await Promise.all([
                CaretakerPatient.findOne({ patientId: patient._id, status: 'active' })
                    .populate('caretakerId', 'fullName avatarUrl')
                    .lean(),
                Medication.countDocuments({ patientId: patient._id, isActive: true }),
                CallLog.calculateAdherenceRate(patient._id, 30),
                CallLog.calculateCurrentStreak(patient._id),
                CallLog.findOne({ patientId: patient._id, status: 'completed' })
                    .sort({ scheduledTime: -1 })
                    .select('scheduledTime')
                    .lean(),
            ]);

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
                assignedCaretakerId: assignment?.caretakerId?._id || null,
                assignedCaretakerAvatar: assignment?.caretakerId?.avatarUrl || null,
                medicationCount: medCount,
                adherenceRate,
                currentStreak,
                lastCallDate: lastCall?.scheduledTime || null,
                status: patient.isActive ? (assignment ? 'active' : 'unassigned') : 'inactive',
            };
        }));

        res.json({
            patients: enriched,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Manager patients error:', error);
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 6. POST /api/manager/patients/assign — Assign patient to caretaker
// ═══════════════════════════════════════════════════════════════
router.post('/patients/assign', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const { patientId, caretakerId, priority, careInstructions, schedule } = req.body;

        if (!patientId || !caretakerId) {
            return res.status(400).json({ error: 'patientId and caretakerId are required' });
        }

        // Validate both exist and are in the same org
        const caretaker = await Profile.findById(caretakerId);
        // Try Profile first, then Patient collection
        let patient = await Profile.findById(patientId);
        if (!patient) {
            const Patient = require('../models/Patient');
            const patientDoc = await Patient.findById(patientId);
            if (patientDoc) {
                patient = { _id: patientDoc._id, role: 'patient', name: patientDoc.name };
            }
        }

        if (!patient || (patient.role !== 'patient')) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        if (!caretaker || !['caretaker', 'caller'].includes(caretaker.role)) {
            return res.status(404).json({ error: 'Caretaker not found' });
        }

        // Verify caretaker is managed by this manager
        const caretakerIds = await getManagedCaretakerIds(managerId);
        if (!caretakerIds.some(id => id.equals(caretaker._id))) {
            return res.status(403).json({ error: 'You can only assign patients to caretakers you manage' });
        }

        // Check for existing active assignment
        const existing = await CaretakerPatient.findOne({
            patientId,
            status: 'active',
        });
        if (existing) {
            return res.status(409).json({
                error: 'Patient already has an active caretaker assignment',
                currentCaretaker: existing.caretakerId,
            });
        }

        const assignment = await CaretakerPatient.create({
            caretakerId,
            patientId,
            careManagerId: managerId,
            assignedBy: managerId,
            status: 'active',
            priority: priority || 5,
            careInstructions: careInstructions || '',
            schedule: schedule || { startDate: new Date() },
        });

        // Mirror assignments directly onto the Profile and Patient documents for User App compatability!
        await Profile.findByIdAndUpdate(patientId, {
            caller_id: caretakerId,
            assigned_caller_id: caretakerId,
            care_manager_id: managerId,
            assigned_manager_id: managerId
        });
        try {
            await mongoose.model('Patient').updateOne(
                { _id: patientId },
                { $set: { caller_id: caretakerId, assigned_caller_id: caretakerId, care_manager_id: managerId, assigned_manager_id: managerId } }
            );
        } catch (e) {
            // Patient model fallback ignoring
        }

        // Notify caretaker
        await Notification.create({
            recipientId: caretakerId,
            senderId: managerId,
            organizationId: orgId,
            type: 'assignment_change',
            channel: 'in_app',
            title: 'New Patient Assigned',
            body: `${patient.fullName} has been assigned to you by ${req.profile.fullName}.`,
            priority: 'high',
            data: { screen: 'PatientDetail', patientId },
            relatedEntityType: 'profile',
            relatedEntityId: patientId,
        });

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'assign_patient',
            resourceType: 'patient',
            resourceId: patientId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: {
                patientName: patient.fullName,
                caretakerName: caretaker.fullName,
                assignedBy: req.profile.fullName,
            },
        });

        res.status(201).json({
            message: 'Patient assigned successfully',
            assignment,
        });
    } catch (error) {
        console.error('Assign patient error:', error);
        res.status(500).json({ error: 'Failed to assign patient' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 7. PUT /api/manager/patients/:id/reassign — Reassign patient
// ═══════════════════════════════════════════════════════════════
router.put('/patients/:id/reassign', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const patientId = req.params.id;
        const { newCaretakerId, reason } = req.body;

        if (!newCaretakerId) {
            return res.status(400).json({ error: 'newCaretakerId is required' });
        }

        // Validate patient exists (try Profile first, then Patient collection)
        let patient = await Profile.findById(patientId);
        if (!patient) {
            const Patient = require('../models/Patient');
            const patientDoc = await Patient.findById(patientId);
            if (patientDoc) {
                patient = { _id: patientDoc._id, role: 'patient', name: patientDoc.name };
            }
        }
        if (!patient || patient.role !== 'patient') {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Validate new caretaker
        const newCaretaker = await Profile.findById(newCaretakerId);
        if (!newCaretaker || !['caretaker', 'caller'].includes(newCaretaker.role)) {
            return res.status(404).json({ error: 'New caretaker not found' });
        }

        // Verify new caretaker is managed by this manager
        const caretakerIds = await getManagedCaretakerIds(managerId);
        if (!caretakerIds.some(id => id.equals(newCaretaker._id))) {
            return res.status(403).json({ error: 'You can only reassign to caretakers you manage' });
        }

        // Deactivate current assignment
        const currentAssignment = await CaretakerPatient.findOne({ patientId, status: 'active' });
        const previousCaretakerId = currentAssignment?.caretakerId;

        if (currentAssignment) {
            currentAssignment.status = 'terminated';
            currentAssignment.notes.push({
                content: `Reassigned to ${newCaretaker.fullName}. Reason: ${reason || 'N/A'}`,
                addedBy: managerId,
                isPrivate: true,
            });
            await currentAssignment.save();
        }

        // Create new assignment
        const newAssignment = await CaretakerPatient.create({
            caretakerId: newCaretakerId,
            patientId,
            careManagerId: managerId,
            assignedBy: managerId,
            status: 'active',
            schedule: { startDate: new Date() },
            careInstructions: currentAssignment?.careInstructions || '',
        });

        // Mirror re-assignments directly onto the Profile and Patient documents for User App compatability!
        await Profile.findByIdAndUpdate(patientId, {
            caller_id: newCaretakerId,
            assigned_caller_id: newCaretakerId,
            care_manager_id: managerId,
            assigned_manager_id: managerId
        });
        try {
            await mongoose.model('Patient').updateOne(
                { _id: patientId },
                { $set: { caller_id: newCaretakerId, assigned_caller_id: newCaretakerId, care_manager_id: managerId, assigned_manager_id: managerId } }
            );
        } catch (e) {
            // Patient model fallback ignoring
        }

        // Notify both caretakers
        const notifications = [
            {
                recipientId: newCaretakerId,
                senderId: managerId,
                organizationId: orgId,
                type: 'assignment_change',
                channel: 'in_app',
                title: 'New Patient Assigned',
                body: `${patient.fullName} has been reassigned to you.`,
                priority: 'high',
                data: { screen: 'PatientDetail', patientId },
            },
        ];
        if (previousCaretakerId) {
            notifications.push({
                recipientId: previousCaretakerId,
                senderId: managerId,
                organizationId: orgId,
                type: 'assignment_change',
                channel: 'in_app',
                title: 'Patient Reassigned',
                body: `${patient.fullName} has been reassigned to another caretaker.`,
                priority: 'normal',
                data: { screen: 'Dashboard' },
            });
        }
        await Notification.createBulk(notifications);

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'reassign_patient',
            resourceType: 'patient',
            resourceId: patientId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            previousValues: { caretakerId: previousCaretakerId },
            newValues: { caretakerId: newCaretakerId },
            details: { patientName: patient.fullName, reason },
        });

        res.json({
            message: 'Patient reassigned successfully',
            assignment: newAssignment,
        });
    } catch (error) {
        console.error('Reassign patient error:', error);
        res.status(500).json({ error: 'Failed to reassign patient' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 8. GET /api/manager/medications — All medications (supervised)
// ═══════════════════════════════════════════════════════════════
router.get('/medications', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const { page, limit, skip } = parsePagination(req.query);

        const patientIds = await getManagedPatientIds(managerId);
        const filter = { patientId: { $in: patientIds } };

        if (req.query.status) filter.status = req.query.status;
        else filter.isActive = true;

        if (req.query.patientId) {
            if (patientIds.some(id => id.equals(req.query.patientId))) {
                filter.patientId = new mongoose.Types.ObjectId(req.query.patientId);
            } else {
                return res.status(403).json({ error: 'Patient not in your scope' });
            }
        }

        if (req.query.search) {
            filter.name = { $regex: req.query.search, $options: 'i' };
        }

        const [medications, total] = await Promise.all([
            Medication.find(filter)
                .populate('patientId', 'fullName avatarUrl')
                .sort({ patientId: 1, name: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Medication.countDocuments(filter),
        ]);

        // Refill alerts
        const needingRefill = await Medication.countDocuments({
            patientId: { $in: patientIds },
            isActive: true,
            'refillInfo.nextRefillDate': { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        });

        res.json({
            medications,
            refillAlerts: needingRefill,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Manager medications error:', error);
        res.status(500).json({ error: 'Failed to fetch medications' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 9. POST /api/manager/medications — Add medication
// ═══════════════════════════════════════════════════════════════
router.post('/medications', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const {
            patientId, name, genericName, dosage, route, frequency,
            scheduledTimes, daysOfWeek, withFood, instructions,
            prescribedBy, prescribedDate, startDate, endDate,
            sideEffects, interactions,
        } = req.body;

        if (!patientId || !name || !dosage || !frequency) {
            return res.status(400).json({ error: 'patientId, name, dosage, and frequency are required' });
        }

        // Verify patient is in manager's scope
        const patientIds = await getManagedPatientIds(managerId);
        if (!patientIds.some(id => id.equals(patientId))) {
            return res.status(403).json({ error: 'Patient not in your scope' });
        }

        const medication = await Medication.create({
            patientId,
            organizationId: orgId,
            name,
            genericName,
            dosage,
            route: route || 'oral',
            frequency,
            scheduledTimes: scheduledTimes || [],
            daysOfWeek: daysOfWeek || [],
            withFood: withFood || false,
            instructions,
            prescribedBy,
            prescribedDate,
            startDate: startDate || new Date(),
            endDate,
            sideEffects: sideEffects || [],
            interactions: interactions || [],
            addedBy: managerId,
        });

        // Notify assigned caretaker
        const assignment = await CaretakerPatient.findOne({ patientId, status: 'active' });
        if (assignment) {
            const patient = await Profile.findById(patientId).select('fullName').lean();
            await Notification.create({
                recipientId: assignment.caretakerId,
                senderId: managerId,
                organizationId: orgId,
                type: 'medication_alert',
                channel: 'in_app',
                title: 'New Medication Added',
                body: `${name} ${dosage} has been added for ${patient?.fullName || 'a patient'}.`,
                priority: 'high',
                data: { screen: 'PatientDetail', patientId },
                relatedEntityType: 'medication',
                relatedEntityId: medication._id,
            });
        }

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'create_medication',
            resourceType: 'medication',
            resourceId: medication._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: { medicationName: name, dosage, patientId },
        });

        res.status(201).json({ medication });
    } catch (error) {
        console.error('Create medication error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Validation error', details: Object.values(error.errors).map(e => e.message) });
        }
        res.status(500).json({ error: 'Failed to create medication' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 10. PUT /api/manager/medications/:id — Update medication
// ═══════════════════════════════════════════════════════════════
router.put('/medications/:id', async (req, res) => {
    try {
        const managerId = req.profile._id;

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid medication ID' });
        }

        const medication = await Medication.findById(req.params.id);
        if (!medication) {
            return res.status(404).json({ error: 'Medication not found' });
        }

        // Verify patient is in manager's scope
        const patientIds = await getManagedPatientIds(managerId);
        if (!patientIds.some(id => id.equals(medication.patientId))) {
            return res.status(403).json({ error: 'Medication not in your scope' });
        }

        const allowedUpdates = [
            'name', 'genericName', 'dosage', 'route', 'frequency',
            'scheduledTimes', 'daysOfWeek', 'withFood', 'instructions',
            'prescribedBy', 'prescribedDate', 'startDate', 'endDate',
            'status', 'sideEffects', 'interactions', 'notes',
            'refillInfo', 'discontinuedReason',
        ];

        const previousValues = {};
        const newValues = {};

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                previousValues[field] = medication[field];
                newValues[field] = req.body[field];
                medication[field] = req.body[field];
            }
        });

        // Handle discontinuation
        if (req.body.status === 'discontinued') {
            medication.discontinuedBy = managerId;
            medication.discontinuedAt = new Date();
            medication.isActive = false;
        }

        medication.lastModifiedBy = managerId;
        await medication.save();

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'update_medication',
            resourceType: 'medication',
            resourceId: medication._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            previousValues,
            newValues,
            details: { medicationName: medication.name },
        });

        res.json({ medication });
    } catch (error) {
        console.error('Update medication error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Validation error', details: Object.values(error.errors).map(e => e.message) });
        }
        res.status(500).json({ error: 'Failed to update medication' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 11. GET /api/manager/analytics/adherence — Adherence trends
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/adherence', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const caretakerIds = await getManagedCaretakerIds(managerId);
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Daily adherence for managed patients
        const dailyAdherence = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: { $in: caretakerIds },
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
                    adherenceRate: { $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 1] },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Per-patient adherence
        const patientIds = await getManagedPatientIds(managerId);
        const patientAdherence = await CallLog.aggregate([
            {
                $match: {
                    patientId: { $in: patientIds },
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
                $lookup: {
                    from: 'profiles',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'patient',
                },
            },
            { $unwind: '$patient' },
            {
                $project: {
                    patientName: '$patient.fullName',
                    avatarUrl: '$patient.avatarUrl',
                    adherenceRate: { $round: [{ $multiply: [{ $divide: ['$confirmed', '$total'] }, 100] }, 1] },
                },
            },
            { $sort: { adherenceRate: -1 } },
        ]);

        // Low adherence alerts (< 70%)
        const lowAdherence = patientAdherence.filter(p => p.adherenceRate < 70);

        res.json({
            dailyAdherence,
            patientAdherence,
            lowAdherenceAlerts: lowAdherence,
            teamAverage: patientAdherence.length
                ? Math.round(patientAdherence.reduce((s, p) => s + p.adherenceRate, 0) / patientAdherence.length)
                : 0,
        });
    } catch (error) {
        console.error('Manager adherence analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch adherence analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 12. GET /api/manager/analytics/performance — Caretaker perf
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/performance', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const caretakerIds = await getManagedCaretakerIds(managerId);
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Per-caretaker performance
        const performance = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: { $in: caretakerIds },
                    scheduledTime: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: '$caretakerId',
                    totalCalls: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                    avgDuration: { $avg: '$duration' },
                    avgRating: { $avg: '$callQuality.rating' },
                    totalFollowUps: { $sum: { $cond: ['$followUpRequired', 1, 0] } },
                },
            },
            {
                $lookup: {
                    from: 'profiles',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'profile',
                },
            },
            { $unwind: '$profile' },
            {
                $project: {
                    id: '$_id',
                    name: '$profile.fullName',
                    avatarUrl: '$profile.avatarUrl',
                    email: '$profile.email',
                    totalCalls: 1,
                    completed: 1,
                    missed: 1,
                    completionRate: {
                        $round: [{ $multiply: [{ $divide: ['$completed', { $max: ['$totalCalls', 1] }] }, 100] }, 0],
                    },
                    avgDuration: { $round: [{ $ifNull: ['$avgDuration', 0] }, 0] },
                    avgRating: { $round: [{ $ifNull: ['$avgRating', 0] }, 1] },
                    totalFollowUps: 1,
                },
            },
            { $sort: { completionRate: -1 } },
        ]);

        // Enrich with patient counts and escalation counts
        const enrichedPerformance = await Promise.all(performance.map(async (p) => {
            const [patientCount, escalationCount] = await Promise.all([
                CaretakerPatient.countDocuments({ caretakerId: p._id, status: 'active' }),
                Escalation.countDocuments({ caretakerId: p._id, createdAt: { $gte: startDate } }),
            ]);

            // Composite score: 50% completion + 20% rating + 15% low escalations + 15% response
            const ratingScore = p.avgRating ? (p.avgRating / 5) * 100 : 75;
            const escalationScore = Math.max(0, 100 - (escalationCount * 10));
            const compositeScore = Math.round(
                p.completionRate * 0.5 +
                ratingScore * 0.2 +
                escalationScore * 0.15 +
                Math.min(p.avgDuration > 0 ? 100 : 0, 100) * 0.15
            );

            return {
                ...p,
                patientCount,
                escalationCount,
                compositeScore,
            };
        }));

        // Daily trend (completion rate over time)
        const dailyTrend = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: { $in: caretakerIds },
                    scheduledTime: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                },
            },
            {
                $project: {
                    date: '$_id',
                    completionRate: { $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 1] },
                    total: 1,
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            performance: enrichedPerformance,
            dailyTrend,
            teamAverage: enrichedPerformance.length
                ? Math.round(enrichedPerformance.reduce((s, p) => s + p.compositeScore, 0) / enrichedPerformance.length)
                : 0,
        });
    } catch (error) {
        console.error('Manager performance analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch performance analytics' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 13. POST /api/manager/alerts/:id/resolve — Resolve escalation
// ═══════════════════════════════════════════════════════════════
router.post('/alerts/:id/resolve', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const { resolution } = req.body;

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid alert ID' });
        }
        if (!resolution) {
            return res.status(400).json({ error: 'resolution text is required' });
        }

        const escalation = await Escalation.findById(req.params.id);
        if (!escalation) {
            return res.status(404).json({ error: 'Escalation not found' });
        }

        // Verify it's in the manager's scope
        const caretakerIds = await getManagedCaretakerIds(managerId);
        const isInScope = escalation.assignedTo?.equals(managerId) ||
            caretakerIds.some(id => id.equals(escalation.caretakerId));

        if (!isInScope) {
            return res.status(403).json({ error: 'Escalation not in your scope' });
        }

        if (['resolved', 'closed'].includes(escalation.status)) {
            return res.status(400).json({ error: 'Escalation is already resolved' });
        }

        await escalation.resolve(managerId, resolution);

        // Notify the caretaker that the alert was resolved
        if (escalation.caretakerId) {
            await Notification.create({
                recipientId: escalation.caretakerId,
                senderId: managerId,
                organizationId: escalation.organizationId,
                type: 'escalation_alert',
                channel: 'in_app',
                title: 'Alert Resolved',
                body: `Your ${escalation.type.replace(/_/g, ' ')} alert has been resolved: ${resolution}`,
                priority: 'normal',
                relatedEntityType: 'escalation',
                relatedEntityId: escalation._id,
            });
        }

        await AuditLog.createLog({
            supabaseUid: req.profile.supabaseUid,
            action: 'resolve_escalation',
            resourceType: 'escalation',
            resourceId: escalation._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: {
                type: escalation.type,
                priority: escalation.priority,
                resolution,
                slaBreached: escalation.slaBreached,
            },
        });

        res.json({
            message: 'Escalation resolved successfully',
            escalation,
        });
    } catch (error) {
        console.error('Resolve escalation error:', error);
        res.status(500).json({ error: 'Failed to resolve escalation' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 14. POST /api/manager/messages — Send message to caretaker
// ═══════════════════════════════════════════════════════════════
router.post('/messages', async (req, res) => {
    try {
        const managerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const { recipientId, title, body, priority, relatedPatientId } = req.body;

        if (!recipientId || !title || !body) {
            return res.status(400).json({ error: 'recipientId, title, and body are required' });
        }

        // Verify recipient is in the manager's team
        const caretakerIds = await getManagedCaretakerIds(managerId);
        if (!caretakerIds.some(id => id.equals(recipientId))) {
            return res.status(403).json({ error: 'Recipient is not in your team' });
        }

        const notification = await Notification.create({
            recipientId,
            senderId: managerId,
            organizationId: orgId,
            type: 'system_announcement',
            channel: 'in_app',
            title,
            body,
            priority: priority || 'normal',
            data: relatedPatientId ? { screen: 'PatientDetail', patientId: relatedPatientId } : {},
            relatedEntityType: relatedPatientId ? 'profile' : undefined,
            relatedEntityId: relatedPatientId || undefined,
        });

        res.status(201).json({
            message: 'Message sent successfully',
            notification,
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

module.exports = router;
