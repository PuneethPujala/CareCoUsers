const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const CompanionAiInsight = require('../models/CompanionAiInsight');
const CompanionAiInsightHistory = require('../models/CompanionAiInsightHistory');
const AIVitalPrediction = require('../models/AIVitalPrediction');
const VitalLog = require('../models/VitalLog');
const MedicineLog = require('../models/MedicineLog');
const PatientHealthStateHistory = require('../models/PatientHealthStateHistory');
const { buildPatientContext } = require('./aiContextService');
const logger = require('../utils/logger');
const axios = require('axios');

// Import Predictive Intelligence Services
const { calculateConsistency } = require('./adherenceConsistencyService');
const { calculateRiskTrends } = require('./riskTrendService');
const { detectRecovery } = require('./recoveryDetectionService');
const { forecastTrajectory } = require('./trajectoryForecastService');
const { calculateMomentum } = require('./healthMomentumService');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Enqueues a companion insights generation job to BullMQ.
 * Implements a 2-minute debounce delay and job-replacement behavior.
 * @param {string} patientId 
 */
async function enqueueCompanionInsights(patientId, delay = 120000) {
    if (process.env.NODE_ENV !== 'test' && process.env.USE_BULLMQ_WORKERS !== 'true') {
        logger.info(`[CompanionAIService] Running in-process background companion-insights generation for patient ${patientId} (delay: ${delay}ms)`);
        setTimeout(() => {
            generateAndCacheInsights(patientId).catch(err => {
                logger.error('[CompanionAIService] In-process background insights generation failed', { error: err.message, patientId });
            });
        }, delay);
        return;
    }
    try {
        const { companionInsightsQueue } = require('../jobs/jobQueues');
        if (!companionInsightsQueue) {
            logger.warn('[CompanionAIService] companionInsightsQueue not initialized. Executing synchronously.');
            await generateAndCacheInsights(patientId);
            return;
        }

        const jobId = `companion-insights-${patientId}`;
        
        // Remove existing delayed job if any (Job Replacement / Debouncing)
        const existingJob = await companionInsightsQueue.getJob(jobId);
        if (existingJob) {
            await existingJob.remove();
            logger.info(`[CompanionAIService] Removed existing delayed job for patient ${patientId}`);
        }

        // Add fresh job with a custom delay
        await companionInsightsQueue.add(
            'generate',
            { patientId },
            {
                jobId,
                delay,
            }
        );
        logger.info(`[CompanionAIService] Enqueued debounced companion-insights generation for patient ${patientId} (2-minute delay)`);
    } catch (err) {
        logger.warn('[CompanionAIService] Queue unavailable, falling back to synchronous execution', { error: err.message, patientId });
        await generateAndCacheInsights(patientId);
    }
}

/**
 * Deterministically computes caregiver metrics, runs risk engine rules,
 * queries Groq for the caregiver briefing narrative, and updates the cache.
 * @param {string} patientId 
 * @param {boolean} isManualRefresh
 * @returns {Promise<Object>} The generated/cached CompanionAiInsight document
 */
