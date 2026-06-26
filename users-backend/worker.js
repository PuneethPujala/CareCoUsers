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

require("dotenv").config();
const { Worker: OriginalWorker } = require("bullmq");
const { correlationLocalStorage } = require("./src/middleware/correlationId");

class Worker extends OriginalWorker {
  constructor(name, processor, opts) {
    const wrappedProcessor = async (job) => {
      const correlationId =
        job.data?.metadata?.correlationId || job.data?.correlationId;
      const userId = job.data?.metadata?.userId;
      const userType = job.data?.metadata?.userType;

      if (correlationId || userId) {
        const context = {
          correlationId: correlationId || null,
          userId: userId || null,
          userType: userType || null,
        };
        return correlationLocalStorage.run(context, () => processor(job));
      }
      return processor(job);
    };
    super(name, wrappedProcessor, opts);
  }
}

const connectDB = require("./src/config/database");
const { getRedisConnection } = require("./src/jobs/redisConnection");

// ── Job handlers (the actual business logic) ──────────────────
const { runMedicationReminders } = require("./src/jobs/medicationReminderJob");
const { processPatients } = require("./src/jobs/notificationJob");
const AIPredictionService = require("./src/services/aiPredictionService");
const {
  recomputeAndCacheHealthState,
} = require("./src/services/patientHealthStateService");
const AuditLog = require("./src/models/AuditLog");
const connection = getRedisConnection();

function handleJobCompleted(queueName, job) {
  if (!job) return;
  const logger = require("./src/utils/logger");

  const waitTimeMs = job.processedOn ? job.processedOn - job.timestamp : 0;
  const processingDurationMs =
    job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
  const priority = job.opts?.priority || 15; // default priority if not set

  // High priority wait warning check
  if (priority <= 5) {
    const threshold =
      parseInt(process.env.QUEUE_HIGH_PRIORITY_WAIT_WARNING_MS) || 5000;
    if (waitTimeMs > threshold) {
      logger.warn(
        `🚨 High-priority queue wait time threshold exceeded: ${queueName} (${waitTimeMs}ms > ${threshold}ms)`,
      );
    }
  }

  logger.info(`[Worker] ${queueName} job ${job.id} completed`, {
    metric: "queue_job_observability",
    metricVersion: 1,
    queue: queueName,
    jobId: job.id,
    jobName: job.name,
    priority,
    waitTimeMs,
    processingDurationMs,
    attemptsMade: job.attemptsMade,
    status: "completed",
    workerName: "standalone_worker",
    correlationId: job.data?.metadata?.correlationId || job.data?.correlationId,
  });
}

function logJobFailureMetrics(queueName, job, err) {
  const logger = require("./src/utils/logger");
  const waitTimeMs = job.processedOn ? job.processedOn - job.timestamp : 0;
  const processingDurationMs =
    job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
  const priority = job.opts?.priority || 15;

  logger.error(`[Worker] ${queueName} job ${job.id} failed`, {
    metric: "queue_job_observability",
    metricVersion: 1,
    queue: queueName,
    jobId: job.id,
    jobName: job.name,
    priority,
    waitTimeMs,
    processingDurationMs,
    attemptsMade: job.attemptsMade,
    status: "failed",
    workerName: "standalone_worker",
    error: err.message,
    correlationId: job.data?.metadata?.correlationId || job.data?.correlationId,
  });
}

