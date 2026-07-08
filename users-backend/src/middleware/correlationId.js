const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const correlationLocalStorage = new AsyncLocalStorage();

// Validate format: 8 to 36 characters, alphanumeric and hyphens only
const VALID_CORRELATION_ID_REGEX = /^[a-zA-Z0-9-]{8,36}$/;

/**
 * Retrieve the active log context for the current request context.
 * Returns undefined if called outside an active storage context.
 */
function getLogContext() {
  return correlationLocalStorage.getStore();
}

/**
 * Retrieve the active correlation ID for the current context.
 */
function getCorrelationId() {
  const store = correlationLocalStorage.getStore();
  return typeof store === 'object' && store !== null
    ? store.correlationId
    : store;
}

/**
 * Retrieve the active user ID for the current context.
 */
function getUserId() {
  const store = correlationLocalStorage.getStore();
  return store && typeof store === 'object' ? store.userId : undefined;
}

/**
 * Safely update the active log context with the authenticated user's details.
 */
function setLogContextUser(userId, userType) {
  const store = correlationLocalStorage.getStore();
  if (store && typeof store === 'object') {
    store.userId = userId;
    if (userType) {
      store.userType = userType;
    }
  }
}

/**
 * Express middleware to propagate and track request correlation IDs.
 */
const correlationIdMiddleware = (req, res, next) => {
  let correlationId =
    req.headers['x-correlation-id'] || req.headers['x-request-id'];

  if (correlationId && typeof correlationId === 'string') {
    correlationId = correlationId.trim();
  }

  // Validate format and length constraints to prevent log/payload injection attacks
  if (!correlationId || !VALID_CORRELATION_ID_REGEX.test(correlationId)) {
    correlationId = crypto.randomUUID();
  }

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  // Allocate a fresh context object per request to prevent cross-request leakage under concurrency
  const context = {
    correlationId,
    userId: null,
    userType: null,
  };

  correlationLocalStorage.run(context, () => {
    next();
  });
};

module.exports = {
  correlationIdMiddleware,
  getCorrelationId,
  getUserId,
  getLogContext,
  setLogContextUser,
  correlationLocalStorage,
};