async function generateAndCacheInsights(patientId, isManualRefresh = false, skipLlmCall = false) {
    try {
        const patient = await Patient.findById(patientId);
        if (!patient) return null;

        const timezone = patient.timezone || 'Asia/Kolkata';
        const nowLocal = moment().tz(timezone);
        const todayStr = nowLocal.format('YYYY-MM-DD');
        const fourteenDaysAgo = nowLocal.clone().subtract(14, 'days').startOf('day').toDate();
        const thirtyDaysAgo = nowLocal.clone().subtract(30, 'days').startOf('day').toDate();

        // 1. Fetch Patient Context & Predictions in parallel
        const [patientContext, latestPrediction, vitalsCount14d, recentVitals3dExist, healthHistorySnapshots] = await Promise.all([
            buildPatientContext(patientId),
            AIVitalPrediction.findOne({ patient_id: patientId }).lean(),
            VitalLog.countDocuments({ patient_id: patientId, date: { $gte: fourteenDaysAgo } }),
            VitalLog.exists({ patient_id: patientId, date: { $gte: nowLocal.clone().subtract(3, 'days').startOf('day').toDate() } }),
            PatientHealthStateHistory.find({ patient_id: patientId }).sort({ date: 1 }).limit(30).lean()
        ]);

        if (!patientContext) return null;

        // 2. Fetch Logs for Stability Calculations
        const [medLogs30d, vitalLogs30d] = await Promise.all([
            MedicineLog.find({ patient_id: patientId, date: { $gte: thirtyDaysAgo } }).lean(),
            VitalLog.find({ patient_id: patientId, date: { $gte: thirtyDaysAgo } }).lean()
        ]);

        // 3. Compute Deterministic Care Visibility Score (Max 100)
        let medsScore = 35; // Default to full points if no meds configured
        const todayStatus = patientContext.today_status;
        if (todayStatus && todayStatus.total_scheduled > 0) {
            const loggedSlotsCount = todayStatus.taken + todayStatus.missed; // taken or missed is logged
            medsScore = Math.round((loggedSlotsCount / todayStatus.total_scheduled) * 35);
        }

        // Vitals logging score (Max 35)
        let vitalsScore = 0;
        const lastVital = vitalLogs30d.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        if (lastVital) {
            const hoursSinceVital = moment().diff(moment(lastVital.date), 'hours');
            if (hoursSinceVital <= 24) vitalsScore = 35;
            else if (hoursSinceVital <= 48) vitalsScore = 20;
            else if (hoursSinceVital <= 72) vitalsScore = 10;
        }

        // Wearable connection score (Max 15)
        const wearableScore = patient.lifestyle?.device_sync_status !== 'disconnected' ? 15 : 0;

        // Mood score (Max 15)
        let moodScore = 0;
        const moodLogsSorted = (patient.moodHistory || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastMoodLog = moodLogsSorted[0];
        if (lastMoodLog) {
            const hoursSinceMood = moment().diff(moment(lastMoodLog.date), 'hours');
            if (hoursSinceMood <= 24) moodScore = 15;
            else if (hoursSinceMood <= 48) moodScore = 7;
        }

        const visibilityScore = medsScore + vitalsScore + wearableScore + moodScore;
        const visibilityLabel = visibilityScore >= 80 ? 'High' : visibilityScore >= 50 ? 'Medium' : 'Low';
        const visibilityBreakdown = {
            medications: medsScore,
            vitals: vitalsScore,
            wearable: wearableScore,
            mood: moodScore
        };

        // 4. Compute Forecast Confidence Score (Max 100)
        let confidenceScore = 40;
        if (vitalsCount14d >= 10) confidenceScore = 95;
        else if (vitalsCount14d >= 7) confidenceScore = 75;
        const confidenceLabel = confidenceScore >= 90 ? 'High' : confidenceScore >= 70 ? 'Medium' : 'Low';

        // 5. Run Deterministic Risk Engine & Compile Factors
        const riskFactors = [];
        let riskLevel = 'low';
        let riskScore = 15; // Baseline low risk score

        const todayAdherence = patientContext.patient_health_state?.adherence?.today ?? 0;
        const weeklyAdherenceRaw = patientContext.recent_adherence?.rate ? parseInt(patientContext.recent_adherence.rate, 10) : 100;
        const weeklyAdherence = isNaN(weeklyAdherenceRaw) ? 100 : weeklyAdherenceRaw;
        const vitalStatus = patientContext.patient_health_state?.vitals?.status || 'stable';
        const predictedStatus = latestPrediction?.health_label || 'Normal';
        const moodTrend = patientContext.patient_health_state?.mood?.trend || 'stable';

        // Cumulative risk score calculation (finer-grained variance)
        let computedAdherenceLoss = Math.max(0, (100 - todayAdherence) * 0.2) + Math.max(0, (100 - weeklyAdherence) * 0.2);
        riskScore += computedAdherenceLoss;

        if (vitalStatus === 'critical') riskScore += 50;
        else if (vitalStatus === 'watch') riskScore += 25;

        if (predictedStatus === 'Critical') riskScore += 45;
        else if (predictedStatus === 'Warning') riskScore += 20;

        if (!recentVitals3dExist) riskScore += 25;
        if (moodTrend === 'declining') riskScore += 15;
        if (lastMoodLog?.value === 'sad' || lastMoodLog?.mood === 'sad') riskScore += 10;

        // Flags check to enforce mapping category floors
        let hasHighRiskFlags = false;
        let hasMediumRiskFlags = false;

        // High Risk Rules
        if (todayAdherence < 60) {
            hasHighRiskFlags = true;
            riskFactors.push(`Today's medication adherence is critical (${todayAdherence}%)`);
        }
        if (weeklyAdherence < 60) {
            hasHighRiskFlags = true;
            riskFactors.push(`Weekly medication compliance is critical (${weeklyAdherence}%)`);
        }
        if (vitalStatus === 'critical') {
            hasHighRiskFlags = true;
            riskFactors.push('Latest vital log indicates critical biometrics');
        }
        if (predictedStatus === 'Critical') {
            hasHighRiskFlags = true;
            riskFactors.push('AI vital forecast predicts critical health risk');
        }

        // Medium Risk Rules
        if (todayAdherence < 75) {
            hasMediumRiskFlags = true;
            if (!hasHighRiskFlags) {
                riskFactors.push(`Today's medication adherence is below target (${todayAdherence}%)`);
            }
        }
        if (weeklyAdherence < 75) {
            hasMediumRiskFlags = true;
            if (!hasHighRiskFlags) {
                riskFactors.push(`Weekly medication compliance is below target (${weeklyAdherence}%)`);
            }
        }
        if (vitalStatus === 'watch') {
            hasMediumRiskFlags = true;
            if (!hasHighRiskFlags) {
                riskFactors.push('Latest vital log indicates moderate alert (watch status)');
            }
        }
        if (predictedStatus === 'Warning') {
            hasMediumRiskFlags = true;
            if (!hasHighRiskFlags) {
                riskFactors.push('AI vital forecast predicts warning trend');
            }
        }
        if (!recentVitals3dExist) {
            hasMediumRiskFlags = true;
            if (!hasHighRiskFlags) {
                riskFactors.push('No blood pressure or heart rate sync in over 3 days');
            }
        }
        if (moodTrend === 'declining') {
            hasMediumRiskFlags = true;
            if (!hasHighRiskFlags) {
                riskFactors.push('Mood tracking shows declining emotional check-ins');
            }
        }

        // Apply floors to ensure categorical mapping consistency
        if (hasHighRiskFlags) {
            riskScore = Math.max(70, riskScore);
        } else if (hasMediumRiskFlags) {
            riskScore = Math.max(40, riskScore);
        }

        // Bounded between 0 and 100
        riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));

        // Final level mapping
        if (riskScore >= 70) {
            riskLevel = 'high';
        } else if (riskScore >= 40) {
            riskLevel = 'medium';
        } else {
            riskLevel = 'low';
        }

        // 5.1 Calculate Risk Breakdown proportional components (summing up to riskScore)
        const adherenceLoss = Math.round(computedAdherenceLoss);
        const vitalsLoss = (vitalStatus === 'critical' ? 50 : vitalStatus === 'watch' ? 25 : 0) + 
                           (predictedStatus === 'Critical' ? 45 : predictedStatus === 'Warning' ? 20 : 0);
        const moodLoss = (moodTrend === 'declining' ? 15 : 0) + 
                         (lastMoodLog?.value === 'sad' || lastMoodLog?.mood === 'sad' ? 10 : 0);
        const visibilityLoss = !recentVitals3dExist ? 25 : 0;

        const sumComponents = adherenceLoss + vitalsLoss + moodLoss + visibilityLoss;
        let finalAdherence = adherenceLoss;
        let finalVitals = vitalsLoss;
        let finalMood = moodLoss;
        let finalVisibility = visibilityLoss;

        if (riskScore > sumComponents) {
            const diff = riskScore - sumComponents;
            if (sumComponents === 0) {
                finalAdherence = Math.round(diff * 0.4);
                finalVitals = Math.round(diff * 0.35);
                finalMood = Math.round(diff * 0.1);
                finalVisibility = Math.round(diff * 0.15);
            } else {
                finalAdherence += Math.round(diff * (adherenceLoss / sumComponents));
                finalVitals += Math.round(diff * (vitalsLoss / sumComponents));
                finalMood += Math.round(diff * (moodLoss / sumComponents));
                finalVisibility += Math.round(diff * (visibilityLoss / sumComponents));
            }
        }
        const roundedSum = finalAdherence + finalVitals + finalMood + finalVisibility;
        if (roundedSum !== riskScore) {
            finalVitals += (riskScore - roundedSum);
        }

        const riskBreakdown = {
            adherence: Math.max(0, finalAdherence),
            vitals: Math.max(0, finalVitals),
            mood: Math.max(0, finalMood),
            visibility: Math.max(0, finalVisibility)
        };

        // 6. Risk Trend Calculation
        const existingInsight = await CompanionAiInsight.findOne({ patient_id: patientId });
        
        if (existingInsight && existingInsight.risk_level !== riskLevel) {
            try {
                const RiskTransition = require('../models/RiskTransition');
                await RiskTransition.create({
                    patient_id: patientId,
                    date: new Date(),
                    from: existingInsight.risk_level || 'low',
                    to: riskLevel
                });
                logger.info(`[CompanionAIService] Logged risk transition for patient ${patientId}: ${existingInsight.risk_level} -> ${riskLevel}`);
            } catch (err) {
                logger.error('[CompanionAIService] Failed to log risk transition', { error: err.message, patientId });
            }
        }

        let riskTrend = { previous: 'low', current: riskLevel, direction: 'stable' };
        let trendDelta = { risk_score: 0, visibility_score: 0, confidence_score: 0 };
        if (existingInsight) {
            const prev = existingInsight.risk_level;
            let direction = 'stable';
            
            const levelScores = { low: 1, medium: 2, high: 3 };
            const prevScore = levelScores[prev] || 1;
            const currScore = levelScores[riskLevel] || 1;

            if (currScore < prevScore) direction = 'improving';
            else if (currScore > prevScore) direction = 'worsening';

            riskTrend = { previous: prev, current: riskLevel, direction };

            trendDelta = {
                risk_score: riskScore - (existingInsight.risk_score ?? 0),
                visibility_score: visibilityScore - (existingInsight.visibility_score ?? 0),
                confidence_score: confidenceScore - (existingInsight.confidence_score ?? 0)
            };
        }

        // 7. Calculate Stable Period Streak (Last Seen Healthy)
        let currentlyStable = true;
        let stableDaysCount = 0;
        let lastStableAt = null;

        // Map logs by date string
        const logsByDate = {};
        medLogs30d.forEach(log => {
            if (log.date) {
                const dKey = moment(log.date).format('YYYY-MM-DD');
                logsByDate[dKey] = logsByDate[dKey] || { meds: [], vitals: [], mood: null };
                const activeMeds = (log.medicines || []).filter(m => m.is_active !== false);
                logsByDate[dKey].meds = activeMeds;
            }
        });

        vitalLogs30d.forEach(log => {
            if (log.date) {
                const dKey = moment(log.date).format('YYYY-MM-DD');
                logsByDate[dKey] = logsByDate[dKey] || { meds: [], vitals: [], mood: null };
                logsByDate[dKey].vitals.push(log);
            }
        });

        (patient.moodHistory || []).forEach(log => {
            if (log.date) {
                const dKey = moment(log.date).format('YYYY-MM-DD');
                logsByDate[dKey] = logsByDate[dKey] || { meds: [], vitals: [], mood: null };
                logsByDate[dKey].mood = log.value || log.mood;
            }
        });

        // Loop backwards over past 30 days
        for (let i = 0; i < 30; i++) {
            const dStr = nowLocal.clone().subtract(i, 'days').format('YYYY-MM-DD');
            const dayData = logsByDate[dStr] || { meds: [], vitals: [], mood: null };
            
            // Assess day stability:
            let dayStable = true;

            // 1. Adherence: must be >= 75% if meds scheduled
            if (dayData.meds.length > 0) {
                const taken = dayData.meds.filter(m => m.taken).length;
                const rate = (taken / dayData.meds.length) * 100;
                if (rate < 75) dayStable = false;
            }

            // 2. Vitals: no critical thresholds hit
            if (dayStable && dayData.vitals.length > 0) {
                for (const v of dayData.vitals) {
                    const sys = v.blood_pressure?.systolic || v.systolic;
                    const dia = v.blood_pressure?.diastolic || v.diastolic;
                    const hr = v.heart_rate;
                    const ox = v.oxygen_saturation;

                    if ((sys && sys > 140) || (dia && dia > 90) || (hr && (hr > 100 || hr < 55)) || (ox && ox < 92)) {
                        dayStable = false;
                        break;
                    }
                }
            }

            // 3. Mood: cannot be sad
            if (dayStable && dayData.mood === 'sad') {
                dayStable = false;
            }

            if (i === 0) {
                currentlyStable = dayStable;
            }

            if (currentlyStable) {
                if (dayStable) {
                    stableDaysCount++;
                } else {
                    break;
                }
            } else {
                if (dayStable) {
                    lastStableAt = moment(dStr).toDate();
                    break;
                }
            }
        }

        const lastStable = {
            stable_days: currentlyStable ? stableDaysCount : 0,
            last_stable_at: currentlyStable ? null : lastStableAt,
            currently_stable: currentlyStable,
            unstable_since: currentlyStable ? null : (lastStableAt ? moment(lastStableAt).add(1, 'day').toDate() : thirtyDaysAgo)
        };

        // 8. Compile Priority Actions Queue with Severity
        const priorityActions = [];

        if (vitalStatus === 'critical' || predictedStatus === 'Critical') {
            priorityActions.push({
                action_type: 'critical_vital',
                priority: 1,
                severity: 'critical',
                message: 'Vitals trend indicates critical health risk'
            });
        }

        if (todayAdherence < 60 || weeklyAdherence < 60) {
            priorityActions.push({
                action_type: 'medication',
                priority: 1,
                severity: 'critical',
                message: 'Patient compliance dropped below critical threshold (60%)'
            });
        } else if (todayAdherence < 75 || weeklyAdherence < 75) {
            priorityActions.push({
                action_type: 'medication',
                priority: 2,
                severity: 'warning',
                message: 'Patient medication compliance is below target (75%)'
            });
        }

        if (!recentVitals3dExist) {
            const daysSinceVital = lastVital ? moment().diff(moment(lastVital.date), 'days') : 30;
            priorityActions.push({
                action_type: 'vital_sync',
                priority: 2,
                severity: 'warning',
                message: `No blood pressure readings synced in ${daysSinceVital} days`
            });
        }

        if (moodTrend === 'declining' || lastMoodLog?.value === 'sad') {
            priorityActions.push({
                action_type: 'mood_check',
                priority: 3,
                severity: 'info',
                message: 'Mood tracking shows declining emotional check-ins'
            });
        }

        // Sort priority actions by priority ascending (1 is highest)
        priorityActions.sort((a, b) => a.priority - b.priority);

        // 9. Generate AI Caregiver Briefing Summary & Recommendations
        let summaryText = '';
        let recommendations = [];
        let generationMeta = {
            provider: 'groq',
            model: GROQ_MODEL,
            generated_with_ai: false,
            fallback_used: true
        };

        if (GROQ_API_KEY && !skipLlmCall) {
            const prompt = `
You are CareMyMed's Caregiver AI decision support assistant.
You are generating a caregiver briefing and specific recommendations for ${patient.name}'s family companion.

Here is the deterministic data and calculated metrics:
- Patient Name: ${patient.name}
- Risk Level: ${riskLevel.toUpperCase()}
- Deterministic Risk Factors: ${riskFactors.join('; ') || 'All metrics stable.'}
- Data Visibility: ${visibilityScore}% (${visibilityLabel})
- Confidence Level: ${confidenceLabel} (Vitals sync count: ${vitalsCount14d})
- Primary Action Items: ${priorityActions.map(a => a.message).join('; ') || 'No critical actions.'}
- Recent Medication Adherence: Today ${todayAdherence}%, Weekly ${weeklyAdherence}%

Instructions:
1. Write a professional, encouraging, and highly scannable 2-3 sentence summary brief for the family caregiver. Refer directly to ${patient.name} and explain the underlying reasons for their risk level.
2. Provide a list of exactly 2-3 actionable caregiver recommendations (e.g. "Send a quick nudge reminder for afternoon meds", "Call Jane to chat because she reported a low mood").
3. Respond ONLY with a valid JSON object. Do not include markdown code block syntax.
JSON Schema:
{
  "summary": "narrative brief here",
  "recommendations": ["rec 1", "rec 2"]
}
`;

            try {
                const response = await axios.post(GROQ_URL, {
                    model: GROQ_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' }
                }, {
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 25000
                });

                const content = response.data?.choices?.[0]?.message?.content?.trim();
                const parsed = JSON.parse(content);
                
                if (parsed.summary && Array.isArray(parsed.recommendations)) {
                    summaryText = parsed.summary;
                    recommendations = parsed.recommendations;
                    generationMeta.generated_with_ai = true;
                    generationMeta.fallback_used = false;
                }
            } catch (err) {
                logger.error('[CompanionAIService] Groq API call failed, using rule-based fallback.', { error: err.message });
            }
        }

        // Apply local rule-based fallback if LLM failed or API key was missing
        if (!summaryText || recommendations.length === 0) {
            if (riskLevel === 'high') {
                summaryText = `${patient.name} is currently flagged as High Risk due to: ${riskFactors.join(', ')}. Immediate care coordinator follow-up is advised.`;
                recommendations = [
                    "Send an urgent medication reminder nudge to their device",
                    `Contact ${patient.name.split(' ')[0]} directly to check on their wellness`
                ];
            } else if (riskLevel === 'medium') {
                summaryText = `${patient.name}'s risk level is moderate. Main issues: ${riskFactors.join(', ')}. Monitor their tracking details closely.`;
                recommendations = [
                    `Verify medication adherence before their evening doses`,
                    "Request a blood pressure log sync to improve data visibility and forecast quality"
                ];
            } else {
                summaryText = `${patient.name}'s vitals and medication adherence are currently stable. Overall caregiver visibility is ${visibilityLabel}.`;
                recommendations = [
                    "Keep encouraging their daily medication logging routine",
                    `Schedule a routine care check-in call with ${patient.name.split(' ')[0]}`
                ];
            }
        }

        // 9.5 Compute Predictive Health Intelligence Metrics
        const consistencyMetrics = calculateConsistency(healthHistorySnapshots);
        const riskTrendMetrics = calculateRiskTrends(healthHistorySnapshots, riskScore);
        const recoveryMetrics = detectRecovery(healthHistorySnapshots, riskScore, priorityActions, visibilityScore);
        const trajectoryMetrics = forecastTrajectory(healthHistorySnapshots, patientContext.patient_health_state?.score ?? 82);
        const momentumMetrics = calculateMomentum(healthHistorySnapshots, {
            score: patientContext.patient_health_state?.score ?? 82,
            adherence: todayAdherence,
            streak: patientContext.patient_health_state?.adherence?.streak ?? 0,
            mood: lastMoodLog?.value || lastMoodLog?.mood || 'good'
        });

        const predictiveHealth = {
            momentum: {
                score: momentumMetrics.momentum_score,
                direction: momentumMetrics.momentum_direction
            },
            consistency: {
                score: consistencyMetrics.adherence_consistency
            },
            risk_trends: {
                velocity: riskTrendMetrics.velocity,
                acceleration: riskTrendMetrics.acceleration
            },
            recovery: {
                status: recoveryMetrics.recovery_status,
                days: recoveryMetrics.recovery_days,
                confidence: recoveryMetrics.confidence
            },
            forecast: {
                projected_score_14d: trajectoryMetrics.projected_score_14d,
                trajectory: trajectoryMetrics.trajectory
            }
        };

        // 10. Save/Upsert to Mongoose CompanionAiInsight Collection
        const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours expiration

        const insightDoc = await CompanionAiInsight.findOneAndUpdate(
            { patient_id: patientId },
            {
                patient_id: patientId,
                schema_version: 1,
                summary: summaryText,
                recommendations,
                risk_level: riskLevel,
                risk_score: riskScore,
                risk_breakdown: riskBreakdown,
                risk_factors: riskFactors,
                risk_trend: riskTrend,
                trend_delta: trendDelta,
                visibility_score: visibilityScore,
                visibility_label: visibilityLabel,
                visibility_breakdown: visibilityBreakdown,
                confidence_score: confidenceScore,
                confidence_label: confidenceLabel,
                last_stable: lastStable,
                priority_actions: priorityActions,
                predictive_health: predictiveHealth,
                generation_meta: generationMeta,
                generated_at: new Date(),
                expires_at: expiresAt
            },
            { upsert: true, new: true }
        );

        logger.info(`[CompanionAIService] Saved companion AI insights for patient ${patientId} (Risk: ${riskLevel}, Score: ${riskScore}, Visibility: ${visibilityScore}%)`);

        // 11. Save historical snapshot (60-day expiration)
        try {
            const historyExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
            await CompanionAiInsightHistory.create({
                patient_id: patientId,
                schema_version: 1,
                risk_level: riskLevel,
                risk_score: riskScore,
                risk_breakdown: riskBreakdown,
                visibility_score: visibilityScore,
                confidence_score: confidenceScore,
                generated_at: new Date(),
                expires_at: historyExpiresAt
            });
            logger.info(`[CompanionAIService] Saved companion AI historical snapshot for patient ${patientId}`);
        } catch (histErr) {
            logger.error('[CompanionAIService] Failed to save historical companion snapshot', { error: histErr.message, patientId });
        }

        return insightDoc;

    } catch (error) {
        logger.error('[CompanionAIService] Insight generation process crashed', { error: error.message, patientId });
        return null;
    }
}

