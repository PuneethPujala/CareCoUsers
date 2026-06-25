// IMPORTANT: Make sure to import `instrument.js` at the top of your file.
require("../instrument.js");
const Sentry = require("@sentry/node");

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  Sentry.captureException(reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception thrown:", error);
  Sentry.captureException(error);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
let isShuttingDown = false;

const connectDB = require("./config/database");
const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const patientRoutes = require("./routes/patients");
const organizationRoutes = require("./routes/organizations");
const reportRoutes = require("./routes/reports");
const paymentRoutes = require("./routes/payment");

// Users App routes (separate API gateway)
const usersPatientRoutes = require("./routes/users/patients");
const usersCallerRoutes = require("./routes/users/callers");
const usersMedicineRoutes = require("./routes/users/medicines");
const notificationsRoutes = require("./routes/users/notifications");
const vitalsRoutes = require("./routes/vitalsRoutes");
const vitalsSyncRoutes = require("./routes/vitalsSync");
const companionRoutes = require("./routes/companion");

const app = express();
const { correlationIdMiddleware, getCorrelationId } = require("./middleware/correlationId");
app.use(correlationIdMiddleware);
// Enable if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, Render, etc)
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;

// ── Sentry Test Route (Optional) ───────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("My first Sentry error!");
  });
}

// Connect to MongoDB (skip in test environment to avoid open handles or missing mocks)
if (process.env.NODE_ENV !== "test") {
  connectDB().then(async () => {
    try {
      // Run idempotent database migrations safely
      const { runMigrations } = require("./scripts/migrate-companions");
      await runMigrations();

      const {
        runSeparateProfilesMigration,
      } = require("./scripts/separate-companion-profiles");
      await runSeparateProfilesMigration();
    } catch (err) {
      console.error("Failed to run database migrations:", err);
    }
  });

  // ── Job scheduling ────────────────────────────────────────────────
  // We explicitly start the in-process node-cron jobs here so they run
  // directly on the Render Web Service dyno, avoiding the need for a separate Worker dyno.
  (async () => {
    /**
     * ── USE_BULLMQ_WORKERS Flag & Deployment Topology ─────────────────────────────────
     * To prevent double-firing notifications/reminders in production:
     * - Web Dyno / API instances: Set USE_BULLMQ_WORKERS=true (skips in-process node-cron).
     * - Worker Dyno / Standalone worker.js process: Runs cron jobs via BullMQ repeatable queues.
     * - Default (e.g. dev/local setup without separate worker): USE_BULLMQ_WORKERS is unset/false,
     *   which runs node-cron in-process so notifications still function out-of-the-box.
     */
    if (process.env.USE_BULLMQ_WORKERS === "true") {
      console.log(
        "⏰ BullMQ Worker process is active. Skipping notification and medication-reminder in-process crons.",
      );
    } else {
      console.log("⏰ Starting in-process cron jobs (Node-Cron)");
      require("./jobs/notificationJob").startNotificationCron();
      require("./jobs/medicationReminderJob").startMedicationCron();
    }
    require("./jobs/escalationJob").startEscalationCron();
    require("./jobs/receiptPollingJob").startReceiptCron();
    require("./jobs/observabilityJob").startObservabilityCron();
  })();
}

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
// Mobile apps send no Origin header, so we allow them (!origin).
// But we restrict browser origins in production.
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV === "production") {
        const whitelist = [process.env.FRONTEND_URL];
        if (
          whitelist.includes(origin) ||
          origin.startsWith("caremymed-app://") ||
          origin.startsWith("exp://")
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  }),
);

// Setup strict cache-control for API endpoints
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Clock drift observability check
const checkClockDrift = require("./middleware/checkClockDrift");
app.use("/api", checkClockDrift);

