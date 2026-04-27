/**
 * Simple Structured Logger
 *
 * Provides consistent, JSON-structured logging across the backend.
 * Drop-in compatible with Winston/Pino when ready to swap.
 *
 * FIX 1: Error objects passed in meta (e.g. { error: err }) were silently
 *   serialized as {} by JSON.stringify because Error properties are
 *   non-enumerable. Now extracts message + stack automatically.
 *
 * FIX 2: Added LOG_LEVEL env var support so production can suppress debug
 *   logs without code changes. Defaults to 'debug' in development,
 *   'info' in production.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const activeLevel = process.env.LOG_LEVEL
    ? (LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info)
    : (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug);

/**
 * Serialize meta so Error instances become readable objects.
 * JSON.stringify({ error: new Error('boom') }) → '{"error":{}}'  ← silent data loss
 * This guard converts them to { message, stack } before stringify.
 */
function serializeMeta(meta) {
    const safe = {};
    for (const [key, value] of Object.entries(meta)) {
        if (value instanceof Error) {
            safe[key] = { message: value.message, stack: value.stack, code: value.code };
        } else {
            safe[key] = value;
        }
    }
    return safe;
}

function log(level, fn, message, meta = {}) {
    if (LEVELS[level] < activeLevel) return;
    fn(JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        message,
        ...serializeMeta(meta),
    }));
}

const logger = {
    debug: (message, meta = {}) => log('debug', console.debug, message, meta),
    info: (message, meta = {}) => log('info', console.log, message, meta),
    warn: (message, meta = {}) => log('warn', console.warn, message, meta),
    error: (message, meta = {}) => log('error', console.error, message, meta),
};

module.exports = logger;