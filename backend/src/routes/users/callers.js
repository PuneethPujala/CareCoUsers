const express = require('express');
const Caller = require('../../models/Caller');
const Patient = require('../../models/Patient');
const CallLog = require('../../models/CallLog');
const Alert = require('../../models/Alert');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

/**
 * GET /api/users/callers/me
 * Caller reads their own profile
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const caller = await Caller.findOne({ supabase_uid: req.user.id });
        if (!caller) {
            return res.status(404).json({ error: 'Caller profile not found' });
        }
        res.json({ caller });
    } catch (error) {
        console.error('Get caller profile error:', error);
        res.status(500).json({ error: 'Failed to get caller profile' });
    }
});

/**
 * GET /api/users/callers/me/patients/today
 * Caller gets today's patient call list
 */
router.get('/me/patients/today', authenticate, async (req, res) => {
    try {
        const caller = await Caller.findOne({ supabase_uid: req.user.id });
        if (!caller) {
            return res.status(404).json({ error: 'Caller profile not found' });
        }

        // Get all assigned patients
        const patients = await Patient.find({
            _id: { $in: caller.patient_ids },
        }).select('name email city conditions medications emergency_contact');

        // Get today's call logs
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayCalls = await CallLog.find({
            caller_id: caller._id,
            call_date: { $gte: today, $lt: tomorrow },
        });

        // Build patient list with call status
        const patientList = patients.map((patient) => {
            const callLog = todayCalls.find(
                (c) => c.patient_id.toString() === patient._id.toString()
            );
            return {
                ...patient.toJSON(),
                call_status: callLog ? callLog.status : 'pending',
                call_log_id: callLog ? callLog._id : null,
            };
        });

        // Sort: pending first, then attempted, then completed
        const statusOrder = { pending: 0, attempted: 1, missed: 2, completed: 3, refused: 3, escalated: 3 };
        patientList.sort((a, b) => (statusOrder[a.call_status] || 0) - (statusOrder[b.call_status] || 0));

        const calledCount = todayCalls.filter((c) => c.status === 'completed').length;

        res.json({
            patients: patientList,
            summary: {
                total: patients.length,
                called: calledCount,
                pending: patients.length - calledCount,
                date: today.toISOString(),
            },
        });
    } catch (error) {
        console.error('Get today patients error:', error);
        res.status(500).json({ error: "Failed to get today's patient list" });
    }
});

/**
 * POST /api/users/callers/me/calls
 * Caller logs a call — mark as called, can't reach, or refused
 */
router.post('/me/calls', authenticate, async (req, res) => {
    try {
        const { patient_id, status, call_duration_seconds, medicine_adherence, caller_notes } = req.body;

        const caller = await Caller.findOne({ supabase_uid: req.user.id });
        if (!caller) {
            return res.status(404).json({ error: 'Caller profile not found' });
        }

        // Verify patient is assigned to this caller
        if (!caller.patient_ids.includes(patient_id)) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const callLog = new CallLog({
            patient_id,
            caller_id: caller._id,
            manager_id: caller.manager_id,
            organization_id: caller.organization_id,
            call_date: new Date(),
            call_duration_seconds: call_duration_seconds || 0,
            status,
            medicine_adherence: medicine_adherence || {},
            caller_notes: caller_notes || '',
        });
        await callLog.save();

        // Auto-escalation: if 3 consecutive misses today
        if (status === 'missed') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const missCount = await CallLog.countDocuments({
                patient_id,
                caller_id: caller._id,
                status: 'missed',
                call_date: { $gte: today },
            });

            if (missCount >= 3) {
                const alert = new Alert({
                    type: 'patient_unreachable_3attempts',
                    patient_id,
                    caller_id: caller._id,
                    manager_id: caller.manager_id,
                    organization_id: caller.organization_id,
                    description: `Patient not reached after ${missCount} attempts today`,
                });
                await alert.save();
            }
        }

        // Auto-escalation: medicine refusal
        if (status === 'refused') {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const refusalCount = await CallLog.countDocuments({
                patient_id,
                status: 'refused',
                call_date: { $gte: threeDaysAgo },
            });

            if (refusalCount >= 3) {
                const alert = new Alert({
                    type: 'medicine_refusal',
                    patient_id,
                    caller_id: caller._id,
                    manager_id: caller.manager_id,
                    organization_id: caller.organization_id,
                    description: `Patient has refused medicine ${refusalCount} times in the last 3 days`,
                });
                await alert.save();
            }
        }

        // Trigger Push Notifications to the Patient
        const patientTarget = await Patient.findById(patient_id).select('expo_push_token push_notifications_enabled');
        if (patientTarget?.expo_push_token && patientTarget?.push_notifications_enabled !== false) {
            const PushNotificationService = require('../../utils/pushNotifications');
            if (status === 'missed') {
                PushNotificationService.sendPush(
                    patientTarget.expo_push_token,
                    'We missed you! 📞',
                    'Your caretaker tried to reach you. Please check your dashboard or call back when you can.'
                ).catch(err => console.warn('Failed to send missed call push:', err));
            } else if (status === 'refused') {
                PushNotificationService.sendPush(
                    patientTarget.expo_push_token,
                    'Medication Alert 💊',
                    'Please remember to keep up with your scheduled medications to stay healthy.'
                ).catch(err => console.warn('Failed to send medication push:', err));
            }
        }

        res.status(201).json({ message: 'Call logged successfully', callLog });
    } catch (error) {
        console.error('Log call error:', error);
        res.status(500).json({ error: 'Failed to log call' });
    }
});

/**
 * GET /api/users/callers/me/patients/:patientId
 * Caller reads a specific assigned patient's profile
 * NOTE: admin_notes and internal clinical notes are NOT visible
 */
router.get('/me/patients/:patientId', authenticate, async (req, res) => {
    try {
        const caller = await Caller.findOne({ supabase_uid: req.user.id });
        if (!caller) {
            return res.status(404).json({ error: 'Caller profile not found' });
        }

        const { patientId } = req.params;
        if (!caller.patient_ids.map(String).includes(patientId)) {
            return res.status(403).json({ error: 'Patient not assigned to you' });
        }

        const patient = await Patient.findById(patientId);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Get call history for this patient (caller_notes visible to caller, admin_notes stripped)
        const calls = await CallLog.find({
            patient_id: patientId,
            caller_id: caller._id,
        })
            .select('-admin_notes')
            .sort({ call_date: -1 })
            .limit(50);

        res.json({ patient, calls });
    } catch (error) {
        console.error('Get patient profile error:', error);
        res.status(500).json({ error: 'Failed to get patient profile' });
    }
});

/**
 * GET /api/users/callers/me/stats
 * Caller reads their performance stats
 */
router.get('/me/stats', authenticate, async (req, res) => {
    try {
        const caller = await Caller.findOne({ supabase_uid: req.user.id });
        if (!caller) {
            return res.status(404).json({ error: 'Caller profile not found' });
        }

        // This week's calls
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const weekCalls = await CallLog.countDocuments({
            caller_id: caller._id,
            status: 'completed',
            call_date: { $gte: weekStart },
        });

        res.json({
            performance: {
                ...caller.performance,
                calls_this_week: weekCalls,
            },
            patient_count: caller.patient_ids.length,
        });
    } catch (error) {
        console.error('Get caller stats error:', error);
        res.status(500).json({ error: 'Failed to get caller stats' });
    }
});

module.exports = router;
