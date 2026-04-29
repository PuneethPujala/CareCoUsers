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
const MedicineLog = require('../models/MedicineLog');
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
    shift = (shift || 'morning').toLowerCase().trim(); // normalize to lowercase
    return medications.filter(med => {
        const times = med.scheduledTimes && med.scheduledTimes.length > 0 ? med.scheduledTimes : (med.times || []);

        if (times.length === 0) return shift === 'morning';

        return times.some(t => {
            const lower = (t || '').toLowerCase().trim();

            // Check direct string match
            if (lower === shift || lower.includes(shift)) return true;
            if (shift === 'night' && lower.includes('evening')) return true;

            let hour = -1;
            const match24 = lower.match(/^(\d{1,2}):(\d{2})$/);
            const match12 = lower.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);

            if (match24) {
                hour = parseInt(match24[1], 10);
            } else if (match12) {
                hour = parseInt(match12[1], 10);
                const period = match12[3];
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
            }

            if (hour === -1) {
                // If it's an unrecognized format, default it to morning shift so it's not lost
                return shift === 'morning';
            }

            if (shift === 'morning') return hour >= 0 && hour < 12;
            if (shift === 'afternoon') return hour >= 12 && hour < 17;
            if (shift === 'night') return hour >= 17;

            return false;
        });
    });
}

/**
 * Convert scheduledTimes clock strings (e.g. "08:00 AM", "02:30 PM")
 * into the enum buckets the patient app expects: 'morning' | 'afternoon' | 'night'
 */
function mapScheduledTimesToBuckets(scheduledTimes) {
    if (!scheduledTimes || !Array.isArray(scheduledTimes) || scheduledTimes.length === 0) {
        return ['morning']; // Default fallback so the med always appears
    }

    const VALID_ENUMS = ['morning', 'afternoon', 'evening', 'night', 'as_needed'];
    const buckets = new Set();

    for (const t of scheduledTimes) {
        const lower = (t || '').toLowerCase().trim();

        // If it's already a valid enum value, pass it through
        if (VALID_ENUMS.includes(lower)) {
            buckets.add(lower === 'evening' ? 'night' : lower);
            continue;
        }

        // Parse clock time like "08:00 AM", "14:00", "2:30 PM"
        let hour = -1;
        const match24 = lower.match(/^(\d{1,2}):(\d{2})$/);
        const match12 = lower.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);

        if (match24) {
            hour = parseInt(match24[1], 10);
        } else if (match12) {
            hour = parseInt(match12[1], 10);
            const period = match12[3].toLowerCase();
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
        }

        if (hour >= 0 && hour < 12) {
            buckets.add('morning');
        } else if (hour >= 12 && hour < 17) {
            buckets.add('afternoon');
        } else if (hour >= 17 || hour === -1) {
            buckets.add('night');
        }
    }

    return buckets.size > 0 ? Array.from(buckets) : ['morning'];
}

/**
 * Sync a medication into today's MedicineLog for instant patient visibility.
 * @param {ObjectId} patientId - The Patient document _id
 * @param {string} medName - Medication name
 * @param {string[]} timeBuckets - Array of enum time buckets ['morning', 'afternoon', 'night']
 * @param {'add'|'remove'} action - Whether to add or remove the medication
 */
