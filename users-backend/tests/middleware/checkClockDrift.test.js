const checkClockDrift = require("../../src/middleware/checkClockDrift");
const logger = require("../../src/utils/logger");

jest.mock("../../src/utils/logger");

describe("checkClockDrift Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      ip: "127.0.0.1",
      auth: {},
      user: {},
    };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should pass through when x-device-timestamp header is absent", () => {
    checkClockDrift(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should pass through without log if device time is close to server time", () => {
    const serverTime = Date.now();
    req.headers["x-device-timestamp"] = new Date(serverTime).toISOString();

    checkClockDrift(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should log a warning if drift is 5 seconds or more", () => {
    const serverTime = Date.now();
    // 10 seconds ahead
    req.headers["x-device-timestamp"] = new Date(serverTime + 10000).toISOString();
    req.headers["x-device-timezone"] = "America/New_York";
    req.auth = { userId: "user-123" };

    checkClockDrift(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "[CHAOS_CLOCK_DRIFT_V1] Significant device clock drift detected",
      expect.objectContaining({
        device_timezone: "America/New_York",
        patient_id: "user-123",
      }),
    );
  });

  it("should fallback to UTC if timezone header is invalid", () => {
    const serverTime = Date.now();
    req.headers["x-device-timestamp"] = new Date(serverTime + 10000).toISOString();
    req.headers["x-device-timezone"] = "Invalid/Timezone";

    // We expect console.warn to be called for invalid timezone, let's spy on it
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    checkClockDrift(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        device_timezone: "UTC",
      }),
    );
    warnSpy.mockRestore();
  });

  it("should handle invalid dates in x-device-timestamp header gracefully", () => {
    req.headers["x-device-timestamp"] = "not-a-valid-date";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    checkClockDrift(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Malformed date in x-device-timestamp header"),
    );
    warnSpy.mockRestore();
  });
});
