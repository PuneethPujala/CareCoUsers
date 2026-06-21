/**
 * vitalsQueue.js — DEPRECATED.
 *
 * This module is superseded by jobQueues.js + worker.js.
 * Kept for backward compatibility with any code that imports
 * `queueAllPatientsForPrediction`.
 *
 * The vitals-prediction queue and worker are now defined in:
 *   - src/jobs/jobQueues.js  (queue definition)
 *   - worker.js              (worker process)
 */

const { vitalsPredictionQueue } = require('./jobQueues');
const Patient = require('../models/Patient');

async function queueAllPatientsForPrediction() {
    console.log('Dispatching AI Prediction Jobs for all active patients...');
    try {
        const patients = await Patient.find({ is_active: true }).select('_id');

        for (const pt of patients) {
            if (process.env.NODE_ENV !== 'test' && process.env.USE_BULLMQ_WORKERS !== 'true') {
                const AIPredictionService = require('../services/aiPredictionService');
                AIPredictionService.processPatientPrediction(pt._id.toString()).catch(e => {
                    console.error(`In-process prediction failed for patient ${pt._id}:`, e);
                });
            } else {
                await vitalsPredictionQueue.add('predict', { patientId: pt._id.toString() });
            }
        }
        console.log(`Successfully dispatched/queued ${patients.length} prediction jobs.`);
    } catch (e) {
        console.error('Failed to enqueue batch prediction jobs: ', e);
    }
}

module.exports = {
    vitalsQueue: vitalsPredictionQueue,
    queueAllPatientsForPrediction,
};
