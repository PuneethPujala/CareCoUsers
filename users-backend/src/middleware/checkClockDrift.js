const logger = require("../utils/logger");

/**
 * Validates whether a timezone identifier string is standard and valid.
 */
function isValidTimeZone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Middleware to check client clock drift and log anomalies.
 */
const checkClockDrift = (req, res, next) => {
  try {
    const deviceTimeStr = req.headers["x-device-timestamp"];
    const deviceTz = req.headers["x-device-timezone"];

    if (deviceTimeStr) {
      const deviceTime = new Date(deviceTimeStr).getTime();
      const serverTime = Date.now();

      if (!isNaN(deviceTime)) {
        const driftMs = Math.abs(serverTime - deviceTime);

        // Sanitize timezone
        let sanitizedTz = "UTC";
        if (deviceTz) {
          if (isValidTimeZone(deviceTz)) {
            sanitizedTz = deviceTz;
          } else {
            console.warn(
              `[CHAOS_CLOCK_DRIFT_V1] Malformed/Invalid timezone header: "${deviceTz}". Falling back to UTC.`,
            );
          }
        }

        // If clock drift is >= 5 seconds (5000ms)
        if (driftMs >= 5000) {
          logger.warn(
            "[CHAOS_CLOCK_DRIFT_V1] Significant device clock drift detected",
            {
              drift_ms: driftMs,
              device_timestamp: deviceTimeStr,
              device_timezone: sanitizedTz,
              patient_id: req.auth?.userId || req.user?.id || "anonymous",
              ip: req.ip,
            },
          );
        }
      } else {
        console.warn(
          `[CHAOS_CLOCK_DRIFT_V1] Malformed date in x-device-timestamp header: "${deviceTimeStr}"`,
        );
      }
    }
  } catch (err) {
    // Fail silently to prevent crashing production requests due to validation errors
    console.error("[Clock Drift Check] Error in middleware:", err.message);
  }

  next();
};

module.exports = checkClockDrift;
