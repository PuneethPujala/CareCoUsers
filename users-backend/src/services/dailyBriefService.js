const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const PatientHealthStateHistory = require('../models/PatientHealthStateHistory');
const { getOrGenerateInsights } = require('./companionAiService');
const { generateInterventions } = require('./interventionEngineService');
const { getOrGenerateCarePlan } = require('./carePlanService');
const logger = require('../utils/logger');

/**
 * Generates the Morning Health Brief for a patient.
 * @param {string} patientId
 * @returns {Promise<Object>}
 */
async function generateMorningBrief(patientId) {
  try {
    const patient = await Patient.findById(patientId);
    if (!patient) return null;

    const timezone = patient.timezone || 'Asia/Kolkata';
    const insights = await getOrGenerateInsights(patientId);
    const plan = await getOrGenerateCarePlan(patientId);

    // Fetch last two historical snapshots to compute score difference
    const history = await PatientHealthStateHistory.find({
      patient_id: patientId,
    })
      .sort({ date: -1 })
      .limit(2)
      .lean();

    let scoreDelta = 0;
    if (history.length >= 2) {
      scoreDelta = (history[0].score ?? 80) - (history[1].score ?? 80);
    }

    const currentScore = patient.health_score ?? 80;
    const scoreChangeStr = scoreDelta >= 0 ? `+${scoreDelta}` : `${scoreDelta}`;

    const trajectory =
      insights?.predictive_health?.forecast?.trajectory || 'stable';
    const trajectoryLabel =
      trajectory === 'positive' || trajectory === 'improving'
        ? 'Improving'
        : trajectory === 'negative' || trajectory === 'declining'
          ? 'Declining'
          : 'Stable';

    const focusChecklist = [];

    // 1. Add meds task if meds scheduled today
    const schedule = plan?.medication_tasks || [];
    if (schedule.length > 0) {
      const nextSlot = schedule[0]?.time_slot || 'morning';
      focusChecklist.push(`Take your ${nextSlot} medication`);
    } else {
      focusChecklist.push('Maintain your wellness habits');
    }

    // 2. Add vital logging suggestion if not synced recently
    const recentVitalsText = insights?.risk_factors?.find(
      (f) =>
        f.toLowerCase().includes('blood pressure') ||
        f.toLowerCase().includes('reading')
    );
    if (recentVitalsText) {
      focusChecklist.push('Log your Blood Pressure reading');
    } else {
      focusChecklist.push("Log today's BP reading");
    }

    // 3. Add streak check
    const streakCount = patient.current_streak || 0;
    if (streakCount > 0) {
      focusChecklist.push(`Continue your ${streakCount}-day streak`);
    } else {
      focusChecklist.push('Start a new medication logging streak');
    }

    return {
      patient_name: patient.name,
      health_score: currentScore,
      score_change: scoreChangeStr,
      forecast: trajectoryLabel,
      focus_items: focusChecklist,
    };
  } catch (err) {
    logger.error('[DailyBriefService] Error generating morning brief', {
      error: err.message,
      patientId,
    });
    return null;
  }
}

/**
 * Generates the Companion Brief for the patient's caregiver.
 * @param {string} patientId
 * @returns {Promise<Object>}
 */
async function generateCompanionBrief(patientId) {
  try {
    const patient = await Patient.findById(patientId);
    if (!patient) return null;

    const insights = await getOrGenerateInsights(patientId);
    const activeInterventions = await generateInterventions(patientId);

    const riskLevel = insights?.risk_level || 'low';
    const riskLabel = riskLevel.toUpperCase();

    const statusLabel =
      riskLevel === 'high'
        ? 'Needs Attention'
        : riskLevel === 'medium'
          ? 'Monitor Closely'
          : 'Stable';

    const recommendedActions = [];
    if (activeInterventions.length > 0) {
      activeInterventions.slice(0, 2).forEach((item) => {
        if (item.type === 'medication_reminder')
          recommendedActions.push('Send medication reminder nudge');
        if (item.type === 'bp_request')
          recommendedActions.push('Request BP log sync');
        if (item.type === 'checkin_call')
          recommendedActions.push('Schedule check-in call');
        if (item.type === 'escalation_contact')
          recommendedActions.push('Urgent: recommend coordinator escalation');
      });
    }

    if (recommendedActions.length === 0) {
      recommendedActions.push('No immediate interventions needed');
      recommendedActions.push('Encourage hydration & stable vitals');
    }

    return {
      patient_name: patient.name,
      patient_status: statusLabel,
      risk_level: riskLabel,
      recommended_actions: recommendedActions,
    };
  } catch (err) {
    logger.error('[DailyBriefService] Error generating companion brief', {
      error: err.message,
      patientId,
    });
    return null;
  }
}

module.exports = {
  generateMorningBrief,
  generateCompanionBrief,
};
