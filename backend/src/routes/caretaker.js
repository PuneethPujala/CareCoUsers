const express = require('express');
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Medication = require('../models/Medication');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CaretakerPatient = require('../models/CaretakerPatient');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// ── All routes require caretaker/caller (or higher) ─────────
router.use(authenticate, requireRole('caretaker', 'caller', 'care_manager', 'org_admin', 'super_admin'));

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

/** Returns the current shift: 'morning' | 'afternoon' | 'night' */
function getCurrentShift() {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'night';
}

/** Filter medication list to only those scheduled for the given shift */
function filterMedsByShift(medications, shift) {
    return medications.filter(med => {
        const times = med.scheduledTimes && med.scheduledTimes.length > 0 ? med.scheduledTimes : (med.times || []);

        if (times.length === 0) return shift === 'morning';

        if (shift === 'morning') {
            return times.some(t => t.toLowerCase().includes('morning') || t.includes('AM') || (t.includes('12:') && !t.includes('PM')));
        }
        if (shift === 'afternoon') {
            return times.some(t => {
                if (t.toLowerCase().includes('afternoon')) return true;
                if (!t.includes('PM')) return false;
                let h = parseInt(t.split(':')[0]);
                if (h === 12) h = 0;
                return h >= 0 && h < 5;
            });
        }
        if (shift === 'night') {
            return times.some(t => {
                if (t.toLowerCase().includes('night')) return true;
                if (!t.includes('PM')) return false;
                let h = parseInt(t.split(':')[0]);
                if (h === 12) return false;
                return h >= 5;
            });
        }
        return false;
    });
}

/**
 * Get medications for a patient.
 * Reads from BOTH the Medication collection AND the Patient.medications embedded array.
 * Returns a unified format.
 */
async function getPatientMedications(patientId, activeOnly = true) {
    // 1. Check Medication collection first
    const filter = { patientId };
    if (activeOnly) filter.isActive = true;
    let meds = await Medication.find(filter).sort({ name: 1 }).lean();

    // 2. Check embedded Patient.medications and Profile.metadata.medications
    const [patient, profile] = await Promise.all([
        Patient.findById(patientId).select('medications metadata').lean(),
        Profile.findById(patientId).select('metadata').lean()
    ]);

    let embeddedMeds = [];
    if (patient) {
        embeddedMeds = [...(patient.medications || []), ...(patient.metadata?.medications || [])];
    }
    if (profile && profile.metadata?.medications) {
        embeddedMeds = [...embeddedMeds, ...profile.metadata.medications];
    }

    // Deduplicate by ID
    const uniqueEmbedded = [];
    const seen = new Set();
    for (const m of embeddedMeds) {
        if (!m) continue;
        const mId = (m._id || m.id || '').toString();
        if (mId && !seen.has(mId)) {
            seen.add(mId);
            uniqueEmbedded.push(m);
        }
    }

    if (uniqueEmbedded.length > 0) {
        const mappedEmbedded = uniqueEmbedded
            .filter(m => activeOnly ? (m.is_active !== false && m.isActive !== false) : true)
            .map(m => ({
                _id: m._id || m.id,
                patientId: patientId,
                name: m.name,
                dosage: m.dosage,
                frequency: m.frequency,
                route: m.route || 'oral',
                scheduledTimes: m.scheduledTimes || [],
                times: m.times || [],
                instructions: m.instructions || '',
                withFood: m.withFood || false,
                isActive: m.is_active !== false && m.isActive !== false,
                status: (m.is_active !== false && m.isActive !== false) ? 'active' : 'inactive',
                prescribedBy: m.prescribed_by || '',
                startDate: m.startDate || null,
                takenLogs: m.takenLogs || [],
                takenDates: m.takenDates || [],
                _embedded: true, // flag to identify source
            }));
        
        meds = [...meds, ...mappedEmbedded];
    }

    return meds;
}

/**
 * Returns patient IDs for this caretaker/caller.
 * If explicit CaretakerPatient assignments exist, use those.
 * Otherwise, fallback to ALL active patients in the caller's organization.
 */
