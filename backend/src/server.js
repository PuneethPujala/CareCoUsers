const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/database');
const { connectRedis, disconnectRedis } = require('./config/redis');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const patientRoutes = require('./routes/patients');
const caretakerRoutes = require('./routes/caretakers');
const mentorRoutes = require('./routes/mentors');
const organizationRoutes = require('./routes/organizations');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const orgRoutes = require('./routes/org');
const managerRoutes = require('./routes/manager');
const caretakerDashRoutes = require('./routes/caretaker');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Connect to databases ─────────────────────────────────────
connectDB();
connectRedis();

// ── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(compression());

// ── CORS (must be BEFORE rate limiter so 429 responses still include CORS headers) ──
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://your-production-domain.com']
    : function (origin, callback) {
      if (!origin) return callback(null, true); // Allow non-browser clients like mobile apps
      return callback(null, true); // In dev, we allow any origin to prevent Expo/web CORS issues
    },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'production' ? 100 : 500),
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ── Health check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.status(mongoStatus === 'connected' ? 200 : 503).json({
    status: mongoStatus === 'connected' ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'CareConnect Backend API',
    version: process.env.npm_package_version || '1.0.0',
    uptime: `${Math.floor(process.uptime())}s`,
    connections: {
      mongodb: mongoStatus,
      redis: require('./config/redis').getCache ? 'available' : 'unavailable',
    },
  });
});

// ── API routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/caretakers', caretakerRoutes);
app.use('/api/mentors', mentorRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/caretaker', caretakerDashRoutes);

// ── 404 handler ──────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  require('fs').writeFileSync('global_crash.txt', String(err.stack || err));
  console.error('Global error:', err);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ error: 'Validation Error', details: errors });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ error: `${field} already exists` });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ── Start server ─────────────────────────────────────────────
if (require.main === module) {
  const http = require('http');
  const { initializeWebSocket } = require('./websocket/handlers');
  const { startNotificationCrons } = require('./services/notificationService');

  const server = http.createServer(app);

  // Initialize WebSocket on the same HTTP server
  initializeWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CareConnect Backend API running on port ${PORT} (all interfaces)`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
    console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);

    // Start automated notification crons
    startNotificationCrons();
  });

  // ── Graceful shutdown ─────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await disconnectRedis();
      console.log('🔒 Server closed');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