async function handleJobFailure(queueName, job, err) {
  if (!job) {
    console.error(
      `[Worker] Centralized failure listener: job is undefined on queue ${queueName}. Error:`,
      err.message,
    );
    return;
  }

  // Set first failure timestamp in job metadata if it's the first attempt
  if (job.attemptsMade === 1) {
    if (!job.data) job.data = {};
    if (!job.data.metadata) job.data.metadata = {};
    job.data.metadata.firstFailureTimestamp = new Date().toISOString();
    try {
      await job.updateData(job.data);
    } catch (updateErr) {
      // Ignore Redis update error
    }
  }

  logJobFailureMetrics(queueName, job, err);

  // If all attempts are exhausted, log as a dead-letter event in AuditLog
  const maxAttempts = job.opts.attempts || 1;
  if (job.attemptsMade >= maxAttempts) {
    try {
      // Classify failure category based on error message
      let classification = "unknown";
      const msg = (err.message || "").toLowerCase();
      if (
        msg.includes("validation") ||
        msg.includes("cast to objectid") ||
        msg.includes("duplicate")
      ) {
        classification = "validation";
      } else if (
        msg.includes("mongo") ||
        msg.includes("connection") ||
        msg.includes("db") ||
        msg.includes("query")
      ) {
        classification = "database";
      } else if (msg.includes("timeout") || msg.includes("timed out")) {
        classification = "timeout";
      } else if (
        msg.includes("network") ||
        msg.includes("axios") ||
        msg.includes("fetch") ||
        msg.includes("socket")
      ) {
        classification = "network";
      }

      const patientId = job.data?.patientId || job.data?.patient_id || null;
      const organizationId =
        job.data?.metadata?.organizationId || job.data?.organizationId || null;
      const correlationId =
        job.data?.metadata?.correlationId || job.data?.correlationId || null;
      const firstFailureTimestamp =
        job.data?.metadata?.firstFailureTimestamp || new Date().toISOString();

      await AuditLog.createLog({
        supabaseUid: "system_worker",
        action: `job_failed_exhausted_${classification}`,
        resourceType: "system",
        outcome: "failure",
        details: {
          queueName,
          jobId: job.id,
          jobName: job.name,
          patientId,
          organizationId,
          timestamp: new Date().toISOString(),
          error: err.message,
          errorStack: err.stack,
          attemptsMade: job.attemptsMade,
          maxAttempts,
          backoff: job.opts.backoff,
          workerName: "standalone_worker",
          classification,
          jobAgeMs: Date.now() - job.timestamp,
          firstFailureTimestamp,
          correlationId,
        },
      });
      console.log(
        `🚨 Logged critical DLQ event to AuditLog for job ${job.id} on queue ${queueName}`,
      );
    } catch (logErr) {
      console.error(
        "❌ Failed to log job failure to AuditLog:",
        logErr.message,
      );
    }
  }
}

