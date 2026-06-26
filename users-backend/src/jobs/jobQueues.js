/**
 * jobQueues.js — Centralized BullMQ queue definitions.
 *
 * Defines all repeatable job queues for the application.
 * These queues are imported by:
 *   - server.js (to schedule repeatable jobs on startup)
 *   - worker.js (to process jobs)
 */

const { Queue } = require("bullmq");
const { getRedisConnection } = require("./redisConnection");

// Intercept Queue.add to propagate active request log context (correlationId, userId) to job metadata
const originalAdd = Queue.prototype.add;
Queue.prototype.add = function (name, data, opts) {
  let context;
  try {
    const { getLogContext } = require("../middleware/correlationId");
    context = getLogContext();
  } catch (err) {
    // Ignore error if context is not available
  }

  if (data && typeof data === "object") {
    if (context && typeof context === "object") {
      data.metadata = {
        ...(data.metadata || {}),
        correlationId: context.correlationId,
        userId: context.userId,
        userType: context.userType,
        requestSource: "api-request",
        createdAt: new Date().toISOString(),
      };
    } else if (context && typeof context === "string") {
      data.metadata = {
        ...(data.metadata || {}),
        correlationId: context,
        requestSource: "api-request",
        createdAt: new Date().toISOString(),
      };
    }
  }

  return originalAdd.call(this, name, data, opts);
};


const connection = getRedisConnection();

const PRIORITY = {
  HIGH: 5,
  MEDIUM: 15,
  LOW: 25,
};

// ── Medication Reminders ────────────────────────────────────────
// Runs every minute. Checks each timezone for patients whose
// medication is due in 15 minutes and sends push notifications.
const medicationReminderQueue = new Queue("medication-reminders", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 }, // Keep last 100 for debugging
    removeOnFail: { count: 500 }, // Keep last 500 failures
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    priority: PRIORITY.HIGH,
  },
});

// ── AI Health Notifications ─────────────────────────────────────
// Runs every hour. Evaluates patient context (time-of-day, streak,
// adherence) and dispatches personalized nudges.
const aiNotificationQueue = new Queue("ai-notifications", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
    attempts: 2,
    backoff: { type: "fixed", delay: 10000 },
    priority: PRIORITY.MEDIUM,
  },
});

// ── AI Vitals Prediction ────────────────────────────────────────
// On-demand or nightly. Processes AI prediction for individual patients.
const vitalsPredictionQueue = new Queue("vitals-prediction", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    priority: PRIORITY.MEDIUM,
  },
});

// ── Health State Recomputation ──────────────────────────────────
// On-demand/debounced. Recomputes patient health state.
const healthStateQueue = new Queue("health-state-recompute", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true, // Crucial: remove immediately so same jobId can be added again on subsequent mutations
    removeOnFail: true, // Crucial: remove immediately so same jobId can be added again on subsequent mutations
    attempts: 2,
    backoff: { type: "fixed", delay: 3000 },
    priority: PRIORITY.HIGH,
  },
});

// ── Companion Insights Debounced Generation ─────────────────────
// Asynchronous background debounced generation queue for caregivers.
const companionInsightsQueue = new Queue("companion-insights", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    priority: PRIORITY.LOW,
  },
});

// ── Health History Backfill ─────────────────────────────────────
// Asynchronous background backfill of daily health states.
const healthHistoryBackfillQueue = new Queue("health-history-backfill", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    priority: PRIORITY.LOW,
  },
});

module.exports = {
  medicationReminderQueue,
  aiNotificationQueue,
  vitalsPredictionQueue,
  healthStateQueue,
  companionInsightsQueue,
  healthHistoryBackfillQueue,
  PRIORITY,
};
