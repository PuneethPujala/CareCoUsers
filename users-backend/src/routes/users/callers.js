const express = require('express');
const Caller = require('../../models/Caller');
const Patient = require('../../models/Patient');
const CallLog = require('../../models/CallLog');
const Alert = require('../../models/Alert');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

// Authenticate all caller routes
router.use(authenticate);

// Auto-update caller last_active_at timestamp on every API request
router.use(async (req, res, next) => {
  if (req.user && req.user.id) {
    try {
      await Caller.updateOne(
        { supabase_uid: req.user.id },
        { $set: { last_active_at: new Date() } }
      );
    } catch (e) {
      console.error(
        'Failed to update caller active timestamp (non-blocking):',
        e
      );
    }
  }
  next();
});

/**
 * GET /api/users/callers/me
 * Caller reads their own profile
 */
router.get('/me', async (req, res) => {
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
      caretakerId: caller._id,
      scheduledTime: { $gte: today, $lt: tomorrow },
    });

    // Build patient list with call status
    const patientList = patients.map((patient) => {
      const callLog = todayCalls.find(
        (c) => c.patientId.toString() === patient._id.toString()
      );
      return {
        ...patient.toJSON(),
        call_status: callLog ? callLog.status : 'pending',
        call_log_id: callLog ? callLog._id : null,
      };
    });

    // Sort: pending first, then attempted, then completed
    const statusOrder = {
      pending: 0,
      attempted: 1,
      missed: 2,
      completed: 3,
      refused: 3,
      escalated: 3,
    };
    patientList.sort(
      (a, b) =>
        (statusOrder[a.call_status] || 0) - (statusOrder[b.call_status] || 0)
    );

    const calledCount = todayCalls.filter(
      (c) => c.status === 'completed'
    ).length;

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
    const {
      patient_id,
      status,
      call_duration_seconds,
      medicine_adherence,
      caller_notes,
    } = req.body;

    const caller = await Caller.findOne({ supabase_uid: req.user.id });
    if (!caller) {
      return res.status(404).json({ error: 'Caller profile not found' });
    }

    // Verify patient is assigned to this caller
    if (!caller.patient_ids.includes(patient_id)) {
      return res.status(403).json({ error: 'Patient not assigned to you' });
    }

    const callLog = new CallLog({
      patientId: patient_id,
      caretakerId: caller._id,
      organizationId: caller.organization_id,
      scheduledTime: new Date(),
      duration: call_duration_seconds || 0,
      status,
      medicationConfirmations: medicine_adherence ? [medicine_adherence] : [],
      notes: caller_notes || '',
    });
    await callLog.save();

    // Auto-escalation: if 3 consecutive misses today
    if (status === 'missed') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const missCount = await CallLog.countDocuments({
        patientId: patient_id,
        caretakerId: caller._id,
        status: 'missed',
        scheduledTime: { $gte: today },
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
        patientId: patient_id,
        status: 'refused',
        scheduledTime: { $gte: threeDaysAgo },
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
    const patientTarget = await Patient.findById(patient_id).select(
      'expo_push_token push_notifications_enabled'
    );
    if (
      patientTarget?.expo_push_token &&
      patientTarget?.push_notifications_enabled !== false
    ) {
      const PushNotificationService = require('../../utils/pushNotifications');
      if (status === 'missed') {
        PushNotificationService.sendPush(
          patientTarget.expo_push_token,
          'We missed you! 📞',
          'Your caretaker tried to reach you. Please check your dashboard or call back when you can.'
        ).catch((err) => console.warn('Failed to send missed call push:', err));
      } else if (status === 'refused') {
        PushNotificationService.sendPush(
          patientTarget.expo_push_token,
          'Medication Alert 💊',
          'Please remember to keep up with your scheduled medications to stay healthy.'
        ).catch((err) => console.warn('Failed to send medication push:', err));
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

    // Get call history for this patient
    const calls = await CallLog.find({
      patientId: patientId,
      caretakerId: caller._id,
    })
      .sort({ scheduledTime: -1 })
      .limit(50);

    res.json({ patient, calls });
  } catch (error) {
    console.error('Get patient profile error:', error);
    res.status(500).json({ error: 'Failed to get patient profile' });
  }
});

/**
 * PATCH /api/users/callers/me/patients/:patientId/medications
 * Caller updates a patient's medication list
 */
router.patch(
  '/me/patients/:patientId/medications',
  authenticate,
  async (req, res) => {
    try {
      const caller = await Caller.findOne({ supabase_uid: req.user.id });
      if (!caller)
        return res.status(404).json({ error: 'Caller profile not found' });

      const { patientId } = req.params;
      if (!caller.patient_ids.map(String).includes(patientId)) {
        return res.status(403).json({ error: 'Patient not assigned to you' });
      }

      const { medications } = req.body;
      if (!Array.isArray(medications)) {
        return res.status(400).json({ error: 'Medications must be an array' });
      }

      const patient = await Patient.findById(patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      // Update core patient profile
      patient.medications = medications;
      await patient.save();

      // Safely synchronize today's MedicineLog
      const MedicineLog = require('../../models/MedicineLog');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const log = await MedicineLog.findOne({
        patient_id: patientId,
        date: { $gte: today, $lt: tomorrow },
      });

      if (log) {
        // Log exists, sync it
        const activeProfileMeds = new Map();
        medications.forEach((med) => {
          if (med.is_active !== false && med.times) {
            med.times.forEach((time) => {
              const VALID_TIMES = [
                'morning',
                'afternoon',
                'evening',
                'night',
                'as_needed',
              ];
              const mTime = VALID_TIMES.includes(time) ? time : 'morning';
              activeProfileMeds.set(`${med.name}_${mTime}`, {
                name: med.name,
                time: mTime,
              });
            });
          }
        });

        // Mark old/removed medications as inactive
        log.medicines.forEach((logMed) => {
          const key = `${logMed.medicine_name}_${logMed.scheduled_time}`;
          if (!activeProfileMeds.has(key)) {
            logMed.is_active = false;
          } else {
            logMed.is_active = true;
            // Remove from our active map so we only process completely NEW ones next
            activeProfileMeds.delete(key);
          }
        });

        // Add newly added medications
        activeProfileMeds.forEach(({ name, time }) => {
          log.medicines.push({
            medicine_name: name,
            scheduled_time: time,
            taken: false,
            is_active: true,
          });
        });

        await log.save();
      }

      res.json({
        message: 'Medications updated successfully',
        medications: patient.medications,
      });
    } catch (error) {
      console.error('Update medications error:', error);
      res.status(500).json({ error: 'Failed to update medications' });
    }
  }
);

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
      caretakerId: caller._id,
      status: 'completed',
      scheduledTime: { $gte: weekStart },
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

/**
 * GET /api/users/callers/me/feed
 * Caller reads their activity feed (patient alerts, missed medications, unreachable)
 */
router.get('/me/feed', authenticate, async (req, res) => {
  try {
    const caller = await Caller.findOne({ supabase_uid: req.user.id });
    if (!caller) {
      return res.status(404).json({ error: 'Caller profile not found' });
    }

    const alerts = await Alert.find({
      $or: [
        { caller_id: caller._id },
        { patient_id: { $in: caller.patient_ids } },
      ],
    })
      .populate('patient_id', 'name')
      .sort({ created_at: -1 })
      .limit(50);

    const feed = alerts.map((alert) => {
      let color = '#718096'; // default gray
      let title = 'Alert';

      if (
        alert.type === 'missed_call' ||
        alert.type === 'patient_unreachable_3attempts'
      ) {
        color = '#E53E3E'; // red
        title = 'Missed Contact';
      } else if (
        alert.type === 'medicine_refusal' ||
        alert.type === 'medication_missed'
      ) {
        color = '#DD6B20'; // orange
        title = 'Medication Alert';
      } else if (alert.type === 'medication_modification') {
        color = '#3182CE'; // blue
        title = 'Modification Request';
      } else if (alert.type === 'unresponsive_7days') {
        color = '#D69E2E'; // yellow
        title = 'Unresponsive Alert';
      }

      return {
        id: alert._id,
        title,
        patient: alert.patient_id?.name || 'Assigned Patient',
        patient_id: alert.patient_id?._id,
        desc: alert.description || 'Action required.',
        time: alert.created_at
          ? new Date(alert.created_at).toLocaleString()
          : 'Just now',
        color,
        type: alert.type,
        status: alert.status,
        prescription_url: alert.prescription_url,
        extracted_medicines: alert.extracted_medicines || [],
      };
    });

    res.json({ feed });
  } catch (error) {
    console.error('Get caller activity feed error:', error);
    res.status(500).json({ error: 'Failed to get activity feed' });
  }
});

/**
 * POST /api/users/callers/me/heartbeat
 * Update caller's last active heartbeat timestamp
 */
router.post('/me/heartbeat', authenticate, async (req, res) => {
  try {
    const caller = await Caller.findOneAndUpdate(
      { supabase_uid: req.user.id },
      { $set: { last_active_at: new Date() } },
      { new: true }
    );
    if (!caller) {
      return res.status(404).json({ error: 'Caller profile not found' });
    }
    res.json({ success: true, last_active_at: caller.last_active_at });
  } catch (error) {
    console.error('Caller heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});

/**
 * POST /api/users/callers/me/alerts/:alertId/resolve
 * Resolve/Action an alert
 */
router.post('/me/alerts/:alertId/resolve', authenticate, async (req, res) => {
  try {
    const caller = await Caller.findOne({ supabase_uid: req.user.id });
    if (!caller)
      return res.status(404).json({ error: 'Caller profile not found' });

    const alert = await Alert.findOne({ _id: req.params.alertId });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    alert.status = 'resolved';
    alert.resolved_at = new Date();
    alert.action_taken = req.body.action_taken || 'Resolved by caller';
    await alert.save();

    res.json({ success: true, alert });
  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

module.exports = router;
