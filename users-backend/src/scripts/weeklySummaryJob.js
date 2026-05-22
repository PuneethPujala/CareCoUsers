const mongoose = require('mongoose');
const axios = require('axios');
const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const MedicineLog = require('../models/MedicineLog');
const WeeklySummary = require('../models/WeeklySummary');
const Notification = require('../models/Notification');
const PushNotificationService = require('../utils/pushNotifications');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

/**
 * Generate weekly summary using Groq LLM
 */
async function generateSummaryText(patientName, logs) {
    if (!GROQ_API_KEY) {
        return {
            summary_text: "We don't have enough data to generate an AI summary for this week.",
            encouragement_text: "Keep tracking your medications!",
            areas_to_improve: "Make sure to log your medicines daily."
        };
    }

    // Summarize logs for the LLM
    let totalDoses = 0;
    let takenDoses = 0;
    
    logs.forEach(log => {
        log.medicines.forEach(med => {
            totalDoses++;
            if (med.taken) takenDoses++;
        });
    });

    const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

    const prompt = `
You are a supportive, empathetic, and encouraging Caregiver AI for an elderly patient named ${patientName}.
You are writing their weekly medication adherence summary.
Here is their adherence data for the past 7 days:
- Total Scheduled Doses: ${totalDoses}
- Doses Taken: ${takenDoses}
- Adherence Rate: ${adherenceRate}%

Write a short, warm, and highly personalized summary in JSON format.
The JSON must have three fields:
1. "summary_text": A 1-2 sentence overview of how they did this week.
2. "encouragement_text": A 1 sentence encouraging remark.
3. "areas_to_improve": A gentle 1 sentence nudge on what to focus on next week (e.g. if adherence is low, gentle reminder to keep up; if perfect, tell them to maintain it).

Important constraints:
- Do not guilt-trip or use negative language like "You failed" or "You missed". Focus on "Room to grow" or "Great effort".
- Respond ONLY with valid JSON. Do not include markdown formatting like \`\`\`json.
`;

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const resultStr = response.data.choices[0].message.content;
        const parsed = JSON.parse(resultStr);
        return {
            summary_text: parsed.summary_text || "Your weekly care report is ready.",
            encouragement_text: parsed.encouragement_text || "Great job keeping up with your health.",
            areas_to_improve: parsed.areas_to_improve || "Let's aim for a consistent routine next week."
        };
    } catch (error) {
        console.error('Groq AI generation failed:', error?.response?.data || error.message);
        return {
            summary_text: `You had an adherence rate of ${adherenceRate}% this week.`,
            encouragement_text: "Keep tracking your medications!",
            areas_to_improve: "Make sure to log your medicines daily."
        };
    }
}

/**
 * Main Job Execution
 */
async function runWeeklySummaries() {
    console.log('[WeeklySummaryJob] Starting weekly summary generation...');
    
    // We analyze the past 7 days up to yesterday
    const today = moment.tz('Asia/Kolkata').startOf('day');
    const weekEnd = today.clone().subtract(1, 'day').endOf('day');
    const weekStart = today.clone().subtract(7, 'days').startOf('day');

    try {
        // Find all active patients
        const patients = await Patient.find({}).lean();
        console.log(`[WeeklySummaryJob] Found ${patients.length} patients.`);

        for (const patient of patients) {
            // Check if summary already exists for this week
            const existing = await WeeklySummary.findOne({ 
                patient_id: patient._id, 
                week_start: weekStart.toDate() 
            });

            if (existing) {
                console.log(`[WeeklySummaryJob] Summary already exists for ${patient.name}. Skipping.`);
                continue;
            }

            // Fetch logs for the past 7 days
            const logs = await MedicineLog.find({
                patient_id: patient._id,
                date: {
                    $gte: weekStart.toDate(),
                    $lte: weekEnd.toDate()
                }
            }).lean();

            // Generate AI summary
            const generated = await generateSummaryText(patient.name, logs);

            // Save to DB
            const summaryDoc = await WeeklySummary.create({
                patient_id: patient._id,
                week_start: weekStart.toDate(),
                week_end: weekEnd.toDate(),
                summary_text: generated.summary_text,
                encouragement_text: generated.encouragement_text,
                areas_to_improve: generated.areas_to_improve
            });

            // Trigger Push Notification
            await Notification.create({
                patient_id: patient._id,
                title: '✨ Your Weekly Care Summary is Ready!',
                message: generated.summary_text,
                type: 'info',
                target_screen: 'Dashboard', // Or MedicationsScreen
            });

            // Assuming patient object needs to be a mongoose document for PushNotificationService
            const patientDoc = await Patient.findById(patient._id);
            try {
                // We reuse an existing alert function or build a simple generic one.
                // Assuming PushNotificationService has sendPushNotification
                if (patientDoc.expo_push_token) {
                    await PushNotificationService.sendPushNotification(patientDoc.expo_push_token, {
                        title: '✨ Your Weekly Care Summary is Ready!',
                        body: generated.encouragement_text,
                        data: { screen: 'Dashboard' }
                    });
                }
            } catch (err) {
                console.warn('[WeeklySummaryJob] Push notification failed:', err.message);
            }

            console.log(`[WeeklySummaryJob] Successfully generated summary for ${patient.name}`);
        }

        console.log('[WeeklySummaryJob] Completed successfully.');
    } catch (error) {
        console.error('[WeeklySummaryJob] Error running job:', error);
    }
}

// Allow manual execution via CLI: `node src/scripts/weeklySummaryJob.js`
if (require.main === module) {
    require('dotenv').config();
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => runWeeklySummaries())
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { runWeeklySummaries };