async function syncTodayMedicineLog(patientId, medName, timeBuckets, action = 'add') {
    try {
        const MedicineLog = mongoose.model('MedicineLog');
        const _now = new Date();
        const _y = _now.getFullYear();
        const _m = String(_now.getMonth() + 1).padStart(2, '0');
        const _d = String(_now.getDate()).padStart(2, '0');
        const today = new Date(`${_y}-${_m}-${_d}T00:00:00.000Z`);

        let log = await MedicineLog.findOne({ patient_id: patientId, date: today });

        if (action === 'add') {
            if (!log) {
                // Create today's log with this medication
                log = new MedicineLog({
                    patient_id: patientId,
                    date: today,
                    medicines: timeBuckets.map(time => ({
                        medicine_name: medName,
                        scheduled_time: time,
                        taken: false,
                        is_active: true,
                    })),
                });
                await log.save();
            } else {
                // Append to existing log (avoid duplicates)
                for (const time of timeBuckets) {
                    const exists = log.medicines.some(
                        m => m.medicine_name === medName && m.scheduled_time === time
                    );
                    if (!exists) {
                        log.medicines.push({
                            medicine_name: medName,
                            scheduled_time: time,
                            taken: false,
                            is_active: true,
                        });
                    }
                }
                log.markModified('medicines');
                await log.save();
            }
        } else if (action === 'remove' && log) {
            // Check if there are taken logs
            const hasBeenTaken = log.medicines.some(m => m.medicine_name === medName && m.taken);
            
            if (!hasBeenTaken) {
                // If it was never taken today, completely drop it from today's schema
                log.medicines = log.medicines.filter(m => m.medicine_name !== medName);
            } else {
                // If they took a dose earlier today before it got deleted, just mark the remaining ones inactive
                log.medicines.forEach(m => {
                    if (m.medicine_name === medName) {
                        m.is_active = false;
                    }
                });
            }
            log.markModified('medicines');
            await log.save();
        }
    } catch (err) {
        console.warn('[MedicineLog Sync] Non-fatal error:', err.message);
    }
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
    let patient = await Patient.findById(patientId).select('medications metadata').lean();
    if (!patient) {
        patient = await Patient.findOne({ profile_id: patientId }).select('medications metadata').lean();
    }
    const profile = await Profile.findById(patientId).select('metadata').lean();

    let embeddedMeds = [];
    if (patient) {
        embeddedMeds = [...(patient.medications || []), ...(patient.metadata?.medications || [])];
    }
    if (profile && profile.metadata?.medications) {
        embeddedMeds = [...embeddedMeds, ...profile.metadata.medications];
    }

    // Deduplicate by ID across BOTH sources
    const finalMeds = [];
    const seen = new Set();
    
    // First, add all from master collection
    for (const m of meds) {
        const mId = (m._id || m.id || '').toString();
        if (mId && !seen.has(mId)) {
            seen.add(mId);
            finalMeds.push(m);
        } else if (!mId) {
            finalMeds.push(m); // Fallback for no-ID
        }
    }

    if (embeddedMeds.length > 0) {
        const mappedEmbedded = embeddedMeds
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

        for (const m of mappedEmbedded) {
            if (!m) continue;
            const mId = (m._id || m.id || '').toString();
            if (mId && !seen.has(mId)) {
                seen.add(mId);
                finalMeds.push(m);
            } else if (!mId) {
                finalMeds.push(m);
            }
        }
    }

    return finalMeds;
}

/**
 * Returns patient IDs for this caretaker/caller.
 * If explicit CaretakerPatient assignments exist, use those.
 * Otherwise, fallback to ALL active patients in the caller's organization.
 */
