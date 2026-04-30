// IMPORTANT: Make sure to import `instrument.js` at the top of your file.
require('../instrument.js');
const Sentry = require('@sentry/node');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const patientRoutes = require('./routes/patients');
const organizationRoutes = require('./routes/organizations');
const reportRoutes = require('./routes/reports');

// Users App routes (separate API gateway)
const usersPatientRoutes = require('./routes/users/patients');
const usersCallerRoutes = require('./routes/users/callers');
const usersMedicineRoutes = require('./routes/users/medicines');
const notificationsRoutes = require('./routes/users/notifications');
const vitalsRoutes = require('./routes/vitalsRoutes');
const vitalsSyncRoutes = require('./routes/vitalsSync');

const app = express();
// Enable if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, Render, etc)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// ── Sentry Test Route (Optional) ───────────────────────────────────────────
app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

// Connect to MongoDB (skip in test environment to avoid open handles or missing mocks)
if (process.env.NODE_ENV !== 'test') {
  connectDB();
  require('./jobs/notificationJob').startNotificationCron();
  require('./jobs/medicationReminderJob'); // Starts the 1-minute medication cron
}

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
// Mobile apps send no Origin header, so we allow them (!origin).
// But we restrict browser origins in production.
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV === 'production') {
        const whitelist = [process.env.FRONTEND_URL];
        if (whitelist.includes(origin) || origin.startsWith('careco-app://') || origin.startsWith('exp://')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    } else {
        callback(null, true);
    }
  },
  credentials: true,
}));

// Setup strict cache-control for API endpoints
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check endpoints
app.get(['/', '/health'], (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'CareConnect Backend API'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/reports', reportRoutes);

// ─── Users App API Gateway ─────────────────────
app.use('/api/users/patients', usersPatientRoutes);
app.use('/api/users/patients/notifications', notificationsRoutes);
app.use('/api/users/callers', usersCallerRoutes);
app.use('/api/users/medicines', usersMedicineRoutes);
app.use('/api/vitals', vitalsRoutes);
app.use('/api/vitals', vitalsSyncRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Global error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ error: 'Validation Error', details: errors });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ error: `${field} already exists` });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CareConnect Backend API running on port ${PORT} (all interfaces)`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  });
}

module.exports = app;