async function start() {
  console.log("🔧 Starting CareMyMed Worker Process...");

  // Connect to MongoDB — workers need DB access
  await connectDB();

  // ── Worker 1: Medication Reminders (every minute) ───────────
  const medWorker = new Worker(
    "medication-reminders",
    async (job) => {
      console.log(`[Worker] Processing medication-reminders job ${job.id}`);
      await runMedicationReminders();
    },
    {
      connection,
      concurrency: 1, // Only one reminder scan at a time
      limiter: { max: 1, duration: 55000 }, // At most 1 job per 55s (safety)
    },
  );

  medWorker.on("completed", (job) => {
    handleJobCompleted("medication-reminders", job);
  });
  medWorker.on("failed", (job, err) => {
    handleJobFailure("medication-reminders", job, err);
  });

  // ── Worker 2: AI Notifications (every hour) ─────────────────
  const aiNotifWorker = new Worker(
    "ai-notifications",
    async (job) => {
      console.log(`[Worker] Processing ai-notifications job ${job.id}`);
      await processPatients();
    },
    {
      connection,
      concurrency: 1,
    },
  );

  aiNotifWorker.on("completed", (job) => {
    handleJobCompleted("ai-notifications", job);
  });
  aiNotifWorker.on("failed", (job, err) => {
    handleJobFailure("ai-notifications", job, err);
  });

  // ── Worker 3: Vitals Prediction (on-demand) ─────────────────
  const vitalsWorker = new Worker(
    "vitals-prediction",
    async (job) => {
      const { patientId } = job.data;
      console.log(
        `[Worker] Processing vitals-prediction for patient ${patientId}`,
      );
      const result =
        await AIPredictionService.processPatientPrediction(patientId);
      if (!result.success && result.message !== "Not enough historical data") {
        throw new Error(result.error || "Unknown Error");
      }
      return result;
    },
    {
      connection,
      concurrency: 5, // Multiple predictions can run in parallel
    },
  );

  vitalsWorker.on("completed", (job) => {
    handleJobCompleted("vitals-prediction", job);
  });
  vitalsWorker.on("failed", (job, err) => {
    handleJobFailure("vitals-prediction", job, err);
  });

  // ── Worker 4: Health State Recompute (on-demand/debounced) ──
  const healthWorker = new Worker(
    "health-state-recompute",
    async (job) => {
      const { patientId, options } = job.data;
      const targetDate = options?.targetDate || null;
      console.log(
        `[Worker] Processing health-state-recompute for patient ${patientId} date ${targetDate || "today"}`,
      );
      await recomputeAndCacheHealthState(patientId, targetDate);
    },
    {
      connection,
      concurrency: 3,
    },
  );

  healthWorker.on("completed", (job) => {
    handleJobCompleted("health-state-recompute", job);
  });
  healthWorker.on("failed", (job, err) => {
    handleJobFailure("health-state-recompute", job, err);
  });

  // ── Worker 5: Companion Insights (2-min debounced background task) ─
  const companionWorker = new Worker(
    "companion-insights",
    async (job) => {
      const { patientId } = job.data;
      console.log(
        `[Worker] Processing companion-insights for patient ${patientId}`,
      );
      const companionAiService = require("./src/services/companionAiService");
      await companionAiService.generateAndCacheInsights(patientId);
    },
    {
      connection,
      concurrency: 2,
    },
  );

  companionWorker.on("completed", (job) => {
    handleJobCompleted("companion-insights", job);
  });
  companionWorker.on("failed", (job, err) => {
    handleJobFailure("companion-insights", job, err);
  });

  // ── Worker 6: Health History Backfill (on-demand/background) ──────
  const backfillWorker = new Worker(
    "health-history-backfill",
    async (job) => {
      const { patientId, timezone } = job.data;
      console.log(
        `[Worker] Processing health-history-backfill for patient ${patientId}`,
      );
      const {
        backfillHealthStateHistory,
      } = require("./src/services/patientHealthStateService");
      await backfillHealthStateHistory(patientId, timezone);
    },
    {
      connection,
      concurrency: 1, // Run sequentially so we don't spam database connections
    },
  );

  backfillWorker.on("completed", (job) => {
    handleJobCompleted("health-history-backfill", job);
  });
  backfillWorker.on("failed", (job, err) => {
    handleJobFailure("health-history-backfill", job, err);
  });

  console.log("✅ All workers registered and listening for jobs");
  console.log("   📋 medication-reminders (every 1 min)");
  console.log("   🤖 ai-notifications     (every 60 min)");
  console.log("   🔮 vitals-prediction     (on-demand)");
  console.log("   ❤️  health-state-recompute (on-demand/debounced)");
  console.log("   🧠 companion-insights     (2-min debounced)");
  console.log("   📅 health-history-backfill (on-demand/background)");

  // ── Graceful shutdown ───────────────────────────────────────
  const shutdown = async (signal) => {
    console.log(
      `\n⚠️  Received ${signal}. Shutting down workers gracefully...`,
    );

    // Setup a hard timeout ceiling of 10 seconds for graceful shutdown
    const forceTimeout = setTimeout(() => {
      console.error(
        "🚨 Graceful shutdown timed out! Force exiting worker process.",
      );
      process.exit(1);
    }, 10000);
    forceTimeout.unref();

    try {
      // Pause all workers first to stop picking up new jobs
      await Promise.all([
        medWorker.pause(),
        aiNotifWorker.pause(),
        vitalsWorker.pause(),
        healthWorker.pause(),
        companionWorker.pause(),
        backfillWorker.pause(),
      ]);

      // Then wait for active jobs and close workers
      await Promise.all([
        medWorker.close(),
        aiNotifWorker.close(),
        vitalsWorker.close(),
        healthWorker.close(),
        companionWorker.close(),
        backfillWorker.close(),
      ]);

      console.log("🔒 All workers stopped.");
      clearTimeout(forceTimeout);
      process.exit(0);
    } catch (shutdownErr) {
      console.error(
        "❌ Error during worker graceful shutdown:",
        shutdownErr.message,
      );
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  start().catch((err) => {
    console.error("❌ Worker startup failed:", err);
    process.exit(1);
  });
}

module.exports = { Worker };