async function getAssignedPatientIds(caretakerId, orgId, callerRole) {
    const assignments = await CaretakerPatient.find({
        caretakerId,
        status: 'active',
    }).select('patientId').lean();

    let pIds = assignments.map(a => a.patientId);

    // FLAW 5 FIX: Only care_manager/org_admin/super_admin get the org-wide fallback.
    // Regular callers with no assignments see an empty list (they must be formally assigned).
    if (pIds.length === 0 && orgId && ['care_manager', 'org_admin', 'super_admin'].includes(callerRole)) {
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

/** Verifies a patient is assigned to this caretaker. Org fallback only for managers+ */
async function isPatientAssigned(caretakerId, patientId, callerRole) {
    const assignment = await CaretakerPatient.findOne({
        caretakerId,
        patientId,
        status: 'active',
    });
    if (assignment) return true;

    // FLAW 6 FIX: Only care_manager/org_admin/super_admin get the org-wide fallback.
    // Regular callers must have an explicit assignment.
    if (!['care_manager', 'org_admin', 'super_admin'].includes(callerRole)) {
        return false;
    }

    // Fallback for managers+: check if caller and patient are in the same org
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

    // Collect ALL confirmed med IDs across ALL completed call logs for this shift
    // (covers cases where caller does multiple calls for the same patient)
    const confirmedMedIds = new Set();
    for (const log of completedLogs) {
        const confirmations = log.medicationConfirmations || [];
        for (const c of confirmations) {
            if (c.confirmed === true && c.medicationId) {
                confirmedMedIds.add(c.medicationId.toString());
            }
        }
    }

    // NEW: Also check native patient app confirmations (MedicineLog / takenLogs)
    try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        const today = new Date(`${todayStr}T00:00:00.000Z`);

        const MedicineLog = mongoose.model('MedicineLog');
        const todayLog = await MedicineLog.findOne({ patient_id: patientId, date: today }).lean();

        // Determine current shift string bucket based on shiftStart hour
        const shiftHour = shiftStart.getHours();
        const currentShiftString = shiftHour < 12 ? 'morning' : (shiftHour < 17 ? 'afternoon' : 'night');

        // Check MedicineLog array
        if (todayLog && todayLog.medicines) {
            for (const medLog of todayLog.medicines) {
                if (medLog.taken) {
                    const matchedMed = shiftMeds.find(sm => sm.name && medLog.medicine_name && sm.name.toLowerCase() === medLog.medicine_name.toLowerCase());
                    if (matchedMed) {
                         const logShift = medLog.scheduled_time?.toLowerCase();
                         if (logShift === currentShiftString || !logShift) {
                             confirmedMedIds.add(matchedMed._id?.toString());
                         }
                    }
                }
            }
        }

        // Check takenLogs inside the shiftMeds directly (if it was updated elsewhere)
        for (const med of shiftMeds) {
            if (med.takenLogs && med.takenLogs.some(l => l.date === todayStr)) {
                // Find if the log matches this shift
                const isTakenThisShift = med.takenLogs.some(l => {
                    if (l.date !== todayStr) return false;
                    if (l.shift && l.shift.toLowerCase() === currentShiftString) return true;
                    if (l.timestamp) {
                        const tsHour = new Date(l.timestamp).getHours();
                        if (currentShiftString === 'morning' && tsHour < 12) return true;
                        if (currentShiftString === 'afternoon' && tsHour >= 12 && tsHour < 17) return true;
                        if (currentShiftString === 'night' && tsHour >= 17) return true;
                    }
                    // Legacy fallback
                    return !l.shift && !l.timestamp;
                });
                if (isTakenThisShift) {
                    confirmedMedIds.add(med._id?.toString());
                }
            }
        }
    } catch (e) {
        console.error('[getPatientShiftStatus] Error checking native medicine log', e);
    }

    let isFullyCompleted = false;
    if (shiftMeds.length === 0 && completedLogs.length > 0) {
        isFullyCompleted = true;
    } else if (shiftMeds.length > 0) {
        isFullyCompleted = shiftMeds.every(med => confirmedMedIds.has(med._id?.toString()));
    }

    let status = 'pending';
    if (isFullyCompleted) {
        status = 'completed';
    } else if (failedAttempts >= 3) {
        status = 'missed';
    }

    // Count how many meds are still unconfirmed
    const unconfirmedCount = shiftMeds.filter(med => !confirmedMedIds.has(med._id?.toString())).length;

    return { status, attempts: shiftLogs.length, failedAttempts, confirmedMedIds, unconfirmedCount };
}

// ═══════════════════════════════════════════════════════════════
// 1. GET /api/caretaker/dashboard — My shift KPIs
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
    try {
        const caretakerId = req.profile._id;
        const orgId = req.profile.organizationId?._id || req.profile.organizationId;
        const patientIds = await getAssignedPatientIds(caretakerId, orgId, req.profile.role);

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
                const shiftMeds = filterMedsByShift(allMeds, currentShift);
                const { unconfirmedCount } = await getPatientShiftStatus(caretakerId, pDoc._id, shiftMeds, shiftStart, shiftEnd);
                nextCallMedCount = unconfirmedCount;
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

        const patientIds = await getAssignedPatientIds(caretakerId, orgId, req.profile.role);

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
            const { status, attempts, failedAttempts, unconfirmedCount } = await getPatientShiftStatus(
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
                medicationCount: unconfirmedCount,
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
        const patientIds = await getAssignedPatientIds(caretakerId, orgId, req.profile.role);

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

        if (!(await isPatientAssigned(caretakerId, patientId, req.profile.role))) {
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
        if (!(await isPatientAssigned(caretakerId, patientId, req.profile.role))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const activeOnly = req.query.status ? false : true;
        let medications = await getPatientMedications(patientId, activeOnly);

        // Shift-based filtering
        const shift = req.query.shift;
        if (shift) {
            medications = filterMedsByShift(medications, shift);
        }

        // Fetch today's MedicineLog to see what the Patient marked themselves
        const _now = new Date();
        const _y = _now.getFullYear();
        const _m = String(_now.getMonth() + 1).padStart(2, '0');
        const _d = String(_now.getDate()).padStart(2, '0');
        const today = new Date(`${_y}-${_m}-${_d}T00:00:00.000Z`);
        
        const todayLog = await MedicineLog.findOne({ patient_id: patientId, date: today }).lean();

        // For each med, get the last confirmation from call logs AND patient logs
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
            
            // Check patient application marked status
            let patientMarked = false;
            let callerMarkedFromLog = false;
            let takenLogs = [];
            
            if (todayLog && todayLog.medicines) {
                 const medLogEntries = todayLog.medicines.filter(m => 
                     m.medicine_name && med.name && 
                     m.medicine_name.toLowerCase() === med.name.toLowerCase() &&
                     (!shift || (m.scheduled_time && m.scheduled_time.toLowerCase() === shift.toLowerCase()))
                 );
                 
                 for (const m of medLogEntries) {
                     if (m.taken) {
                         if (m.marked_by === 'patient' || !m.marked_by) patientMarked = true;
                         else if (m.marked_by === 'caller') callerMarkedFromLog = true;
                         
                         takenLogs.push({
                             date: `${_y}-${_m}-${_d}`,
                             timestamp: m.taken_at || m.timestamp || new Date(),
                             shift: m.scheduled_time || 'morning',
                             marked_by: m.marked_by || 'patient'
                         });
                     }
                 }
            }

            return {
                ...med,
                lastConfirmed: confirmation?.confirmed ?? null,
                lastConfirmedAt: lastConfirmation?.scheduledTime || null,
                lastReason: confirmation?.reason || null,
                patientMarked: patientMarked,
                callerMarked: callerMarkedFromLog,
                takenLogs: takenLogs
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
        if (!(await isPatientAssigned(caretakerId, patientId, req.profile.role))) {
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

        // Check for duplicates in both Medication and Patient scopes
        const trimmedName = name.trim();
        const existingMedsQuery = await Medication.find({ patientId, name: { $regex: new RegExp('^' + trimmedName + '$', 'i') }, isActive: true });
        
        let embeddedMedsQuery = [];
        const pDocCheck = await Patient.findById(patientId).lean();
        if (pDocCheck && pDocCheck.medications) {
            embeddedMedsQuery = pDocCheck.medications.filter(m => m.name && m.name.toLowerCase().trim() === trimmedName.toLowerCase() && (m.isActive !== false && m.is_active !== false));
        }
        
        const existingMeds = [...existingMedsQuery, ...embeddedMedsQuery];

        if (existingMeds.length > 0) {
            return res.status(400).json({ error: 'This medication already exists in the patient\'s records. Please edit the existing entry to update shifts or dosage instead of creating a duplicate.' });
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

        // Sync into Patient array for users-app visibility
        const timeBuckets = mapScheduledTimesToBuckets(newMed.scheduledTimes);
        let pDoc = await Patient.findById(patientId);
        if (!pDoc) {
            pDoc = await Patient.findOne({ profile_id: patientId });
        }
        if (pDoc) {
            if (!pDoc.medications) pDoc.medications = [];
            pDoc.medications.push({
                _id: newMed._id,
                name: newMed.name,
                dosage: newMed.dosage,
                times: timeBuckets,
                scheduledTimes: newMed.scheduledTimes,
                route: newMed.route,
                instructions: newMed.instructions,
                prescribed_by: newMed.prescribedBy,
                start_date: newMed.startDate,
                end_date: newMed.endDate,
                is_active: newMed.isActive,
                takenLogs: [],
                takenDates: []
            });
            pDoc.markModified('medications');
            await pDoc.save();

            // Sync today's MedicineLog so patient sees it immediately
            await syncTodayMedicineLog(pDoc._id, newMed.name, timeBuckets, 'add');
        }

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
        if (!(await isPatientAssigned(caretakerId, patientId, req.profile.role))) {
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
            updateFields.times = mapScheduledTimesToBuckets(updateFields.scheduledTimes);
        }

        // Check for duplicates if name or scheduledTimes are being updated
        if (updateFields.name || updateFields.scheduledTimes) {
            const checkName = (updateFields.name || (await Medication.findById(medId))?.name || (await Patient.findOne({ 'medications._id': medId }))?.medications?.find(m => m._id.toString() === medId)?.name).trim();
            const existingMedsQuery = await Medication.find({ 
                patientId, 
                _id: { $ne: medId }, // Exclude the current med being updated
                name: { $regex: new RegExp('^' + checkName + '$', 'i') }, 
                isActive: true 
            });

            let embeddedMedsQuery = [];
            const pDocCheck = await Patient.findById(patientId).lean();
            if (pDocCheck && pDocCheck.medications) {
                embeddedMedsQuery = pDocCheck.medications.filter(m => m._id.toString() !== medId && m.name && m.name.toLowerCase().trim() === checkName.toLowerCase() && (m.isActive !== false && m.is_active !== false));
            }

            const existingMeds = [...existingMedsQuery, ...embeddedMedsQuery];

            if (existingMeds.length > 0) {
                return res.status(400).json({ error: 'This medication name already exists in the patient\'s records. Please use the existing entry or choose a unique name.' });
            }
        }

        // Try updating from Medication collection first
        let updatedMed = await Medication.findOneAndUpdate(
            { _id: medId, patientId },
            { $set: updateFields },
            { new: true }
        );

        // We deliberately do NOT return early here so that we can also sync the embedded docs in Patient.medications

        // If not found in Medication collection, try embedded Patient.medications
        const embeddedUpdateFields = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                embeddedUpdateFields[`medications.$.${key}`] = req.body[key];
            }
        }
        if (req.body.scheduledTimes && req.body.scheduledTimes.length > 0) {
            embeddedUpdateFields['medications.$.scheduledTimes'] = req.body.scheduledTimes;
        }

        let patient = await Patient.findOneAndUpdate(
            { $or: [{ _id: patientId }, { profile_id: patientId }], 'medications._id': medId },
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
                metaUpdateFields['metadata.medications.$.scheduledTimes'] = req.body.scheduledTimes;
            }
            patient = await Patient.findOneAndUpdate(
                { $or: [{ _id: patientId }, { profile_id: patientId }], 'metadata.medications._id': medId },
                { $set: metaUpdateFields },
                { new: true }
            );
        }

        if (!patient) {
            if (updatedMed) {
                return res.json({ medication: updatedMed });
            }
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
        if (!(await isPatientAssigned(caretakerId, patientId, req.profile.role))) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const medObjId = new mongoose.Types.ObjectId(medId);
        const patientObjId = mongoose.Types.ObjectId.isValid(patientId) ? new mongoose.Types.ObjectId(patientId) : patientId;

        // 1. Try marking inactive in Medication collection (Soft Delete)
        const med = await Medication.findOneAndUpdate(
            { _id: medObjId },
            { $set: { status: 'inactive', isActive: false, is_active: false } },
            { new: true }
        );

        let found = !!med;

        // 2. Try marking inactive in embedded arrays
        let patient1 = await Patient.findOneAndUpdate(
            { $or: [{ _id: patientObjId }, { profile_id: patientObjId }], 'medications._id': medObjId },
            { $set: { 'medications.$.isActive': false, 'medications.$.is_active': false, 'medications.$.status': 'inactive' } },
            { new: true }
        );
        
        let patient2 = null;
        if (!patient1) {
            patient2 = await Patient.findOneAndUpdate(
                { $or: [{ _id: patientObjId }, { profile_id: patientObjId }], 'metadata.medications._id': medObjId },
                { $set: { 'metadata.medications.$.isActive': false, 'metadata.medications.$.is_active': false, 'metadata.medications.$.status': 'inactive' } },
                { new: true }
            );
        }

        if (!found && !patient1 && !patient2) {
            return res.status(404).json({ error: 'Medication or Patient not found' });
        }

        // 3. Sync today's MedicineLog — mark removed med as inactive
        let medName = med ? med.name : null;
        if (!medName) {
            let mFound = patient1?.medications?.find(m => m._id.toString() === medId);
            if (!mFound) {
                mFound = patient2?.metadata?.medications?.find(m => m._id.toString() === medId);
            }
            if (mFound) medName = mFound.name || mFound.genericName;
        }

        if (medName) {
            const pDoc = patient1 || patient2 || await Patient.findById(patientObjId) || await Patient.findOne({ profile_id: patientObjId });
            if (pDoc) {
                await syncTodayMedicineLog(pDoc._id, medName, [], 'remove');
            }
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

// --- Helper to sync with Daily Checklist (MedicineLog) ---
const syncMedicineLogHelper = async (pId, d, t, mName, isTaken, role) => {
    try {
        const mongoose = require('mongoose');
        const MedicineLog = mongoose.model('MedicineLog');
        const Patient = mongoose.model('Patient');
        
        let actualPatientId = pId;
        const pt = await Patient.findOne({ $or: [{ _id: pId }, { profile_id: pId }] }).lean();
        if (pt) actualPatientId = pt._id;

        // Strictly bind to UTC midnight for the given YYYY-MM-DD to avoid timezone skew
        const targetDate = new Date(`${d}T00:00:00.000Z`);

        let log = await MedicineLog.findOne({
            patient_id: actualPatientId,
            date: targetDate
        });

        let bucket = 'morning';
        if (t) {
            const hour = parseInt(t.split(':')[0], 10);
            if (hour >= 12 && hour < 17) bucket = 'afternoon';
            else if (hour >= 17) bucket = 'night';
        }

        if (!log) {
            const medsToLog = [];
            if (pt && pt.medications) {
                for (const m of pt.medications) {
                    if (m.isActive !== false) {
                        // Use scheduledTimes first, then fall back to times, then default
                        const rawTimes = (m.scheduledTimes && m.scheduledTimes.length > 0) ? m.scheduledTimes : (m.times && m.times.length > 0) ? m.times : null;
                        const timeBuckets = rawTimes ? mapScheduledTimesToBuckets(rawTimes) : ['morning'];
                        for (const timeBucket of timeBuckets) {
                            medsToLog.push({
                                medicine_name: m.name || m.genericName,
                                scheduled_time: timeBucket,
                                taken: false,
                                is_active: true
                            });
                        }
                    }
                }
            }
            if (!medsToLog.some(m => m.medicine_name === mName && m.scheduled_time === bucket)) {
                medsToLog.push({
                    medicine_name: mName,
                    scheduled_time: bucket,
                    taken: false,
                    is_active: true
                });
            }
            log = new MedicineLog({
                patient_id: actualPatientId,
                date: targetDate,
                medicines: medsToLog
            });
            await log.save();
        }

        // Find exact medicine+bucket match. NO fallback to avoid wrong bucket for multi-dose meds.
        const dailyMed = log.medicines.find(m => 
            m.medicine_name === mName && m.scheduled_time === bucket
        );

        if (dailyMed) {
            dailyMed.taken = isTaken;
            dailyMed.taken_at = isTaken ? (t ? new Date(d + 'T' + t) : new Date()) : null;
            dailyMed.marked_by = ['caller', 'care_manager', 'org_admin', 'super_admin'].includes(role) ? 'caller' : 'patient';
            await log.save();
            console.log(`[MedicineLog Sync] Updated ${mName} to taken=${isTaken} by ${dailyMed.marked_by}`);
        } else {
            log.medicines.push({
                medicine_name: mName,
                scheduled_time: bucket,
                taken: isTaken,
                taken_at: isTaken ? (t ? new Date(d + 'T' + t) : new Date()) : null,
                marked_by: ['caller', 'care_manager', 'org_admin', 'super_admin'].includes(role) ? 'caller' : 'patient',
                is_active: true
            });
            await log.save();
            console.log(`[MedicineLog Sync] Dynamically added & updated ${mName} by caller`);
        }
    } catch(syncLogErr) {
        console.error('MedicineLog sync error during toggle:', syncLogErr);
    }
};
// ---------------------------------------------------------

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
                            // continue removed to allow 3-tier sync
                        }
                    } catch (e) { /* not in Medication collection */ }

                    // 2. Fallback: Update embedded Patient.medications
                    try {
                        await Patient.updateOne(
                            { $or: [{ _id: patientId }, { profile_id: patientId }], 'medications._id': mc.medicationId },
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

                    // 3. 3-Layer Sync: Update the Patient's Daily Checklist (MedicineLog)
                    // CRITICAL: Derive bucket from the MEDICATION's own scheduledTimes,
                    // NOT from the call's clock time. This prevents a 6 PM catch-up call
                    // from writing an Afternoon medication into the Night bucket.
                    let medBucketTime = null;
                    try {
                        // Look up the medication's own schedule to determine correct bucket
                        let medSchedule = null;
                        const medDocLookup = await Medication.findById(mc.medicationId).select('scheduledTimes times').lean();
                        if (medDocLookup) {
                            medSchedule = medDocLookup.scheduledTimes && medDocLookup.scheduledTimes.length > 0
                                ? medDocLookup.scheduledTimes : medDocLookup.times;
                        }
                        if (!medSchedule) {
                            // Check embedded Patient.medications
                            const ptDoc = await Patient.findOne(
                                { $or: [{ _id: patientId }, { profile_id: patientId }], 'medications._id': mc.medicationId },
                                { 'medications.$': 1 }
                            ).lean();
                            if (ptDoc && ptDoc.medications && ptDoc.medications[0]) {
                                const embMed = ptDoc.medications[0];
                                medSchedule = embMed.scheduledTimes && embMed.scheduledTimes.length > 0
                                    ? embMed.scheduledTimes : embMed.times;
                            }
                        }
                        // Convert the medication's schedule into a representative time string
                        // that syncMedicineLogHelper will parse into the correct bucket
                        if (medSchedule && medSchedule.length > 0) {
                            const buckets = mapScheduledTimesToBuckets(medSchedule);
                            // Use the current shift as the target if the med spans multiple shifts
                            const currentShift = getCurrentShift();
                            const targetBucket = buckets.includes(currentShift) ? currentShift : buckets[0];
                            // Convert bucket name to a representative hour for the helper
                            if (targetBucket === 'morning') medBucketTime = '08:00';
                            else if (targetBucket === 'afternoon') medBucketTime = '13:00';
                            else if (targetBucket === 'night') medBucketTime = '20:00';
                        }
                    } catch (lookupErr) {
                        console.warn('[CallLog] Med schedule lookup failed:', lookupErr.message);
                    }
                    // Fallback to call's scheduled time only if we couldn't determine from med
                    if (!medBucketTime && scheduledTime) {
                        const dObj = new Date(scheduledTime);
                        medBucketTime = String(dObj.getHours()).padStart(2, '0') + ':' + String(dObj.getMinutes()).padStart(2, '0');
                    }
                    await syncMedicineLogHelper(patientId, today, medBucketTime, mc.medicationName, true, req.profile.role);
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
        res.status(500).json({ error: 'Failed to log call', details: error.message, stack: error.stack });
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