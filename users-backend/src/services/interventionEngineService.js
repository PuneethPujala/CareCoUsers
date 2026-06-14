const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const VitalLog = require('../models/VitalLog');
const Intervention = require('../models/Intervention');
const CompanionAiInsight = require('../models/CompanionAiInsight');
const { getOrGenerateInsights } = require('./companionAiService');
const logger = require('../utils/logger');

const COOLDOWN_MS = {
    medication_reminder: 12 * 60 * 60 * 1000, // 12h
    bp_request: 24 * 60 * 60 * 1000,        // 24h
    checkin_call: 72 * 60 * 60 * 1000,      // 72h
    escalation_contact: 24 * 60 * 60 * 1000  // 24h
};

const PRIORITY_SCORES = {
    medication_reminder: 70,
    bp_request: 80,
    checkin_call: 50,
    escalation_contact: 95
};

/**
 * Checks if a specific intervention type is on cooldown for the patient.
 * @param {string} patientId 
 * @param {string} type 
 * @returns {Promise<boolean>}
 */
async function isInterventionOnCooldown(patientId, type) {
    const cooldownDuration = COOLDOWN_MS[type];
    if (!cooldownDuration) return false;

    // Find the latest intervention of this type for this patient (either completed or generated)
    const latest = await Intervention.findOne({
        patient_id: patientId,
        type,
        status: { $in: ['completed', 'generated'] }
    }).sort({ created_at: -1 });

    if (!latest) return false;

    const elapsed = Date.now() - new Date(latest.created_at).getTime();
    return elapsed < cooldownDuration;
}

/**
 * Evaluates patient health metrics and generates deterministic interventions.
 * Enforces cooldowns and assigns priority scores.
 * @param {string} patientId 
 * @returns {Promise<Array>} List of generated active interventions
 */
async function generateInterventions(patientId) {
    try {
        const patient = await Patient.findById(patientId);
        if (!patient) return [];

        // Fetch or compute companion insights
        const insights = await getOrGenerateInsights(patientId);
        if (!insights) return [];

        const timezone = patient.timezone || 'Asia/Kolkata';
        const nowLocal = moment().tz(timezone);

        // Extract metrics needed for decisions
        const weeklyAdherence = patient.adherence_rate !== null ? patient.adherence_rate : 100;
        const moodTrend = insights.risk_breakdown?.mood > 10 || insights.risk_factors?.some(f => f.toLowerCase().includes('mood')) ? 'declining' : 'stable';
        
        // Vitals log status
        const threeDaysAgo = nowLocal.clone().subtract(3, 'days').startOf('day').toDate();
        const recentVitals3dExist = await VitalLog.exists({
            patient_id: patientId,
            date: { $gte: threeDaysAgo }
        });

        const riskLevel = insights.risk_level || 'low';
        const trajectory = insights.predictive_health?.forecast?.trajectory || 'stable';

        const potentialInterventions = [];

        // Rule 1: Medication Adherence Nudge
        if (weeklyAdherence < 75) {
            potentialInterventions.push({
                type: 'medication_reminder',
                priority_score: PRIORITY_SCORES.medication_reminder,
                reason: `Weekly adherence rate is below target at ${weeklyAdherence}%`
            });
        }

        // Rule 2: Vitals BP request
        if (!recentVitals3dExist) {
            potentialInterventions.push({
                type: 'bp_request',
                priority_score: PRIORITY_SCORES.bp_request,
                reason: 'No blood pressure or heart rate reading logged in the last 3 days'
            });
        }

        // Rule 3: Wellness check-in
        if (moodTrend === 'declining') {
            potentialInterventions.push({
                type: 'checkin_call',
                priority_score: PRIORITY_SCORES.checkin_call,
                reason: 'Declining emotional mood patterns detected from wellness logs'
            });
        }

        // Rule 4: Escalation contact
        if (riskLevel === 'high' && (trajectory === 'negative' || trajectory === 'declining')) {
            potentialInterventions.push({
                type: 'escalation_contact',
                priority_score: PRIORITY_SCORES.escalation_contact,
                reason: 'Critical: Patient is flagged as High Risk with a negative health score trajectory'
            });
        }

        // Process triggered interventions through cooldowns
        for (const item of potentialInterventions) {
            const onCooldown = await isInterventionOnCooldown(patientId, item.type);
            if (!onCooldown) {
                // Check if this intervention already exists in 'generated' status
                const existing = await Intervention.findOne({
                    patient_id: patientId,
                    type: item.type,
                    status: 'generated'
                });

                if (!existing) {
                    await Intervention.create({
                        patient_id: patientId,
                        type: item.type,
                        source: 'system',
                        status: 'generated',
                        priority_score: item.priority_score,
                        reason: item.reason,
                        cooldown_until: new Date(Date.now() + COOLDOWN_MS[item.type])
                    });
                    logger.info(`[InterventionEngine] Generated new intervention suggestion: ${item.type} for patient ${patientId}`);
                }
            } else {
                logger.debug(`[InterventionEngine] Intervention ${item.type} is currently on cooldown for patient ${patientId}`);
            }
        }

        // Retrieve and return all active 'generated' interventions for this patient, sorted by priority score descending
        return await Intervention.find({
            patient_id: patientId,
            status: 'generated'
        }).sort({ priority_score: -1 });

    } catch (err) {
        logger.error('[InterventionEngine] Error generating interventions', { error: err.message, patientId });
        return [];
    }
}

/**
 * Marks an intervention completed by a companion.
 * @param {string} interventionId 
 * @param {string} companionId 
 * @returns {Promise<Object>}
 */
async function completeIntervention(interventionId, companionId) {
    try {
        const intervention = await Intervention.findById(interventionId);
        if (!intervention) return null;

        intervention.status = 'completed';
        intervention.completed_at = new Date();
        intervention.companion_id = companionId;
        await intervention.save();

        // Also write a history log representing the completed action to keep history clean
        await Intervention.create({
            patient_id: intervention.patient_id,
            companion_id: companionId,
            type: intervention.type,
            source: 'companion',
            status: 'completed',
            priority_score: intervention.priority_score,
            reason: `Companion completed recommendation: ${intervention.reason}`,
            completed_at: new Date()
        });

        logger.info(`[InterventionEngine] Marked intervention ${interventionId} completed by companion ${companionId}`);
        return intervention;
    } catch (err) {
        logger.error('[InterventionEngine] Error completing intervention', { error: err.message, interventionId });
        return null;
    }
}

module.exports = {
    generateInterventions,
    completeIntervention,
    isInterventionOnCooldown
};
