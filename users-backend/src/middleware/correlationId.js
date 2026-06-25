const { AsyncLocalStorage } = require("async_hooks");
const crypto = require("crypto");

const correlationLocalStorage = new AsyncLocalStorage();

// Validate format: 8 to 36 characters, alphanumeric and hyphens only
const VALID_CORRELATION_ID_REGEX = /^[a-zA-Z0-9-]{8,36}$/;

/**
 * Retrieve the active correlation ID for the current context.
 * Returns undefined if called outside an active storage context.
 */
function getCorrelationId() {
  return correlationLocalStorage.getStore();
}

/**
 * Express middleware to propagate and track request correlation IDs.
 */
const correlationIdMiddleware = (req, res, next) => {
  let correlationId =
    req.headers["x-correlation-id"] || req.headers["x-request-id"];

  if (correlationId && typeof correlationId === "string") {
    correlationId = correlationId.trim();
  }

  // Validate format and length constraints to prevent log/payload injection attacks
  if (!correlationId || !VALID_CORRELATION_ID_REGEX.test(correlationId)) {
    correlationId = crypto.randomUUID();
  }

  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);

  correlationLocalStorage.run(correlationId, () => {
    next();
  });
};

module.exports = {
  correlationIdMiddleware,
  getCorrelationId,
  correlationLocalStorage,
};
