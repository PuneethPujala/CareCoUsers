const { Queue, Worker } = require('bullmq');
const mongoose = require('mongoose');
const User = require('../models/User'); 
const Patient = require('../models/Patient');
const AIPredictionService = require('../services/aiPredictionService');

const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
};

// Queue for scheduling prediction tasks
const vitalsQueue = new Queue('vitalsPrediction', { connection: redisOptions });

// Worker that processes each patient
const vitalsWorker = new Worker('vitalsPrediction', async job => {
    const { patientId } = job.data;
    console.log(`Processing AI Prediction for Patient: ${patientId}`);
    
    // Process single patient using the service, naturally wrapped in try/catch internally
    const result = await AIPredictionService.processPatientPrediction(patientId);
    
    if (!result.success && result.message !== 'Not enough historical data') {
        throw new Error(result.error || 'Unknown Error');
    }
    return result;
}, { connection: redisOptions, concurrency: 5 }); // Keep concurrency low-ish to avoid AI server overload

vitalsWorker.on('completed', job => {
    console.log(`Job ${job.id} completed successfully`);
});

vitalsWorker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed with error: ${err.message}`);
});

// Nightly Dispatcher: Can be called via a simple Node-Cron or Scheduler
async function queueAllPatientsForPrediction() {
    console.log("Dispatching AI Prediction Jobs for all active patients...");
    try {
        const patients = await User.find({ role: 'patient' }).select('_id');
        
        for (const pt of patients) {
            await vitalsQueue.add('predict', { patientId: pt._id.toString() }, {
                removeOnComplete: true,
                removeOnFail: false,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                }
            });
        }
        console.log(`Successfully queued ${patients.length} prediction jobs.`);
    } catch (e) {
        console.error("Failed to enqueue batch prediction jobs: ", e);
    }
}

module.exports = {
    vitalsQueue,
    vitalsWorker,
    queueAllPatientsForPrediction
};
