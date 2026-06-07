const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const MedicineLog = require('../models/MedicineLog');
const VitalLog = require('../models/VitalLog');
const { computeHealthScore } = require('./healthScoreService');
const { buildMergedMeds, computeCurrentStreak } = require('../routes/users/medicines');
const logger = require('../utils/logger');

/**
 * Recomputes the health state for a patient and caches it to the patient record in the database.
 * @param {string} patientId 
 * @returns {Promise<Object>} The computed patient_health_state object
 */
async function recomputeAndCacheHealthState(patientId) {
    try {
        let patient = await Patient.findById(patientId);
        // Robust mock execution check for tests where Patient.findById returns a non-thenable query mock
        if (patient && typeof patient.select === 'function' && !patient.save && !patient._id) {
            patient = await patient.select();
        }
        if (!patient) return null;

        const timezone = patient.timezone || 'Asia/Kolkata';
        const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
        const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);
        const todayEndUtc = new Date(`${todayStr}T23:59:59.999Z`);
        const thirtyDaysAgo = new Date(`${moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD')}T00:00:00.000Z`);

        // 1. Fetch data in parallel
        const [
            todayVitals,
            vitalsHistory,
            todayMedLog,
            adherenceLogs,
        ] = await Promise.all([
            (async () => {
                let query = VitalLog.find({
                    patient_id: patient._id,
                    date: { $gte: todayUtc, $lte: todayEndUtc },
                });
                if (!query) return [];
                if (typeof query.sort === 'function') query = query.sort({ date: -1 });
                if (typeof query.lean === 'function') query = query.lean();
                return query;
            })(),

            (async () => {
                let query = VitalLog.find({
                    patient_id: patient._id,
                    date: { $gte: thirtyDaysAgo },
                });
                if (!query) return [];
                if (typeof query.sort === 'function') query = query.sort({ date: 1 });
                if (typeof query.lean === 'function') query = query.lean();
                return query;
            })(),

            // Today's medication log or build it dynamically
            (async () => {
                let log = await MedicineLog.findOne({ patient_id: patient._id, date: todayUtc });
                // Robust mock execution check for tests where findOne returns a query mock (e.g. tests/companion.test.js)
                if (log && typeof log.then === 'function') {
                    log = await log;
                } else if (log && typeof log.lean === 'function' && !log.medicines && !log.save) {
                    log = await log.lean();
                }
                // Guard: ensure we have an actual document, not a raw query object
                if (log && !log.medicines && typeof log.lean === 'function') {
                    log = null; // query object returned instead of document
                }
                const allMedsRaw = await buildMergedMeds(patient);

                if (!log && allMedsRaw.length > 0) {
                    const medicines = [];
                    for (const med of allMedsRaw) {
                        if (med.is_active !== false) {
                            for (const time of med.times) {
                                medicines.push({ medicine_name: med.name, scheduled_time: time, taken: false });
                            }
                        }
                    }
                    if (medicines.length > 0) {
                        log = new MedicineLog({ patient_id: patient._id, date: todayUtc, medicines });
                        if (typeof log.save === 'function') await log.save();
                    }
                } else if (log && Array.isArray(log.medicines)) {
                    let isModified = false;
                    const activeMedNames = allMedsRaw.filter(m => m.is_active !== false).map(m => m.name);
                    const originalCount = log.medicines.length;
                    log.medicines = log.medicines.filter(m => activeMedNames.includes(m.medicine_name));
                    if (log.medicines.length !== originalCount) isModified = true;
                    for (const med of allMedsRaw) {
                        if (med.is_active !== false) {
                            for (const time of med.times) {
                                const exists = log.medicines.some(m => m.medicine_name === med.name && m.scheduled_time === time);
                                if (!exists) { log.medicines.push({ medicine_name: med.name, scheduled_time: time, taken: false }); isModified = true; }
                            }
                        }
                    }
                    if (isModified && typeof log.save === 'function') await log.save();
                }
                return log;
            })(),

            (async () => {
                let query = MedicineLog.find({
                    patient_id: patient._id,
                    date: { $gte: thirtyDaysAgo },
                });
                if (!query) return [];
                if (typeof query.sort === 'function') query = query.sort({ date: 1 });
                if (typeof query.lean === 'function') query = query.lean();
                return query;
            })(),
        ]);

        // Ensure arrays (auto-mocked models may return undefined)
        const safeAdherenceLogs = Array.isArray(adherenceLogs) ? adherenceLogs : [];
        const safeVitalsHistory = Array.isArray(vitalsHistory) ? vitalsHistory : [];

        // 2. Compute medication adherence & streak
        let weeklyTaken = 0;
        let weeklyTotal = 0;
        const dailyLog = [];

        for (const log of safeAdherenceLogs) {
            // Guard: skip entries without a valid date
            if (!log.date) continue;
            const active = (log.medicines || []).filter(m => m.is_active !== false);
            const taken = active.filter(m => m.taken).length;
            const total = active.length;
            const logDate = log.date instanceof Date ? log.date : new Date(log.date);
            if (isNaN(logDate.getTime())) continue;
            const dateStr = logDate.toISOString().slice(0, 10);

            if (moment(dateStr).isSameOrAfter(moment(todayStr).subtract(6, 'days'))) {
                weeklyTaken += taken;
                weeklyTotal += total;
            }

            dailyLog.push({
                date: dateStr,
                taken,
                total,
                rate: total > 0 ? Math.round((taken / total) * 100) : 0,
            });
        }

        const historyStartStr = moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD');
        const streak = computeCurrentStreak(dailyLog, todayStr, historyStartStr);
        let adherenceRate = null;
        if (weeklyTotal > 0) {
            adherenceRate = (weeklyTaken / weeklyTotal) * 100;
        }

        const todayMedsActive = todayMedLog ? (todayMedLog.medicines || []).filter(m => m.is_active !== false) : [];
        const todayMedsTaken = todayMedsActive.filter(m => m.taken).length;
        const todayMedsTotal = todayMedsActive.length;
        const todayAdherencePct = todayMedsTotal > 0 ? Math.round((todayMedsTaken / todayMedsTotal) * 100) : 0;

        // 3. Compute score/grade/label
        const latestVital = safeVitalsHistory.length > 0 ? safeVitalsHistory[safeVitalsHistory.length - 1] : null;
        const patientObj = typeof patient.toObject === 'function' ? patient.toObject() : patient;
        const scoreDetails = computeHealthScore(patientObj, adherenceRate, latestVital);

        // 4. Compute mood state (today's log, trend)
        let todayMood = null;
        const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
        const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
        const loggedToday = (patient.moodHistory || []).find(m => m.date >= todayStart && m.date <= todayEnd);
        if (loggedToday) {
            todayMood = loggedToday.mood || loggedToday.value;
        }

        // Calculate Mood Trend:
        // Convert to numbers: sad=1, okay=2, good=3, great=4
        const moodValues = { sad: 1, okay: 2, good: 3, great: 4 };
        let moodTrend = 'stable';
        const sortedMoods = (patient.moodHistory || [])
            .filter(m => m.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (sortedMoods.length >= 2) {
            const lastVal = moodValues[sortedMoods[sortedMoods.length - 1].mood || sortedMoods[sortedMoods.length - 1].value] || 2;
            const prevVal = moodValues[sortedMoods[sortedMoods.length - 2].mood || sortedMoods[sortedMoods.length - 2].value] || 2;
            if (lastVal > prevVal) moodTrend = 'improving';
            else if (lastVal < prevVal) moodTrend = 'declining';
            else moodTrend = 'stable';
        }

        // 5. Compute vitals status
        let vitalsStatus = 'stable';
        let bpStatus = 'normal';
        let hrStatus = 'normal';

        if (latestVital) {
            const hr = latestVital.heart_rate;
            const sys = latestVital.blood_pressure?.systolic ?? latestVital.systolic;
            const dia = latestVital.blood_pressure?.diastolic ?? latestVital.diastolic;
            const spo2 = latestVital.oxygen_saturation;

            // HR Status
            if (hr) {
                if (hr < 60) hrStatus = 'low';
                else if (hr <= 100) hrStatus = 'normal';
                else hrStatus = 'high';
            }

            // BP Status
            if (sys && dia) {
                if (sys < 90 || dia < 60) bpStatus = 'low';
                else if (sys <= 130 && dia <= 85) bpStatus = 'normal';
                else if (sys <= 140 && dia <= 90) bpStatus = 'elevated';
                else bpStatus = 'high';
            }

            // Vitals Status
            const isCritical = (spo2 && spo2 < 90) || (hr && (hr > 120 || hr < 45)) || (sys && sys > 160) || (dia && dia > 100);
            const isWatch = (spo2 && spo2 < 95 && spo2 >= 90) || (hr && (hr > 100 || hr < 55) && !isCritical) || (sys && (sys > 140) && !isCritical) || (dia && (dia > 90) && !isCritical);

            if (isCritical) vitalsStatus = 'critical';
            else if (isWatch) vitalsStatus = 'watch';
            else vitalsStatus = 'stable';
        }

        // 6. Compute AI coach insight & primary focus
        let primaryFocus = 'adherence';
        if (todayAdherencePct < 80 || (adherenceRate !== null && adherenceRate < 80)) {
            primaryFocus = 'adherence';
        } else if (vitalsStatus === 'critical' || vitalsStatus === 'watch') {
            primaryFocus = 'vitals';
        } else if (todayMood === 'sad' || todayMood === 'okay' || moodTrend === 'declining') {
            primaryFocus = 'mood';
        }

        let coachInsight = '';
        let suggestedQuestion = '';

        if (primaryFocus === 'adherence') {
            const incomplete = todayMedsTotal - todayMedsTaken;
            if (todayMedsTotal > 0 && incomplete === 0) {
                coachInsight = 'You have taken all medications today! Outstanding consistency.';
            } else if (incomplete === 1) {
                coachInsight = 'Only one medication remains for today. Let\'s get it done!';
            } else {
                coachInsight = 'Pairing medications with daily routines like meals helps build consistency.';
            }
            suggestedQuestion = 'How can I improve medication consistency?';
        } else if (primaryFocus === 'vitals') {
            if (vitalsStatus === 'critical') {
                coachInsight = 'Your vitals show alert values today. Please rest and consider consulting your healthcare team.';
            } else {
                coachInsight = 'Your vitals are stable, but let\'s keep monitoring them daily.';
            }
            suggestedQuestion = 'What is a normal blood pressure range for my age?';
        } else if (primaryFocus === 'mood') {
            if (todayMood === 'sad') {
                coachInsight = 'You indicated feeling low today. Take it easy and focus on small wins.';
            } else {
                coachInsight = 'Mood fluctuations are normal. Keep checking in daily for wellness trends.';
            }
            suggestedQuestion = 'How does mood affect physical health?';
        }

        // 7. Goals
        const target = scoreDetails.score < 85 ? 85
                     : scoreDetails.score < 90 ? 90
                     : scoreDetails.score < 95 ? 95
                     : 100;

        // 8. Achievements
        let nextBadge = { id: 'streak_7', progress: streak, target: 7, label: '7 Day Streak' };
        if (streak >= 7 && streak < 14) {
            nextBadge = { id: 'streak_14', progress: streak, target: 14, label: '14 Day Streak' };
        } else if (streak >= 14 && streak < 30) {
            nextBadge = { id: 'streak_30', progress: streak, target: 30, label: '30 Day Streak' };
        } else if (streak >= 30) {
            nextBadge = { id: 'unstoppable', progress: streak, target: 100, label: '100 Day Streak' };
        }

        // 9. Construct final state
        const stateObj = {
            score: scoreDetails.score,
            grade: scoreDetails.grade,
            label: scoreDetails.label,
            color: scoreDetails.color,
            mood: {
                today: todayMood,
                trend: moodTrend,
            },
            adherence: {
                today: todayAdherencePct,
                streak: streak,
            },
            vitals: {
                status: vitalsStatus,
                bp: bpStatus,
                hr: hrStatus,
            },
            coach: {
                primary_focus: primaryFocus,
                insight: coachInsight,
                suggested_question: suggestedQuestion,
                confidence: 'high',
                generated_at: new Date().toISOString(),
            },
            goals: {
                current: `Reach Score ${target}`,
                progress: scoreDetails.score,
                target: target,
            },
            achievements: {
                unlocked: patient.unlockedAchievements || [],
                next: nextBadge,
            },
        };

        // Cache state back to patient document
        patient.patient_health_state = stateObj;
        // Also update legacy health score cache
        patient.healthScoreCache = scoreDetails.score;
        patient.healthScoreUpdatedAt = new Date();

        if (typeof patient.save === 'function') {
            await patient.save();
        }

        return stateObj;
    } catch (err) {
        logger.error('[PatientHealthStateService] Recomputation failed', { error: err.message, patientId });
        return null;
    }
}

module.exports = { recomputeAndCacheHealthState };
