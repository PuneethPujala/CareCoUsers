const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const SleepLog = require('../models/SleepLog');
const VitalLog = require('../models/VitalLog');
const MedicineLog = require('../models/MedicineLog');
const PatientHealthStateHistory = require('../models/PatientHealthStateHistory');
const { buildPatientContext } = require('./aiContextService');
const { getOrGenerateInsights } = require('./companionAiService');
const { computeSleepTarget } = require('./carePlanService');
const logger = require('../utils/logger');

/**
 * Classifies the deterministic query intent.
 * Returns the intent string or null if not match.
 * @param {string} query
 * @returns {string|null}
 */
function classifyIntent(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();

  if (
    q.includes('why did my score drop') ||
    q.includes('why did my health score drop') ||
    q.includes('why did my score decrease') ||
    q.includes('explain my score change') ||
    q.includes('why is my score lower') ||
    q.includes('why did it drop')
  ) {
    return 'score_drop';
  }

  if (
    q.includes('how can i improve my score') ||
    q.includes('how to improve my score') ||
    q.includes('how to increase my score') ||
    q.includes('how can i increase my health score') ||
    q.includes('improve my health score')
  ) {
    return 'improve_score';
  }

  if (
    q.includes('what medications did i miss') ||
    q.includes('what meds did i miss') ||
    q.includes('show missed doses') ||
    q.includes('missed medications') ||
    q.includes('missed doses') ||
    q.includes('did i miss any med')
  ) {
    return 'missed_meds';
  }

  if (
    q.includes('how am i doing this week') ||
    q.includes('weekly progress') ||
    q.includes('weekly summary') ||
    q.includes('my progress this week') ||
    q.includes('how was my week')
  ) {
    return 'weekly_summary';
  }

  return null;
}

/**
 * Resolves a classified intent deterministically using patient database statistics.
 * @param {string} patientId
 * @param {string} intent
 * @returns {Promise<Object>} An object { text: string, suggestions: Array, cards: Array }
 */
