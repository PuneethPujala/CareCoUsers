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

        // ── DEPRECATED: Streak gamification removed in favour of adherence tracking ──
        // if (taken) {
        //     const streakService = require('../../../services/streakService');
        //     streakService.evaluateAndUpdateStreak(patient._id).catch(e => console.error('Streak Update Failed:', e));
        // }

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

/**
 * GET /api/users/medicines/adherence/details
 * Full adherence details for the AdherenceScreen:
 *   score, level, momentum, today, daily_log, achievements, weekly_summary
 */
router.get('/adherence/details', authenticate, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        // ── Fetch last 30 days of logs ──────────────────────────
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: 1 });

        // ── Build daily log with status ─────────────────────────
        const dailyLog = logs.map((log) => {
            const total = log.medicines.filter(m => m.is_active !== false).length;
            const taken = log.medicines.filter(m => m.taken && m.is_active !== false).length;
            const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
            let status = 'none';
            if (total === 0) status = 'none';
            else if (rate === 100) status = 'complete';
            else if (rate >= 50) status = 'partial';
            else if (rate > 0) status = 'partial';
            else status = 'missed';
            return {
                date: log.date.toISOString().slice(0, 10),
                taken,
                total,
                rate,
                status,
            };
        });

        // ── Score calculations ──────────────────────────────────
        const last7 = dailyLog.slice(-7);
        const last30 = dailyLog;

        const calcScore = (arr) => {
            if (arr.length === 0) return 0;
            const totalMeds = arr.reduce((s, d) => s + d.total, 0);
            const takenMeds = arr.reduce((s, d) => s + d.taken, 0);
            return totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0;
        };

        const weeklyScore = calcScore(last7);
        const monthlyScore = calcScore(last30);

        // ── Consistency Level ───────────────────────────────────
        let level;
        if (monthlyScore >= 90) level = { key: 'optimal', label: 'Optimal', emoji: '🏆' };
        else if (monthlyScore >= 70) level = { key: 'consistent', label: 'Consistent', emoji: '🌳' };
        else if (monthlyScore >= 50) level = { key: 'improving', label: 'Improving', emoji: '🌿' };
        else level = { key: 'beginner', label: 'Beginner', emoji: '🌱' };

        // ── Momentum (last 3 days trend) ────────────────────────
        const last3 = dailyLog.slice(-3);
        const last3Avg = calcScore(last3);
        let momentum = 'steady';
        if (last3Avg >= 80) momentum = 'rising';
        else if (last3Avg < 60) momentum = 'falling';

        // ── Today's progress ────────────────────────────────────
        const todayEntry = dailyLog.find(d => d.date === new Date().toISOString().slice(0, 10));
        const today = todayEntry || { taken: 0, total: 0, completed: false };
        today.completed = today.total > 0 && today.taken === today.total;

        // ── Weekly summary ──────────────────────────────────────
        const weekTaken = last7.reduce((s, d) => s + d.taken, 0);
        const weekMissed = last7.reduce((s, d) => s + (d.total - d.taken), 0);
        // Compare to the 7 days before
        const prev7 = dailyLog.slice(-14, -7);
        const prevScore = calcScore(prev7);
        const improvement = weeklyScore - prevScore;

        const weeklySummary = {
            taken: weekTaken,
            missed: weekMissed,
            improvement,
        };

        // ── Achievements ────────────────────────────────────────
        const achievements = [];
        const perfectDays = dailyLog.filter(d => d.rate === 100);
        const has3Consecutive = (() => {
            let count = 0;
            for (const d of dailyLog) {
                if (d.rate >= 80) { count++; if (count >= 3) return true; }
                else count = 0;
            }
            return false;
        })();
        const morningLogs = logs.every(log =>
            log.medicines.filter(m => m.scheduled_time === 'morning' && m.is_active !== false)
                .every(m => m.taken)
        );

        achievements.push({
            key: 'first_perfect_day',
            label: 'First 100% Day',
            description: 'Complete all doses in a single day',
            emoji: '🟢',
            unlocked: perfectDays.length >= 1,
        });
        achievements.push({
            key: '3_day_consistent',
            label: '3 Days Consistent',
            description: 'Score 80%+ for 3 consecutive days',
            emoji: '🟡',
            unlocked: has3Consecutive,
        });
        achievements.push({
            key: 'never_missed_morning',
            label: 'Morning Champion',
            description: 'Never miss a morning dose',
            emoji: '🔵',
            unlocked: logs.length >= 3 && morningLogs,
        });
        achievements.push({
            key: 'weekly_90',
            label: 'Weekly 90%+',
            description: 'Achieve 90%+ in a week',
            emoji: '🟣',
            unlocked: weeklyScore >= 90,
        });
        achievements.push({
            key: '7_perfect_days',
            label: 'Perfect Week',
            description: '7 days with 100% adherence',
            emoji: '💎',
            unlocked: perfectDays.length >= 7,
        });
        achievements.push({
            key: 'monthly_consistent',
            label: 'Monthly Warrior',
            description: 'Maintain 80%+ for 30 days',
            emoji: '🏅',
            unlocked: monthlyScore >= 80 && last30.length >= 25,
        });

        res.json({
            score: { weekly: weeklyScore, monthly: monthlyScore },
            level,
            momentum,
            today,
            daily_log: dailyLog,
            achievements,
            weekly_summary: weeklySummary,
        });
    } catch (error) {
        console.error('Get adherence details error:', error);
        res.status(500).json({ error: 'Failed to get adherence details' });
    }
});

module.exports = router;
