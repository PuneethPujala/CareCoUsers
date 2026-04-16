// instrument.js - Sentry Initialization (Must be imported before EVERYTHING else)
require('dotenv').config(); // Load process.env first!
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://565d937c01cf6692ae4ceb8d663fd78c@o4511230751604736.ingest.de.sentry.io/4511230837391440",
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  sendDefaultPii: true,
  // Strip PII from error reports (Audit 9.2) - maintaining privacy guarantees
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
    }
    return event;
  },
});
