/**
 * worker.js — Standalone BullMQ worker process.
 *
 * Run separately from the API server:
 *   npm run worker
 *
 * This process:
 *   1. Connects to MongoDB (for DB queries)
 *   2. Connects to Redis (for BullMQ job consumption)
 *   3. Registers workers for all job queues
 *   4. Logs job completion/failure
 *
 * Benefits over in-process node-cron:
 *   - API crashes don't kill notification delivery
 *   - Worker crashes don't affect API response times
 *   - Can scale workers independently of API instances
 *   - Built-in retry, backoff, and dead-letter support
 *   - Job state is persisted in Redis (survives restarts)
 */

require('dotenv').config();
const { Worker } = require('bullmq');
const connectDB = require('./src/config/database');
const { getRedisConnection } = require('./src/jobs/redisConnection');

// ── Job handlers (the actual business logic) ──────────────────
const { runMedicationReminders } = require('./src/jobs/medicationReminderJob');
const { processPatients } = require('./src/jobs/notificationJob');
const AIPredictionService = require('./src/services/aiPredictionService');

const connection = getRedisConnection();

async function start() {
    console.log('🔧 Starting CareMyMed Worker Process...');

    // Connect to MongoDB — workers need DB access
    await connectDB();

    // ── Worker 1: Medication Reminders (every minute) ───────────
    const medWorker = new Worker(
        'medication-reminders',
        async (job) => {
            console.log(`[Worker] Processing medication-reminders job ${job.id}`);
            await runMedicationReminders();
        },
        {
            connection,
            concurrency: 1, // Only one reminder scan at a time
            limiter: { max: 1, duration: 55000 }, // At most 1 job per 55s (safety)
        }
    );

    medWorker.on('completed', (job) => {
        console.log(`[Worker] medication-reminders ${job.id} completed`);
    });
    medWorker.on('failed', (job, err) => {
        console.error(`[Worker] medication-reminders ${job?.id} failed:`, err.message);
    });

    // ── Worker 2: AI Notifications (every hour) ─────────────────
    const aiNotifWorker = new Worker(
        'ai-notifications',
        async (job) => {
            console.log(`[Worker] Processing ai-notifications job ${job.id}`);
            await processPatients();
        },
        {
            connection,
            concurrency: 1,
        }
    );

    aiNotifWorker.on('completed', (job) => {
        console.log(`[Worker] ai-notifications ${job.id} completed`);
    });
    aiNotifWorker.on('failed', (job, err) => {
        console.error(`[Worker] ai-notifications ${job?.id} failed:`, err.message);
    });

    // ── Worker 3: Vitals Prediction (on-demand) ─────────────────
    const vitalsWorker = new Worker(
        'vitals-prediction',
        async (job) => {
            const { patientId } = job.data;
            console.log(`[Worker] Processing vitals-prediction for patient ${patientId}`);
            const result = await AIPredictionService.processPatientPrediction(patientId);
            if (!result.success && result.message !== 'Not enough historical data') {
                throw new Error(result.error || 'Unknown Error');
            }
            return result;
        },
        {
            connection,
            concurrency: 5, // Multiple predictions can run in parallel
        }
    );

    vitalsWorker.on('completed', (job) => {
        console.log(`[Worker] vitals-prediction ${job.id} completed`);
    });
    vitalsWorker.on('failed', (job, err) => {
        console.error(`[Worker] vitals-prediction ${job?.id} failed:`, err.message);
    });

    console.log('✅ All workers registered and listening for jobs');
    console.log('   📋 medication-reminders (every 1 min)');
    console.log('   🤖 ai-notifications     (every 60 min)');
    console.log('   🔮 vitals-prediction     (on-demand)');

    // ── Graceful shutdown ───────────────────────────────────────
    const shutdown = async (signal) => {
        console.log(`\n⚠️  Received ${signal}. Shutting down workers gracefully...`);
        await Promise.all([
            medWorker.close(),
            aiNotifWorker.close(),
            vitalsWorker.close(),
        ]);
        console.log('🔒 All workers stopped.');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
    console.error('❌ Worker startup failed:', err);
    process.exit(1);
});
