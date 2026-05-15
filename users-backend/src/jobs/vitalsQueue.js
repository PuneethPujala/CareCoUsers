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
            await vitalsPredictionQueue.add('predict', { patientId: pt._id.toString() });
        }
        console.log(`Successfully queued ${patients.length} prediction jobs.`);
    } catch (e) {
        console.error('Failed to enqueue batch prediction jobs: ', e);
    }
}

module.exports = {
    vitalsQueue: vitalsPredictionQueue,
    queueAllPatientsForPrediction,
};