async function getAssignedPatientIds(caretakerId, orgId) {
    const assignments = await CaretakerPatient.find({
        caretakerId,
        status: 'active',
    }).select('patientId').lean();

    let pIds = assignments.map(a => a.patientId);

    // FALLBACK: If no explicit assignments, get all org patients
    if (pIds.length === 0 && orgId) {
        const orgPatients = await Patient.find({
            organization_id: orgId,
            is_active: true
        }).select('_id').lean();
        pIds = orgPatients.map(p => p._id);

        // Also check Profile collection for patients
        const orgProfiles = await Profile.find({
            organizationId: orgId,
            role: 'patient',
            isActive: { $ne: false }
        }).select('_id').lean();
        const profileIds = orgProfiles.map(p => p._id);

        // Merge, dedup
        const idSet = new Set([...pIds.map(id => id.toString()), ...profileIds.map(id => id.toString())]);
        return [...idSet].map(id => new mongoose.Types.ObjectId(id));
    }

    // Validate assigned IDs still exist
    const [activeProfiles, activePatients] = await Promise.all([
        Profile.find({ _id: { $in: pIds }, isActive: { $ne: false } }).select('_id').lean(),
        Patient.find({ _id: { $in: pIds }, is_active: { $ne: false } }).select('_id').lean()
    ]);

    const validIds = new Set([
        ...activeProfiles.map(p => p._id.toString()),
        ...activePatients.map(p => p._id.toString())
    ]);

    return pIds.filter(id => validIds.has(id.toString()));
}

/** Verifies a patient is assigned to this caretaker (or in same org as fallback) */
async function isPatientAssigned(caretakerId, patientId) {
    const assignment = await CaretakerPatient.findOne({
        caretakerId,
        patientId,
        status: 'active',
    });
    if (assignment) return true;

    // Fallback: check if caller and patient are in the same org
    const caller = await Profile.findById(caretakerId).select('organizationId').lean();
    if (!caller || !caller.organizationId) return false;

    const orgIdStr = caller.organizationId.toString();
    const patient = await Patient.findById(patientId).select('organization_id').lean();
    if (patient && patient.organization_id && patient.organization_id.toString() === orgIdStr) return true;

    const patientProfile = await Profile.findById(patientId).select('organizationId').lean();
    if (patientProfile && patientProfile.organizationId && patientProfile.organizationId.toString() === orgIdStr) return true;

    return false;
}

// ═══════════════════════════════════════════════════════════════
// SHIFT HELPER: Compute shift time bounds
// ═══════════════════════════════════════════════════════════════
function getShiftBounds(shift) {
    const now = new Date();
    const shiftStart = new Date(now);
    const shiftEnd = new Date(now);
    if (shift === 'morning') {
        shiftStart.setHours(0, 0, 0, 0);
        shiftEnd.setHours(11, 59, 59, 999);
    } else if (shift === 'afternoon') {
        shiftStart.setHours(12, 0, 0, 0);
        shiftEnd.setHours(16, 59, 59, 999);
    } else {
        shiftStart.setHours(17, 0, 0, 0);
        shiftEnd.setHours(23, 59, 59, 999);
    }
    return { shiftStart, shiftEnd };
}

/**
 * Determine a patient's shift status based STRICTLY on:
 * 1. Call logs for this shift (completed call must exist)
 * 2. ALL shift meds confirmed in medicationConfirmations of said call log
 * 3. 3+ failed attempts (no_answer/missed) → patient is missed
 * Returns: { status: 'completed'|'missed'|'pending', attempts, failedAttempts }
 */
async function getPatientShiftStatus(caretakerId, patientId, shiftMeds, shiftStart, shiftEnd) {
    const shiftLogs = await CallLog.find({
        caretakerId,
        patientId,
        scheduledTime: { $gte: shiftStart, $lte: shiftEnd },
    }).sort({ createdAt: -1 }).lean();

    const failedAttempts = shiftLogs.filter(l => ['no_answer', 'missed'].includes(l.status)).length;
    const completedLogs = shiftLogs.filter(l => l.status === 'completed');

    // Check if ANY completed call has ALL shift meds confirmed
    let isFullyCompleted = false;
    for (const log of completedLogs) {
        const confirmations = log.medicationConfirmations || [];
        if (shiftMeds.length === 0) {
            isFullyCompleted = true;
            break;
        }
        const allConfirmed = shiftMeds.every(med => {
            return confirmations.some(c =>
                c.medicationId?.toString() === med._id?.toString() && c.confirmed === true
            );
        });
        if (allConfirmed) {
            isFullyCompleted = true;
            break;
        }
    }

    let status = 'pending';
    if (isFullyCompleted) {
        status = 'completed';
    } else if (failedAttempts >= 3) {
        status = 'missed';
    }

    return { status, attempts: shiftLogs.length, failedAttempts };
}