async function resolveDeterministicIntent(patientId, intent) {
  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return {
        text: "I couldn't locate your patient records to analyze this. Please check with your administrator.",
        suggestions: [],
        cards: [],
      };
    }

    const timezone = patient.timezone || 'Asia/Kolkata';
    const nowLocal = moment().tz(timezone);
    const todayUtc = new Date(`${nowLocal.format('YYYY-MM-DD')}T00:00:00.000Z`);

    // Fetch common contexts in parallel
    const [patientContext, insights, historyHistory] = await Promise.all([
      buildPatientContext(patientId),
      getOrGenerateInsights(patientId),
      PatientHealthStateHistory.find({ patient_id: patientId })
        .sort({ date: -1 })
        .limit(14)
        .lean(),
    ]);

    const weeklyAdherence = patient.adherence_rate ?? 100;
    const currentScore = patient.healthScoreCache ?? 80;

    if (intent === 'score_drop') {
      let scoreChange = 0;
      if (historyHistory.length >= 2) {
        scoreChange =
          (historyHistory[0].score ?? 80) -
          (historyHistory[historyHistory.length - 1].score ?? 80);
      }

      const pointsChange = Math.abs(scoreChange);
      const dropText =
        scoreChange < 0
          ? `Your health score fell by ${pointsChange} points recently because:`
          : `Your health score is currently at ${currentScore} points. Analyzing recent items shows:`;

      const bullets = [];

      // 1. Missed medication check
      const weeklyMissed = patientContext?.recent_adherence?.missed ?? 0;
      if (weeklyMissed > 0) {
        bullets.push(
          `• Missed ${weeklyMissed} scheduled medication ${weeklyMissed === 1 ? 'dose' : 'doses'} this week`
        );
      }

      // 2. Vitals sync check
      const lastBPDate = await VitalLog.findOne({ patient_id: patientId })
        .sort({ date: -1 })
        .lean();
      if (lastBPDate) {
        const diffDays = moment().diff(moment(lastBPDate.date), 'days');
        if (diffDays >= 3) {
          bullets.push(`• No blood pressure logs synced for ${diffDays} days`);
        }
      } else {
        bullets.push(`• No blood pressure logs synced to your profile yet`);
      }

      // 3. Sleep logs check
      const sleepAvg = await computeSleepTarget(patientId, timezone);
      const todaySleepLog = await SleepLog.findOne({
        patient_id: patientId,
        date: todayUtc,
      }).lean();
      if (todaySleepLog) {
        const sleepDiff = sleepAvg - todaySleepLog.hours;
        if (sleepDiff > 1.0) {
          bullets.push(
            `• Today's sleep decreased by ${sleepDiff.toFixed(1)} hours compared to your ${sleepAvg}h average`
          );
        }
      } else {
        bullets.push(`• Missed logging today's sleep details`);
      }

      if (bullets.length === 0) {
        bullets.push(
          '• Vitals and medications are otherwise stable. Continue logs to improve your metrics!'
        );
      }

      return {
        text: `${dropText}\n\n${bullets.join('\n')}`,
        suggestions: [
          'Explain my medication schedule today.',
          'How can I improve my score?',
          'How am I doing this week?',
        ],
        cards: [
          {
            type: 'adherence',
            rate: weeklyAdherence,
            streak: patient.current_streak || 0,
            level: weeklyAdherence >= 75 ? 'Good' : 'Needs Focus',
          },
        ],
      };
    }

    if (intent === 'improve_score') {
      const targets = [
        'To increase your health score, focus on these actionable checklist targets:',
      ];

      // 1. Adherence recommendation
      if (weeklyAdherence < 75) {
        targets.push(
          `• Complete your scheduled medications today (target: 75%+ compliance, currently ${weeklyAdherence}%)`
        );
      } else {
        targets.push(
          `• Keep up your medication routine to maintain your perfect streak`
        );
      }

      // 2. BP request
      const threeDaysAgo = nowLocal
        .clone()
        .subtract(3, 'days')
        .startOf('day')
        .toDate();
      const BPLogged = await VitalLog.exists({
        patient_id: patientId,
        date: { $gte: threeDaysAgo },
      });
      if (!BPLogged) {
        targets.push('• Sync a new blood pressure vitals reading today');
      } else {
        targets.push('• Keep recording BP readings regularly every 2 days');
      }

      // 3. Sleep targets
      const sleepAvg = await computeSleepTarget(patientId, timezone);
      targets.push(
        `• Sleep at least ${sleepAvg} hours tonight to meet your 14-day baseline`
      );

      return {
        text: targets.join('\n'),
        suggestions: [
          'Why did my score drop?',
          'What medications did I miss?',
          'How am I doing this week?',
        ],
        cards: [
          {
            type: 'medications',
            taken: (patientContext?.today_status?.medicines || [])
              .filter((m) => m.taken)
              .map((m) => m.name),
            remaining: (patientContext?.today_status?.medicines || [])
              .filter((m) => !m.taken)
              .map((m) => `${m.name} (${m.time_slot})`),
          },
        ],
      };
    }

    if (intent === 'missed_meds') {
      // Find missed meds in the last 7 days
      const sevenDaysAgo = nowLocal
        .clone()
        .subtract(7, 'days')
        .startOf('day')
        .toDate();
      const missedLogs = await MedicineLog.find({
        patient_id: patientId,
        date: { $gte: sevenDaysAgo },
      }).lean();

      const missedCounts = {};
      missedLogs.forEach((log) => {
        const missedList = (log.medicines || []).filter(
          (m) => !m.taken && m.is_active !== false
        );
        missedList.forEach((m) => {
          const key = `${m.medicine_name} (${m.scheduled_time})`;
          missedCounts[key] = (missedCounts[key] || 0) + 1;
        });
      });

      const keys = Object.keys(missedCounts);
      let replyText = '';
      if (keys.length > 0) {
        replyText =
          'In the past 7 days, you missed the following scheduled doses:\n\n' +
          keys
            .map(
              (k) =>
                `• ${k}: missed ${missedCounts[k]} ${missedCounts[k] === 1 ? 'time' : 'times'}`
            )
            .join('\n');
      } else {
        replyText =
          'Great news! You have not missed any scheduled medication doses in the past 7 days. Keep it up! 🎉';
      }

      return {
        text: replyText,
        suggestions: [
          'How can I improve my score?',
          'Why did my score drop?',
          'How am I doing this week?',
        ],
        cards: [],
      };
    }

    if (intent === 'weekly_summary') {
      // Metrics from Sprint 9 extended statistics
      const consistency = insights?.predictive_health?.consistency?.score ?? 92;
      const momentum = insights?.predictive_health?.momentum?.score ?? 12;
      const confidence =
        insights?.predictive_health?.recovery?.confidence ?? 89;
      const reliability = insights?.confidence_score ?? 95;

      const momentumDirection =
        momentum >= 0 ? `+${momentum} Improving` : `${momentum} Declining`;

      const replyText =
        `Here is your Health Intelligence Weekly Summary:\n\n` +
        `• **Adherence Consistency:** ${consistency}% (${consistency >= 90 ? 'Excellent' : 'Fair'})\n` +
        `• **Risk Momentum:** ${momentumDirection}\n` +
        `• **Recovery Confidence:** ${confidence}%\n` +
        `• **Forecast Reliability:** ${reliability}% (High)`;

      return {
        text: replyText,
        suggestions: [
          'Why did my score drop?',
          'How can I improve my score?',
          'What medications did I miss?',
        ],
        cards: [
          {
            type: 'summary',
            adherenceRate: weeklyAdherence,
            vitalsLoggedDays: historyHistory.length,
            missedDoses: patientContext?.recent_adherence?.missed ?? 0,
            currentStreak: patient.current_streak || 0,
          },
        ],
      };
    }

    return null;
  } catch (err) {
    logger.error('[IntentClassifier] Error resolving deterministic intent', {
      error: err.message,
      intent,
      patientId,
    });
    return {
      text: 'An error occurred while fetching your health analytics summary. Please try again.',
      suggestions: [],
      cards: [],
    };
  }
}

module.exports = {
  classifyIntent,
  resolveDeterministicIntent,
};