// Body parsing middleware
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// Service status helper function
async function checkServicesReady() {
  const mongoose = require("mongoose");
  const redis = require("./lib/redis");
  const { getRedisConnection } = require("./jobs/redisConnection");

  // 1. MongoDB check
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected");
  }

  // 2. Redis connection check with 2s timeout
  if (redis.status !== "ready") {
    throw new Error(`Redis status is ${redis.status}`);
  }
  await Promise.race([
    redis.ping(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Redis ping timeout")), 2000),
    ),
  ]);
}

// Health check endpoints
app.get("/live", (req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/ready", async (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ error: "Service is shutting down" });
  }
  try {
    await checkServicesReady();
    res.status(200).json({ status: "ready" });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.get(["/", "/health", "/api/health"], async (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ error: "Service is shutting down" });
  }
  try {
    await checkServicesReady();
    const mongoose = require("mongoose");
    const redis = require("./lib/redis");

    res.status(200).json({
      status: "healthy",
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      services: {
        mongodb:
          mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        redis: redis.status === "ready" ? "connected" : "disconnected",
        bullmq: "healthy",
      },
    });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/payment", paymentRoutes);

const {
  authenticate,
  authenticateSession,
} = require("./middleware/authenticate");
const requireSubscription = require("./middleware/requireSubscription");

// ─── Users App API Gateway ─────────────────────
app.use("/api/users/patients", usersPatientRoutes);
app.use("/api/users/patients/notifications", notificationsRoutes);
app.use("/api/users/callers", usersCallerRoutes);
app.use(
  "/api/users/medicines",
  authenticateSession,
  requireSubscription,
  usersMedicineRoutes,
);
app.use("/api/vitals", authenticateSession, requireSubscription, vitalsRoutes);
app.use(
  "/api/vitals",
  authenticateSession,
  requireSubscription,
  vitalsSyncRoutes,
);

// Companion Routes
app.use("/api/companion", companionRoutes);

// ─── Chatbot API ───────────────────────────────
const chatbotRoutes = require("./routes/chatbotRoutes");
app.use("/api/chatbot", authenticate, requireSubscription, chatbotRoutes);

// ─── OCR API ───────────────────────────────────
const ocrRoutes = require("./routes/ocrRoutes");
app.use("/api/ocr", authenticate, requireSubscription, ocrRoutes);

// ─── Admin API ─────────────────────────────────
const adminObservabilityRoutes = require("./routes/admin/observability");
app.use("/api/admin/observability", adminObservabilityRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const correlationId = req.correlationId || getCorrelationId();
  console.error("Global error:", err, { correlationId });

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: "Validation Error", details: errors, correlationId });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ error: `${field} already exists`, correlationId });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token", correlationId });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired", correlationId });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    correlationId,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start server
let serverListener;
if (require.main === module) {
  serverListener = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `🚀 CareMyMednnect Backend API running on port ${PORT} (all interfaces)`,
    );
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  });
}

// Graceful shutdown sequence
const handleGracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(
    `\n⚠️  Received ${signal}. Shutting down API server gracefully...`,
  );

  // Setup a hard timeout ceiling of 10 seconds for graceful shutdown
  const forceTimeout = setTimeout(() => {
    console.error("🚨 Graceful shutdown timed out! Force exiting API server.");
    process.exit(1);
  }, 10000);
  forceTimeout.unref();

  if (serverListener) {
    console.log("🛑 Closing HTTP server...");
    await new Promise((resolve) => serverListener.close(resolve));
    console.log("HTTP server closed.");
  }

  try {
    const mongoose = require("mongoose");
    const redis = require("./lib/redis");
    const { getRedisConnection } = require("./jobs/redisConnection");

    console.log("Closing MongoDB connection...");
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");

    console.log("Closing Redis connections...");
    if (redis.status !== "end") {
      await redis.quit();
    }
    const bullRedis = getRedisConnection();
    if (bullRedis && bullRedis.status !== "end") {
      await bullRedis.quit();
    }
    console.log("Redis connections closed.");

    console.log("🔒 API server stopped.");
    clearTimeout(forceTimeout);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during API graceful shutdown:", err.message);
    process.exit(1);
  }
};

process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));

module.exports = app;