// ═══════════════════════════════════════════════════════════════
// 1. GET /api/caretaker/dashboard — My shift KPIs
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const patientIds = await getAssignedPatientIds(caretakerId, orgId);

        const now = new Date();
        const currentShift = getCurrentShift();
        const { shiftStart, shiftEnd } = getShiftBounds(currentShift);
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        // ── Single-pass: classify each patient for this shift ──
        const shiftPatients = []; // patients with meds this shift
        let completedCount = 0;
        let missedCount = 0;
        let pendingCount = 0;
        let firstPendingPatient = null;

        for (const pid of patientIds) {
            const meds = await getPatientMedications(pid, true);
            const shiftMeds = filterMedsByShift(meds, currentShift);
            if (shiftMeds.length === 0) continue; // not a shift patient

            shiftPatients.push(pid);
            const { status } = await getPatientShiftStatus(caretakerId, pid, shiftMeds, shiftStart, shiftEnd);

            if (status === 'completed') completedCount++;
            else if (status === 'missed') missedCount++;
            else {
                pendingCount++;
                if (!firstPendingPatient) firstPendingPatient = pid;
            }
        }

        const assignedCount = shiftPatients.length;

        // ── Adherence rate (Current Shift) ──
        const adherenceResult = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: new mongoose.Types.ObjectId(caretakerId),
                    scheduledTime: { $gte: shiftStart, $lte: shiftEnd },
                    status: 'completed',
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
        const myAdherence = adherenceResult.length && adherenceResult[0].total > 0
            ? Math.round((adherenceResult[0].confirmed / adherenceResult[0].total) * 100)
            : 0;

        // ── Performance (Current Shift) ──
        const performanceResult = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: new mongoose.Types.ObjectId(caretakerId),
                    scheduledTime: { $gte: shiftStart, $lte: shiftEnd },
                },
            },
            {
                $group: {
                    _id: null,
                    avgDuration: { $avg: '$duration' },
                    avgRating: { $avg: '$callQuality.rating' },
                },
            },
        ]);
        
        const shiftPerformance = performanceResult.length ? performanceResult[0] : { avgDuration: 0, avgRating: 0 };

        // ── Next call: first pending patient ──
        let nextCall = null;
        let nextCallMedCount = 0;
        if (firstPendingPatient) {
            const pDoc = await Patient.findById(firstPendingPatient).lean() || await Profile.findById(firstPendingPatient).lean();
            if (pDoc) {
                const nextCallPatient = {
                    _id: pDoc._id,
                    fullName: pDoc.name || pDoc.fullName,
                    avatarUrl: pDoc.avatarUrl || pDoc.avatar_url,
                    phone: pDoc.phone
                };
                const allMeds = await getPatientMedications(pDoc._id, true);
                nextCallMedCount = filterMedsByShift(allMeds, currentShift).length;
                nextCall = {
                    _id: new mongoose.Types.ObjectId(),
                    patientId: nextCallPatient,
                    scheduledTime: new Date(),
                    priority: 'routine',
                };
            }
        }

        // ── Streak (consecutive days with all calls completed) ──
        const streakResult = await CallLog.aggregate([
            {
                $match: {
                    caretakerId: new mongoose.Types.ObjectId(caretakerId),
                    scheduledTime: { $lte: now },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                    total: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                },
            },
            { $sort: { _id: -1 } },
            { $limit: 90 },
        ]);

        let currentStreak = 0;
        for (const day of streakResult) {
            if (day.completed === day.total && day.total > 0) {
                currentStreak++;
            } else {
                break;
            }
        }

        // ── Other metrics ──
        const [openAlerts, unreadNotifications] = await Promise.all([
            Escalation.countDocuments({ caretakerId, status: { $in: ['open', 'acknowledged', 'in_progress'] } }),
            Notification.getUnreadCount(caretakerId),
        ]);

        const completionRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;

        res.json({
            stats: {
                assignedPatients: assignedCount,
                adherence: myAdherence,
                currentStreak,
                activeMedications: 0, // Not used in caller dashboard
                openAlerts,
                unreadNotifications,
                calls: {
                    today: {
                        total: assignedCount,
                        completed: completedCount,
                        missed: missedCount,
                        pending: pendingCount
                    },
                    completionRate,
                },
                performance: {
                    completionRate,
                    avgDuration: shiftPerformance.avgDuration,
                    avgRating: shiftPerformance.avgRating,
                    totalCalls: assignedCount,
                },
            },
            nextCall: nextCall ? {
                id: nextCall._id,
                patientId: nextCall.patientId?._id || nextCall.patientId,
                patient: nextCall.patientId?.fullName || 'Patient',
                patientAvatar: nextCall.patientId?.avatarUrl,
                phone: nextCall.patientId?.phone,
                scheduledTime: nextCall.scheduledTime,
                priority: nextCall.priority,
                timeUntil: getTimeAgo(nextCall.scheduledTime),
                medCount: nextCallMedCount
            } : null,
        });
    } catch (error) {
        console.error('Caretaker dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 2. GET /api/caretaker/call-queue — My shift routing queue
// ═══════════════════════════════════════════════════════════════
router.get('/call-queue', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;

        const currentShift = getCurrentShift();
        const { shiftStart, shiftEnd } = getShiftBounds(currentShift);

        const patientIds = await getAssignedPatientIds(caretakerId, orgId);

        if (patientIds.length === 0) {
            return res.json({ calls: [], summary: { total: 0, scheduled: 0, completed: 0, missed: 0, overdue: 0 } });
        }

        // Get all patient details from both collections
        const [patients, profiles] = await Promise.all([
            Patient.find({ _id: { $in: patientIds } })
                .select('name email phone avatar_url avatarUrl date_of_birth dateOfBirth is_active')
                .lean(),
            Profile.find({ _id: { $in: patientIds } })
                .select('fullName email phone avatarUrl dateOfBirth isActive')
                .lean()
        ]);

        const patientMap = {};
        for (const p of patients) {
            patientMap[p._id.toString()] = { ...p, fullName: p.name, isActive: p.is_active };
        }
        for (const p of profiles) {
            if (!patientMap[p._id.toString()]) patientMap[p._id.toString()] = p;
        }

        // Build queue — only patients with shift meds
        const enrichedCalls = [];

        for (const pid of patientIds) {
            const pidStr = pid.toString();
            const patientData = patientMap[pidStr];
            if (!patientData) continue;

            // Get shift-filtered medications
            const allMeds = await getPatientMedications(pid, true);
            const shiftMeds = filterMedsByShift(allMeds, currentShift);
            if (shiftMeds.length === 0) continue; // Skip — no meds this shift

            // Get strict shift status
            const { status, attempts, failedAttempts } = await getPatientShiftStatus(
                caretakerId, pid, shiftMeds, shiftStart, shiftEnd
            );

            // Get the latest call log for display info
            const latestLog = await CallLog.findOne({
                caretakerId, patientId: pid,
                scheduledTime: { $gte: shiftStart, $lte: shiftEnd },
            }).sort({ createdAt: -1 }).lean();

            // Get previous call (before this shift) for context
            const previousCall = await CallLog.findOne({
                patientId: pid, caretakerId, status: 'completed',
                scheduledTime: { $lt: shiftStart },
            }).sort({ scheduledTime: -1 }).select('scheduledTime notes outcome patientMood').lean();

            // Calculate age
            let age = null;
            const dob = patientData.dateOfBirth || patientData.date_of_birth;
            if (dob) {
                const today = new Date();
                const birth = new Date(dob);
                age = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
            }

            const displayTime = latestLog?.scheduledTime || new Date();
            const duration = latestLog?.duration || 0;

            enrichedCalls.push({
                _id: latestLog?._id || new mongoose.Types.ObjectId(),
                patientId: {
                    _id: patientData._id,
                    fullName: patientData.fullName || patientData.name || 'Unknown',
                    avatarUrl: patientData.avatarUrl || patientData.avatar_url,
                    phone: patientData.phone,
                    email: patientData.email,
                    dateOfBirth: dob,
                },
                status,
                scheduledTime: displayTime,
                priority: latestLog?.priority || 'routine',
                attempts,
                failedAttempts,
                maxAttempts: 3,
                duration,
                notes: latestLog?.notes || '',
                patientAge: age,
                medications: shiftMeds,
                medicationCount: shiftMeds.length,
                totalMedicationCount: allMeds.length,
                currentShift,
                previousCall: previousCall ? {
                    date: previousCall.scheduledTime,
                    notes: previousCall.notes,
                    outcome: previousCall.outcome,
                    mood: previousCall.patientMood,
                } : null,
                isOverdue: false,
                durationFormatted: duration
                    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
                    : null,
            });
        }

        // Sort: pending first, then retries (fewest attempts first), then completed last
        const statusOrder = { pending: 0, missed: 1, completed: 2 };
        enrichedCalls.sort((a, b) => {
            const orderA = statusOrder[a.status] ?? 0;
            const orderB = statusOrder[b.status] ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.attempts - b.attempts; // fewest attempts first within same status
        });

        // Filter by status query if provided
        let finalCalls = enrichedCalls;
        if (req.query.status) {
            finalCalls = enrichedCalls.filter(c => c.status === req.query.status);
        }

        const summary = {
            total: enrichedCalls.length,
            scheduled: enrichedCalls.filter(c => c.status === 'pending').length,
            completed: enrichedCalls.filter(c => c.status === 'completed').length,
            missed: enrichedCalls.filter(c => c.status === 'missed').length,
            overdue: 0,
        };

        res.json({ calls: finalCalls, summary });
    } catch (error) {
        console.error('Caretaker call queue error:', error);
        res.status(500).json({ error: 'Failed to fetch call queue' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. GET /api/caretaker/patients — My assigned patients
// ═══════════════════════════════════════════════════════════════
router.get('/patients', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const patientIds = await getAssignedPatientIds(caretakerId, orgId);

        if (patientIds.length === 0) {
            return res.json({ patients: [] });
        }

        // Fetch from both collections
        const [patients, profiles] = await Promise.all([
            Patient.find({ _id: { $in: patientIds } }).lean(),
            Profile.find({ _id: { $in: patientIds }, role: 'patient' }).lean()
        ]);

        const seen = new Set();
        const merged = [];

        for (const p of patients) {
            seen.add(p._id.toString());
            merged.push({
                _id: p._id,
                fullName: p.name,
                name: p.name,
                email: p.email,
                phone: p.phone,
                avatarUrl: p.avatarUrl || p.avatar_url,
                dateOfBirth: p.dateOfBirth || p.date_of_birth,
                gender: p.gender,
                is_active: p.is_active,
                isActive: p.is_active,
                status: p.status || 'stable',
                organization_id: p.organization_id,
                createdAt: p.createdAt,
            });
        }
        for (const p of profiles) {
            if (!seen.has(p._id.toString())) {
                merged.push({
                    _id: p._id,
                    fullName: p.fullName,
                    name: p.fullName,
                    email: p.email,
                    phone: p.phone,
                    avatarUrl: p.avatarUrl,
                    dateOfBirth: p.dateOfBirth,
                    gender: p.gender,
                    is_active: p.isActive !== false,
                    isActive: p.isActive !== false,
                    status: 'stable',
                    organizationId: p.organizationId,
                    createdAt: p.createdAt,
                });
            }
        }

        // Apply search filter if provided
        let result = merged;
        if (req.query.search) {
            const search = req.query.search.toLowerCase();
            result = merged.filter(p =>
                (p.fullName || '').toLowerCase().includes(search) ||
                (p.email || '').toLowerCase().includes(search)
            );
        }

        res.json({ patients: result });
    } catch (error) {
        console.error('Caretaker patients error:', error);
        res.status(500).json({ error: 'Failed to fetch assigned patients' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 4. GET /api/caretaker/patients/:id — Patient detail
// ═══════════════════════════════════════════════════════════════
router.get('/patients/:id', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const patientId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ error: 'Invalid patient ID' });
        }

        if (!(await isPatientAssigned(caretakerId, patientId))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        // Try Profile first, then Patient
        let patient = await Profile.findById(patientId)
            .select('fullName email phone avatarUrl dateOfBirth gender allergies conditions emergencyContact createdAt')
            .lean();

        if (!patient) {
            const rawPatient = await Patient.findById(patientId)
                .select('name email phone avatar_url avatarUrl date_of_birth dateOfBirth gender allergies conditions emergencyContact createdAt')
                .lean();
            if (rawPatient) {
                patient = {
                    ...rawPatient,
                    fullName: rawPatient.name,
                    avatarUrl: rawPatient.avatarUrl || rawPatient.avatar_url,
                    dateOfBirth: rawPatient.dateOfBirth || rawPatient.date_of_birth,
                };
            }
        }

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Get medications (from Medication collection OR embedded Patient.medications)
        const medications = await getPatientMedications(patientId, true);

        // Get recent calls
        const recentCalls = await CallLog.find({ patientId, caretakerId })
            .sort({ scheduledTime: -1 })
            .limit(10)
            .lean();

        // Get mentors
        let mentors = [];
        try {
            const MentorAuthorization = mongoose.model('MentorAuthorization');
            const auths = await MentorAuthorization.find({ patientId, status: 'active' })
                .populate('mentorId', 'fullName phone email relationship')
                .lean();
            mentors = auths.map(a => ({
                name: a.mentorId?.fullName,
                phone: a.mentorId?.phone,
                email: a.mentorId?.email,
                relationship: a.mentorId?.relationship || a.relationship,
            }));
        } catch (e) {
            // MentorAuthorization model may not exist
        }

        res.json({
            patient,
            medications,
            recentCalls,
            mentors,
        });
    } catch (error) {
        console.error('Patient detail error:', error);
        res.status(500).json({ error: 'Failed to fetch patient details' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. GET /api/caretaker/patients/:id/meds — Patient medications
//    Optional ?shift=morning|afternoon|night to filter by time-of-day
// ═══════════════════════════════════════════════════════════════
router.get('/patients/:id/meds', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const patientId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ error: 'Invalid patient ID' });
        }
        if (!(await isPatientAssigned(caretakerId, patientId))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const activeOnly = req.query.status ? false : true;
        let medications = await getPatientMedications(patientId, activeOnly);

        // Shift-based filtering
        const shift = req.query.shift;
        if (shift) {
            medications = filterMedsByShift(medications, shift);
        }

        // For each med, get the last confirmation from call logs
        const enriched = await Promise.all(medications.map(async (med) => {
            const lastConfirmation = await CallLog.findOne({
                patientId,
                caretakerId,
                status: 'completed',
                'medicationConfirmations.medicationId': med._id,
            })
                .sort({ scheduledTime: -1 })
                .select('scheduledTime medicationConfirmations')
                .lean();

            const confirmation = lastConfirmation?.medicationConfirmations?.find(
                m => m.medicationId?.toString() === med._id.toString()
            );

            return {
                ...med,
                lastConfirmed: confirmation?.confirmed ?? null,
                lastConfirmedAt: lastConfirmation?.scheduledTime || null,
                lastReason: confirmation?.reason || null,
            };
        }));

        res.json({ medications: enriched });
    } catch (error) {
        console.error('Patient medications error:', error);
        res.status(500).json({ error: 'Failed to fetch patient medications' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5a. POST /api/caretaker/patients/:id/medications — Add Med
// ═══════════════════════════════════════════════════════════════
router.post('/patients/:id/medications', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const patientId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ error: 'Invalid patient ID' });
        }
        if (!(await isPatientAssigned(caretakerId, patientId))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const {
            name, dosage, frequency, route, scheduledTimes,
            instructions, withFood, startDate, endDate
        } = req.body;

        if (!name || !dosage || !frequency) {
            return res.status(400).json({ error: 'name, dosage and frequency are required' });
        }

        // Figure out organizationId for the schema
        let orgId = req.profile.organizationId;
        const patient = await Patient.findById(patientId).lean();
        if (patient && patient.organization_id) {
            orgId = patient.organization_id;
        } else {
            const profile = await Profile.findById(patientId).lean();
            if (profile && profile.organizationId) {
                orgId = profile.organizationId;
            }
        }

        const newMed = await Medication.create({
            patientId,
            organizationId: orgId,
            name,
            dosage,
            frequency,
            route: route || 'oral',
            scheduledTimes: scheduledTimes || [],
            times: scheduledTimes || [],
            instructions: instructions || '',
            withFood: !!withFood,
            startDate: startDate || new Date(),
            endDate: endDate || null,
            prescribedBy: req.profile.fullName || req.profile.name || 'Caller',
            addedBy: caretakerId,
            status: 'active',
            isActive: true
        });

        // Audit log
        try {
            await AuditLog.createLog({
                supabaseUid: req.profile.supabaseUid,
                action: 'medication_created',
                resourceType: 'medication',
                resourceId: newMed._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                outcome: 'success',
                details: { patientId, medicationName: name },
            });
        } catch (e) { /* ignore audit errors */ }

        res.status(201).json({ medication: newMed });
    } catch (error) {
        console.error('Add medication error:', error);
        res.status(500).json({ error: 'Failed to add medication' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5b. PUT /api/caretaker/patients/:id/medications/:medId — Update Med
// ═══════════════════════════════════════════════════════════════
router.put('/patients/:id/medications/:medId', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const { id: patientId, medId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(patientId) || !mongoose.Types.ObjectId.isValid(medId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        if (!(await isPatientAssigned(caretakerId, patientId))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const allowed = ['name', 'dosage', 'frequency', 'route', 'scheduledTimes', 'instructions', 'withFood', 'status', 'endDate'];
        const updateFields = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updateFields[key] = req.body[key];
            }
        }
        if (updateFields.status !== undefined) {
            updateFields.isActive = updateFields.status === 'active';
            updateFields.is_active = updateFields.status === 'active';
        }
        if (updateFields.scheduledTimes !== undefined) {
            updateFields.times = updateFields.scheduledTimes;
        }

        // Try updating from Medication collection first
        let updatedMed = await Medication.findOneAndUpdate(
            { _id: medId, patientId },
            { $set: updateFields },
            { new: true }
        );

        if (updatedMed) {
            return res.json({ medication: updatedMed });
        }

        // If not found in Medication collection, try embedded Patient.medications
        const embeddedUpdateFields = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                embeddedUpdateFields[`medications.$.${key}`] = req.body[key];
            }
        }
        if (req.body.scheduledTimes && req.body.scheduledTimes.length > 0) {
            embeddedUpdateFields['medications.$.times'] = req.body.scheduledTimes;
        }

        let patient = await Patient.findOneAndUpdate(
            { _id: patientId, 'medications._id': medId },
            { $set: embeddedUpdateFields },
            { new: true }
        );

        // Try Patient.metadata.medications
        if (!patient) {
            const metaUpdateFields = {};
            for (const key of allowed) {
                if (req.body[key] !== undefined) {
                    metaUpdateFields[`metadata.medications.$.${key}`] = req.body[key];
                }
            }
            if (req.body.scheduledTimes && req.body.scheduledTimes.length > 0) {
                metaUpdateFields['metadata.medications.$.times'] = req.body.scheduledTimes;
            }
            patient = await Patient.findOneAndUpdate(
                { _id: patientId, 'metadata.medications._id': medId },
                { $set: metaUpdateFields },
                { new: true }
            );
        }

        if (!patient) {
            return res.status(404).json({ error: 'Medication not found' });
        }

        let med = patient.medications?.find(m => m._id.toString() === medId.toString());
        if (!med) {
            med = patient.metadata?.medications?.find(m => m._id.toString() === medId.toString());
        }
        
        res.json({ medication: med });
    } catch (error) {
        console.error('Update medication error:', error);
        res.status(500).json({ error: 'Failed to update medication' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5c. DELETE /api/caretaker/patients/:id/medications/:medId — Delete Med
// ═══════════════════════════════════════════════════════════════
router.delete('/patients/:id/medications/:medId', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const { id: patientId, medId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(patientId) || !mongoose.Types.ObjectId.isValid(medId)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        if (!(await isPatientAssigned(caretakerId, patientId))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        // 1. Try deleting from Medication collection
        const med = await Medication.findOneAndDelete({ _id: medId, patientId });
        
        let found = !!med;

        // 2. Try deleting from embedded arrays
        const patient1 = await Patient.findOneAndUpdate(
            { _id: patientId },
            { $pull: { medications: { _id: medId } } },
            { new: true }
        );
        const patient2 = await Patient.findOneAndUpdate(
            { _id: patientId },
            { $pull: { 'metadata.medications': { _id: medId } } },
            { new: true }
        );

        if (!found && !patient1 && !patient2) {
            return res.status(404).json({ error: 'Medication or Patient not found' });
        }

        res.json({ message: 'Medication deleted' });
    } catch (error) {
        console.error('Delete medication error:', error);
        res.status(500).json({ error: 'Failed to delete medication' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 6. POST /api/caretaker/calls — Log a call
// ═══════════════════════════════════════════════════════════════
router.post('/calls', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const {
            callLogId,
            patientId,
            scheduledTime,
            status,
            outcome,
            startedAt,
            endedAt,
            duration,
            notes,
            patientMood,
            followUpRequired,
            medicationConfirmations,
            callQuality,
        } = req.body;

        if (!patientId) {
            return res.status(400).json({ error: 'patientId is required' });
        }

        // Update existing log or create new
        let log;
        if (callLogId && mongoose.Types.ObjectId.isValid(callLogId)) {
            log = await CallLog.findById(callLogId);
        }

        // Map outcome to valid enum val
        const validOutcomes = ['answered_completed', 'answered_partial', 'no_answer', 'voicemail', 'refused', 'rescheduled'];
        const mappedOutcome = validOutcomes.includes(outcome)
            ? outcome
            : (status === 'completed' ? 'answered_completed' : (status === 'no_answer' ? 'no_answer' : 'answered_completed'));

        let orgId = req.profile.organizationId?._id || req.profile.organizationId;
        
        if (!orgId) {
            const tempPat = await Patient.findById(patientId).lean();
            if (tempPat && tempPat.organization_id) {
                orgId = tempPat.organization_id;
            } else {
                const Profile = mongoose.model('Profile');
                const tempProf = await Profile.findById(patientId).lean();
                if (tempProf && tempProf.organizationId) {
                    orgId = tempProf.organizationId;
                }
            }
        }

        if (log) {
            Object.assign(log, {
                status: status || 'completed',
                outcome: mappedOutcome,
                startedAt,
                endedAt,
                duration,
                notes,
                patientMood,
                followUpRequired,
                medicationConfirmations,
                callQuality,
            });
            if (!log.organizationId && orgId) log.organizationId = orgId;
            await log.save();
        } else {
            log = await CallLog.create({
                caretakerId,
                patientId,
                organizationId: orgId,
                scheduledTime: scheduledTime || new Date(),
                status: status || 'completed',
                outcome: mappedOutcome,
                startedAt,
                endedAt,
                duration,
                notes,
                patientMood,
                followUpRequired,
                medicationConfirmations,
                callQuality,
            });
        }

        // Update medication adherence — persist to embedded Patient.medications
        if (medicationConfirmations && medicationConfirmations.length > 0) {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            for (const mc of medicationConfirmations) {
                if (mc.confirmed && mc.medicationId) {
                    // 1. Try Medication collection first
                    try {
                        const medDoc = await Medication.findById(mc.medicationId);
                        if (medDoc) {
                            if (!medDoc.takenLogs) medDoc.takenLogs = [];
                            medDoc.takenLogs.push({
                                date: today,
                                timestamp: new Date(),
                            });
                            await medDoc.save();
                            continue; // done for this med
                        }
                    } catch (e) { /* not in Medication collection */ }

                    // 2. Fallback: Update embedded Patient.medications
                    try {
                        await Patient.updateOne(
                            { _id: patientId, 'medications._id': mc.medicationId },
                            {
                                $push: {
                                    'medications.$.takenLogs': {
                                        date: today,
                                        timestamp: new Date().toISOString(),
                                        callLogId: log._id,
                                    }
                                },
                                $addToSet: {
                                    'medications.$.takenDates': today,
                                }
                            }
                        );
                    } catch (e) {
                        console.error('[CallLog] Failed to update embedded med:', e.message);
                    }
                }
            }
        }

        // Audit
        try {
            await AuditLog.createLog({
                supabaseUid: req.profile.supabaseUid,
                action: 'call_logged',
                resourceType: 'call_log',
                resourceId: log._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                outcome: 'success',
                details: { patientId, status: log.status, duration },
            });
        } catch (e) { /* ignore audit errors */ }

        res.status(201).json({ callLog: log });
    } catch (error) {
        console.error('Log call error:', error);
        res.status(500).json({ error: 'Failed to log call' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 7. GET /api/caretaker/performance — My performance stats
// ═══════════════════════════════════════════════════════════════
router.get('/performance', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const days = parseInt(req.query.days) || 30;
        const performance = await CallLog.getCaretakerPerformance(caretakerId, days);
        res.json({ performance });
    } catch (error) {
        console.error('Performance error:', error);
        res.status(500).json({ error: 'Failed to fetch performance data' });
    }
});

// ═══════════════════════════════════════════════════════════════
// 8. GET /api/caretaker/call-history — My call history logs
// ═══════════════════════════════════════════════════════════════
router.get('/call-history', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const { page = 1, limit = 50 } = req.query;
        const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 50);

        const calls = await CallLog.find({
            caretakerId,
            status: { $in: ['completed', 'missed', 'no_answer'] },
        })
            .sort({ scheduledTime: -1 })
            .skip(skip)
            .limit(Math.min(100, parseInt(limit) || 50))
            .lean();

        // Enrich with patient info
        const enriched = await Promise.all(calls.map(async (call) => {
            let patient = await Patient.findById(call.patientId).select('name email phone avatarUrl avatar_url').lean();
            if (!patient) {
                patient = await Profile.findById(call.patientId).select('fullName email phone avatarUrl').lean();
            }
            const fullName = patient?.name || patient?.fullName || 'Unknown';
            const avatarUrl = patient?.avatarUrl || patient?.avatar_url || null;

            // Medication confirmation summary
            const confirmations = call.medicationConfirmations || [];
            const totalMeds = confirmations.length;
            const confirmedMeds = confirmations.filter(c => c.confirmed).length;

            return {
                _id: call._id,
                patientId: { _id: call.patientId, fullName, avatarUrl },
                scheduledTime: call.scheduledTime,
                status: call.status,
                outcome: call.outcome,
                duration: call.duration || 0,
                durationFormatted: call.duration
                    ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`
                    : '0m 0s',
                patientMood: call.patientMood || 'neutral',
                notes: call.notes || '',
                followUpRequired: call.followUpRequired || false,
                medicationSummary: {
                    total: totalMeds,
                    confirmed: confirmedMeds,
                    missed: totalMeds - confirmedMeds,
                    details: confirmations.map(c => ({
                        name: c.medicationName,
                        confirmed: c.confirmed,
                        reason: c.reason || '',
                    })),
                },
                attempts: call.attempts || 1,
                createdAt: call.createdAt,
            };
        }));

        const total = await CallLog.countDocuments({
            caretakerId,
            status: { $in: ['completed', 'missed', 'no_answer'] },
        });

        res.json({ calls: enriched, total, page: parseInt(page), limit: parseInt(limit) || 50 });
    } catch (error) {
        console.error('Call history error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
});

module.exports = router;