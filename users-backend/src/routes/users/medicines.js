const express = require('express');
const Patient = require('../../models/Patient');
const MedicineLog = require('../../models/MedicineLog');
const Medication = require('../../models/Medication');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

function mapTimeToLegacyBucket(timeStr) {
    if (!timeStr) return 'morning';
    let isPM = timeStr.toLowerCase().includes('pm');
    let isAM = timeStr.toLowerCase().includes('am');
    let match = timeStr.match(/(\d+):(\d+)/);
    if (match) {
        let hour = parseInt(match[1]);
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }
    return 'morning';
}

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

        // 1. Fetch external medications
        const searchIds = [patient._id];
        if (patient.profile_id) searchIds.push(patient.profile_id);
        const externalMeds = await Medication.find({ patientId: { $in: searchIds }, isActive: true });

        // 2. Merge existing and external medications
        const allMedsRaw = [...(patient.medications || [])];
        for (const extMed of externalMeds) {
            if (!allMedsRaw.some(m => m.name === extMed.name)) {
                let mappedTimes = extMed.times?.length > 0 ? extMed.times : (extMed.scheduledTimes || []).map(mapTimeToLegacyBucket);
                // Ensure unique times
                mappedTimes = [...new Set(mappedTimes)];
                if (mappedTimes.length === 0) mappedTimes = ['morning']; // Default fallback
                
                allMedsRaw.push({
                    name: extMed.name,
                    dosage: extMed.dosage,
                    instructions: extMed.instructions,
                    is_active: extMed.isActive,
                    times: mappedTimes
                });
            }
        }

        // If no log exists for today, auto-create from the merged medication schedule
        if (!log && allMedsRaw.length > 0) {
            const medicines = [];
            for (const med of allMedsRaw) {
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
            if (medicines.length > 0) {
                log = new MedicineLog({
                    patient_id: patient._id,
                    date: today,
                    medicines,
                });
                await log.save();
            }
        } else if (log) {
            // Reconcile: If log exists, ensure all active medications are present (mid-day additions)
            let isModified = false;
            for (const med of allMedsRaw) {
                if (med.is_active !== false) {
                    for (const time of med.times) {
                        const exists = log.medicines.some(m => m.medicine_name === med.name && m.scheduled_time === time);
                        if (!exists) {
                            log.medicines.push({
                                medicine_name: med.name,
                                scheduled_time: time,
                                taken: false,
                            });
                            isModified = true;
                        }
                    }
                }
            }
            if (isModified) {
                await log.save();
            }
        }

        // Attach dosage, instructions, and time preference to the log
        const logObj = log ? log.toObject() : { medicines: [], date: today };
        const preferences = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };
        
        if (logObj.medicines) {
            logObj.medicines = logObj.medicines.filter(m => m.is_active !== false);
            logObj.medicines = logObj.medicines.map(m => {
                const patMed = allMedsRaw.find(p => p.name === m.medicine_name);
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
            if (!patientMed.takenLogs) patientMed.takenLogs = [];
            // Append to takenLogs
            patientMed.takenLogs.push({
                timestamp: new Date(),
                status: taken ? 'taken' : 'missed',
                markedBy: marked_by
            });

            // If taken, update takenDates (prevent duplicate for same day)
            if (taken) {
                if (!patientMed.takenDates) patientMed.takenDates = [];
                const todayStr = today.toDateString();
                const alreadyTakenToday = patientMed.takenDates.some(d => new Date(d).toDateString() === todayStr);
                if (!alreadyTakenToday) {
                    patientMed.takenDates.push(new Date());
                }
            }
            await patient.save();
        } else {
            // If it's an external medication, log it there
            const searchIds = [patient._id];
            if (patient.profile_id) searchIds.push(patient.profile_id);
            const extMed = await Medication.findOne({ patientId: { $in: searchIds }, name: medicine_name });
            if (extMed) {
                if (!extMed.takenLogs) extMed.takenLogs = [];
                extMed.takenLogs.push({
                    date: today.toISOString().split('T')[0],
                    timestamp: new Date()
                });
                await extMed.save();
            }
        }

        // ── DEPRECATED: Streak gamification removed in favour of adherence tracking ──
        if (taken) {
            const streakService = require('../../../services/streakService');
            streakService.evaluateAndUpdateStreak(patient._id).catch(e => console.error('Streak Update Failed:', e));
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

/**
 * GET /api/users/medicines/adherence/details
 * Full adherence details for the AdherenceScreen:
 *   score, level, momentum, today, daily_log, achievements, weekly_summary, vitals_adherence, insights
 */
router.get('/adherence/details', authenticate, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const VitalLog = require('../../models/VitalLog');

        // ── Fetch last 30 days of logs ──────────────────────────
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: 1 });

        const vitals = await VitalLog.find({
            patient_id: patient._id,
            date: { $gte: thirtyDaysAgo },
        }).sort({ date: 1 });

        // Map vitals by date string
        const vitalsMap = {};
        for (const v of vitals) {
            const dateStr = v.date.toISOString().slice(0, 10);
            vitalsMap[dateStr] = v;
        }

        // ── Build daily log with status ─────────────────────────
        const dailyLog = logs.map((log) => {
            const dateStr = log.date.toISOString().slice(0, 10);
            const activeMeds = log.medicines.filter(m => m.is_active !== false);
            const total = activeMeds.length;
            const taken = activeMeds.filter(m => m.taken).length;
            const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
            
            let status = 'none';
            if (total === 0) status = 'none';
            else if (rate === 100) status = 'complete';
            else if (rate >= 50) status = 'partial';
            else if (rate > 0) status = 'partial';
            else status = 'missed';
            
            return {
                date: dateStr,
                taken,
                total,
                rate,
                status,
                medicines: activeMeds.map(m => ({
                    name: m.medicine_name,
                    taken: m.taken,
                    time: m.scheduled_time
                })),
                vitals: vitalsMap[dateStr] ? {
                    heart_rate: vitalsMap[dateStr].heart_rate,
                    systolic: vitalsMap[dateStr].blood_pressure?.systolic,
                    diastolic: vitalsMap[dateStr].blood_pressure?.diastolic,
                    oxygen_saturation: vitalsMap[dateStr].oxygen_saturation,
                    hydration: vitalsMap[dateStr].hydration
                } : null
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

        // Vitals adherence (last 30)
        let vitalsAdherence = 0;
        if (last30.length > 0) {
            const vitalsDays = last30.filter(d => d.vitals).length;
            vitalsAdherence = Math.round((vitalsDays / last30.length) * 100);
        }

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
            unlocked: logs.length >= 3 && morningLogs && logs[0]?.medicines?.some(m => m.scheduled_time === 'morning'),
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

        // ── AI Insights ─────────────────────────────────────────
        const insights = [];
        if (monthlyScore >= 90) {
            insights.push("Excellent consistency! Your medication routine is well-established.");
        } else {
            // Find most missed medication time
            const times = { morning: { total: 0, taken: 0 }, afternoon: { total: 0, taken: 0 }, night: { total: 0, taken: 0 } };
            logs.forEach(log => {
                log.medicines.forEach(m => {
                    if (m.is_active !== false && times[m.scheduled_time]) {
                        times[m.scheduled_time].total++;
                        if (m.taken) times[m.scheduled_time].taken++;
                    }
                });
            });
            let lowestRate = 100;
            let lowestTime = null;
            Object.keys(times).forEach(k => {
                if (times[k].total > 0) {
                    const r = (times[k].taken / times[k].total) * 100;
                    if (r < lowestRate && r < 80) { lowestRate = r; lowestTime = k; }
                }
            });
            if (lowestTime) {
                insights.push(`Insight: You frequently miss your ${lowestTime} doses (${Math.round(lowestRate)}%). Consider setting an extra reminder!`);
            } else if (monthlyScore > 0) {
                insights.push("Keep it up! Every dose counts toward your long-term health goals.");
            }
        }

        if (vitalsAdherence >= 80) insights.push("Great job consistently logging your vitals alongside your medications.");
        else if (vitalsAdherence < 30) insights.push("Try to log your vitals more frequently to build a complete health profile.");

        // ── Streak (consecutive days with rate >= 80, from today backwards) ──
        let currentStreak = 0;
        const reversedLog = [...dailyLog].reverse();
        for (const d of reversedLog) {
            if (d.total === 0) break; // No meds scheduled = break
            if (d.rate >= 80) currentStreak++;
            else break;
        }

        // ── Weekly Trend (last 7 days' rates with labels for chart) ──
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const entry = dailyLog.find(e => e.date === dateStr);
            weeklyTrend.push({
                day: dayNames[d.getDay()],
                date: dateStr,
                rate: entry ? entry.rate : 0,
            });
        }

        res.json({
            score: { weekly: weeklyScore, monthly: monthlyScore },
            level,
            momentum,
            today,
            daily_log: dailyLog,
            achievements,
            weekly_summary: weeklySummary,
            vitals_adherence: vitalsAdherence,
            insights,
            streak: currentStreak,
            weekly_trend: weeklyTrend,
        });
    } catch (error) {
        console.error('Get adherence details error:', error);
        res.status(500).json({ error: 'Failed to get adherence details' });
    }
});

/**
 * GET /api/users/medicines/adherence/recap
 * Period-based adherence recap for AdherenceScreen recap tabs & story sharing.
 * Query: ?period=weekly|monthly|yearly
 */
router.get('/adherence/recap', authenticate, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const VitalLog = require('../../models/VitalLog');

        const period = req.query.period || 'weekly';
        const now = new Date();
        let daysBack;
        if (period === 'yearly') daysBack = 365;
        else if (period === 'monthly') daysBack = 30;
        else daysBack = 7;

        let startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        startDate.setHours(0, 0, 0, 0);

        let isAllTimeFallback = false;
        if (period === 'yearly') {
            const firstLog = await MedicineLog.findOne({ patient_id: patient._id }).sort({ date: 1 });
            if (firstLog && firstLog.date > startDate) {
                startDate = new Date(firstLog.date);
                startDate.setHours(0, 0, 0, 0);
                daysBack = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
                isAllTimeFallback = true;
            }
        }

        const logs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: startDate },
        }).sort({ date: 1 });

        const vitals = await VitalLog.find({
            patient_id: patient._id,
            date: { $gte: startDate },
        });

        // ── Build daily entries ──
        const dailyEntries = logs.map((log) => {
            const activeMeds = log.medicines.filter(m => m.is_active !== false);
            const total = activeMeds.length;
            const taken = activeMeds.filter(m => m.taken).length;
            return {
                date: log.date.toISOString().slice(0, 10),
                total,
                taken,
                rate: total > 0 ? Math.round((taken / total) * 100) : 0,
                medicines: activeMeds,
            };
        });

        // ── Aggregate stats ──
        let totalScheduled = 0, totalTaken = 0;
        dailyEntries.forEach(d => { totalScheduled += d.total; totalTaken += d.taken; });
        const adherenceRate = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0;

        // ── Streaks ──
        let currentStreak = 0, bestStreak = 0, tempStreak = 0;
        const reversedEntries = [...dailyEntries].reverse();
        for (const d of reversedEntries) {
            if (d.total === 0) break;
            if (d.rate >= 80) currentStreak++;
            else break;
        }
        for (const d of dailyEntries) {
            if (d.total > 0 && d.rate >= 80) { tempStreak++; bestStreak = Math.max(bestStreak, tempStreak); }
            else tempStreak = 0;
        }

        // ── Time-slot analysis ──
        const times = { morning: { total: 0, taken: 0 }, afternoon: { total: 0, taken: 0 }, night: { total: 0, taken: 0 } };
        logs.forEach(log => {
            log.medicines.forEach(m => {
                if (m.is_active !== false && times[m.scheduled_time]) {
                    times[m.scheduled_time].total++;
                    if (m.taken) times[m.scheduled_time].taken++;
                }
            });
        });
        let mostConsistent = null, mostMissed = null, highestRate = -1, lowestRate = 101;
        Object.keys(times).forEach(k => {
            if (times[k].total > 0) {
                const r = (times[k].taken / times[k].total) * 100;
                if (r > highestRate) { highestRate = r; mostConsistent = k; }
                if (r < lowestRate) { lowestRate = r; mostMissed = k; }
            }
        });

        // ── Perfect days ──
        const perfectDays = dailyEntries.filter(d => d.rate === 100).length;

        // ── Level ──
        let level;
        if (adherenceRate >= 90) level = { key: 'optimal', label: 'Optimal', emoji: '🏆' };
        else if (adherenceRate >= 70) level = { key: 'consistent', label: 'Consistent', emoji: '🌳' };
        else if (adherenceRate >= 50) level = { key: 'improving', label: 'Improving', emoji: '🌿' };
        else level = { key: 'beginner', label: 'Beginner', emoji: '🌱' };

        // ── Top medication ──
        const medStats = {};
        logs.forEach(log => {
            log.medicines.forEach(m => {
                if (m.is_active === false) return;
                if (!medStats[m.medicine_name]) medStats[m.medicine_name] = { total: 0, taken: 0 };
                medStats[m.medicine_name].total++;
                if (m.taken) medStats[m.medicine_name].taken++;
            });
        });
        let topMed = null, topRate = -1;
        Object.keys(medStats).forEach(name => {
            const r = medStats[name].total > 0 ? Math.round((medStats[name].taken / medStats[name].total) * 100) : 0;
            if (r > topRate) { topRate = r; topMed = { name, rate: r }; }
        });

        // ── Improvement vs previous period ──
        const prevStart = new Date(startDate);
        prevStart.setDate(prevStart.getDate() - daysBack);
        const prevLogs = await MedicineLog.find({
            patient_id: patient._id,
            date: { $gte: prevStart, $lt: startDate },
        });
        let prevTotal = 0, prevTaken = 0;
        prevLogs.forEach(log => {
            log.medicines.forEach(m => {
                if (m.is_active !== false) { prevTotal++; if (m.taken) prevTaken++; }
            });
        });
        const prevRate = prevTotal > 0 ? Math.round((prevTaken / prevTotal) * 100) : 0;
        const improvement = adherenceRate - prevRate;

        // ── Vitals logged ──
        const vitalsLoggedDays = vitals.length;

        // ── Badges earned ──
        const badgesEarned = [
            perfectDays >= 1,
            bestStreak >= 3,
            adherenceRate >= 90,
            perfectDays >= 7,
            adherenceRate >= 80 && dailyEntries.length >= 25,
        ].filter(Boolean).length;

        // ── Motivational message ──
        const messages = {
            optimal: ["You're unstoppable! 🔥", "Health champion status achieved! 💪", "Consistency is your superpower! ⭐"],
            consistent: ["Great momentum — keep pushing! 🚀", "You're building healthy habits! 🌟", "Almost at the top — don't stop! 💫"],
            improving: ["Every dose counts — you're growing! 🌿", "Progress is progress, no matter how small! 📈", "Keep going, you're on the right track! 🛤️"],
            beginner: ["Today is a fresh start! 🌅", "One step at a time — you've got this! 💙", "Small steps lead to big changes! 🦋"],
        };
        const pool = messages[level.key] || messages.beginner;
        const motivationalMessage = pool[Math.floor(Math.random() * pool.length)];

        // ── Weekly trend (always include for charts) ──
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const entry = dailyEntries.find(e => e.date === dateStr);
            weeklyTrend.push({ day: dayNames[d.getDay()], date: dateStr, rate: entry ? entry.rate : 0 });
        }

        // ── Monthly trend (daily rates for 30 days) ──
        const monthlyTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const entry = dailyEntries.find(e => e.date === dateStr);
            monthlyTrend.push({ date: dateStr, day: d.getDate(), rate: entry ? entry.rate : 0 });
        }

        // ── Yearly trend (monthly averages) ──
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const yearlyTrend = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const monthEntries = dailyEntries.filter(e => e.date.startsWith(monthKey));
            const monthTotal = monthEntries.reduce((s, e) => s + e.total, 0);
            const monthTaken = monthEntries.reduce((s, e) => s + e.taken, 0);
            yearlyTrend.push({
                month: monthNames[d.getMonth()],
                rate: monthTotal > 0 ? Math.round((monthTaken / monthTotal) * 100) : 0,
                days: monthEntries.length,
            });
        }

        res.json({
            period,
            is_all_time_fallback: isAllTimeFallback,
            date_range: { start: startDate.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) },
            total_doses_scheduled: totalScheduled,
            total_doses_taken: totalTaken,
            adherence_rate: adherenceRate,
            streak_best: bestStreak,
            streak_current: currentStreak,
            most_consistent_time: mostConsistent,
            most_missed_time: mostMissed,
            perfect_days: perfectDays,
            total_days_tracked: dailyEntries.length,
            level,
            top_medication: topMed,
            improvement_vs_previous: improvement,
            vitals_logged_days: vitalsLoggedDays,
            badges_earned: badgesEarned,
            motivational_message: motivationalMessage,
            weekly_trend: weeklyTrend,
            monthly_trend: monthlyTrend,
            yearly_trend: yearlyTrend,
        });
    } catch (error) {
        console.error('Get adherence recap error:', error);
        res.status(500).json({ error: 'Failed to get adherence recap' });
    }
});

module.exports = router;
