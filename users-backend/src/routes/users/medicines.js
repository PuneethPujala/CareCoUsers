const express = require('express');
const Patient = require('../../models/Patient');
const MedicineLog = require('../../models/MedicineLog');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

/**
 * GET /api/users/medicines/today
 * Get today's medicine log for the authenticated patient
 */
router.get('/today', authenticate, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let log = await MedicineLog.findOne({
            patient_id: patient._id,
            date: today,
        });

        // If no log exists for today, auto-create from the patient's medication schedule
        if (!log && patient.medications && patient.medications.length > 0) {
            const medicines = [];
            for (const med of patient.medications) {
                if (med.is_active !== false) {
                    for (const time of med.times) {
                        medicines.push({
                            medicine_name: med.name,
                            scheduled_time: time,
                            taken: false,
                        });
                    }
                }
            }
            log = new MedicineLog({
                patient_id: patient._id,
                date: today,
                medicines,
            });
            await log.save();
        }

        // Attach dosage, instructions, and time preference to the log
        const logObj = log ? log.toObject() : { medicines: [], date: today };
        const preferences = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };
        
        if (logObj.medicines) {
            logObj.medicines = logObj.medicines.filter(m => m.is_active !== false);
            logObj.medicines = logObj.medicines.map(m => {
                const patMed = patient.medications?.find(p => p.name === m.medicine_name);
                return {
                    ...m,
                    dosage: patMed?.dosage || '',
                    instructions: patMed?.instructions || '',
                    preferred_time: preferences[m.scheduled_time] || ''
                };
            });
        }
        // Also send preferences directly in the response so the frontend can read/edit them
        res.json({ log: logObj, preferences });
    } catch (error) {
        console.error('Get today medicines error:', error);
        res.status(500).json({ error: "Failed to get today's medicines" });
    }
});

/**
 * PUT /api/users/medicines/mark
 * Mark a medicine as taken/not taken
 */
router.put('/mark', authenticate, async (req, res) => {
    try {
        const { medicine_name, scheduled_time, taken, marked_by = 'patient' } = req.body;
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const log = await MedicineLog.findOne({
            patient_id: patient._id,
            date: today,
        });

        if (!log) {
            return res.status(404).json({ error: 'No medicine log found for today' });
        }

        const med = log.medicines.find(
            (m) => m.medicine_name === medicine_name && m.scheduled_time === scheduled_time
        );

        if (!med) {
            return res.status(404).json({ error: 'Medicine not found in schedule' });
        }

        // 1. Update Daily Log
        med.taken = taken;
        med.taken_at = taken ? new Date() : null;
        med.marked_by = marked_by;
        await log.save();

        // 2. Update Patient Audit Trail
        const patientMed = patient.medications.find(m => m.name === medicine_name);
        if (patientMed) {
            // Append to takenLogs
            patientMed.takenLogs.push({
                timestamp: new Date(),
                status: taken ? 'taken' : 'missed',
                markedBy: marked_by
            });

            // If taken, update takenDates (prevent duplicate for same day)
            if (taken) {
                const todayStr = today.toDateString();
                const alreadyTakenToday = patientMed.takenDates.some(d => new Date(d).toDateString() === todayStr);
                if (!alreadyTakenToday) {
                    patientMed.takenDates.push(new Date());
                }
            }
            await patient.save();
        }

        res.json({ log });
    } catch (error) {
        console.error('Mark medicine error:', error);
        res.status(500).json({ error: 'Failed to mark medicine' });
    }
});

/**
 * GET /api/users/medicines/adherence/weekly
 * Get weekly adherence data (last 7 days)
 */
router.get('/adherence/weekly', authenticate, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: sevenDaysAgo },
        }).sort({ date: 1 });

        const weeklyData = logs.map((log) => {
            const total = log.medicines.length;
            const taken = log.medicines.filter((m) => m.taken).length;
            return {
                date: log.date,
                total,
                taken,
                missed: total - taken,
                rate: total > 0 ? Math.round((taken / total) * 100) : 0,
            };
        });

        res.json({ adherence: weeklyData });
    } catch (error) {
        console.error('Get weekly adherence error:', error);
        res.status(500).json({ error: 'Failed to get weekly adherence' });
    }
});

/**
 * GET /api/users/medicines/adherence/monthly
 * Get monthly adherence percentage
 */
router.get('/adherence/monthly', authenticate, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        });

        let totalMeds = 0;
        let takenMeds = 0;
        for (const log of logs) {
            totalMeds += log.medicines.length;
            takenMeds += log.medicines.filter((m) => m.taken).length;
        }

        res.json({
            monthly: {
                total: totalMeds,
                taken: takenMeds,
                rate: totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0,
                days_tracked: logs.length,
            },
        });
    } catch (error) {
        console.error('Get monthly adherence error:', error);
        res.status(500).json({ error: 'Failed to get monthly adherence' });
    }
});

module.exports = router;