/**
 * Retrieves cached companion insights. If stale/missing, triggers synchronous generation.
 * @param {string} patientId 
 * @param {boolean} forceRefresh 
 * @returns {Promise<Object>}
 */
async function getOrGenerateInsights(patientId, forceRefresh = false) {
    if (!patientId) return null;

    const cached = await CompanionAiInsight.findOne({ patient_id: patientId });

    if (!forceRefresh) {
        // Fresh if generated within past 6 hours
        if (cached && cached.generated_at && (Date.now() - new Date(cached.generated_at).getTime() < 6 * 60 * 60 * 1000)) {
            return cached;
        }
    }

    // If cached is stale but exists, return cached immediately to prevent blocking, and trigger background refresh (delayed)
    if (cached) {
        logger.info(`[CompanionAIService] Cached insights found (stale). Returning immediately and enqueuing background refresh for patient ${patientId}`);
        enqueueCompanionInsights(patientId, 120000).catch(err => {
            logger.warn('[CompanionAIService] Failed to enqueue background insights update:', err.message);
        });
        return cached;
    }

    // If no cache exists at all, generate rule-based fallback instantly (non-blocking on LLM) and enqueue background Groq LLM immediately
    logger.info(`[CompanionAIService] No insights cache. Generating instant rule-based fallback and enqueuing background LLM generation for patient ${patientId}`);
    
    const fallbackInsight = await generateAndCacheInsights(patientId, false, true);
    
    enqueueCompanionInsights(patientId, 0).catch(err => {
        logger.warn('[CompanionAIService] Failed to enqueue background insights generation:', err.message);
    });

    return fallbackInsight;
}

module.exports = {
    enqueueCompanionInsights,
    generateAndCacheInsights,
    getOrGenerateInsights
};
