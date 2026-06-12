/**
 * jobQueues.js — Centralized BullMQ queue definitions.
 *
 * Defines all repeatable job queues for the application.
 * These queues are imported by:
 *   - server.js (to schedule repeatable jobs on startup)
 *   - worker.js (to process jobs)
 */

const { Queue } = require('bullmq');
const { getRedisConnection } = require('./redisConnection');

const connection = getRedisConnection();

// ── Medication Reminders ────────────────────────────────────────
// Runs every minute. Checks each timezone for patients whose
// medication is due in 15 minutes and sends push notifications.
const medicationReminderQueue = new Queue('medication-reminders', {
    connection,
    defaultJobOptions: {
        removeOnComplete: { count: 100 },  // Keep last 100 for debugging
        removeOnFail: { count: 500 },      // Keep last 500 failures
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
    },
});

// ── AI Health Notifications ─────────────────────────────────────
// Runs every hour. Evaluates patient context (time-of-day, streak,
// adherence) and dispatches personalized nudges.
const aiNotificationQueue = new Queue('ai-notifications', {
    connection,
    defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 },
    },
});

// ── AI Vitals Prediction ────────────────────────────────────────
// On-demand or nightly. Processes AI prediction for individual patients.
const vitalsPredictionQueue = new Queue('vitals-prediction', {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
    },
});

// ── Health State Recomputation ──────────────────────────────────
// On-demand/debounced. Recomputes patient health state.
const healthStateQueue = new Queue('health-state-recompute', {
    connection,
    defaultJobOptions: {
        removeOnComplete: true, // Crucial: remove immediately so same jobId can be added again on subsequent mutations
        removeOnFail: true,     // Crucial: remove immediately so same jobId can be added again on subsequent mutations
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
    },
});

module.exports = {
    medicationReminderQueue,
    aiNotificationQueue,
    vitalsPredictionQueue,
    healthStateQueue,
};

