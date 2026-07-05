const otpService = require("../../src/services/otpService");
const redis = require("../../src/lib/redis");

describe("OTP Service - Brute Force Protection", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    jest
      .spyOn(redis, "get")
      .mockImplementation((key) => Promise.resolve(store[key] || null));
    jest.spyOn(redis, "set").mockImplementation((key, val) => {
      store[key] = val;
      return Promise.resolve("OK");
    });
    jest.spyOn(redis, "del").mockImplementation((key) => {
      delete store[key];
      return Promise.resolve(1);
    });
    redis.incr = jest.fn((key) => {
      const current = parseInt(store[key] || "0", 10);
      const next = current + 1;
      store[key] = next.toString();
      return Promise.resolve(next);
    });
    redis.expire = jest.fn(() => Promise.resolve(1));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should invalidate the OTP code after 5 failed verification attempts", async () => {
    const email = "attacker@caremymed.in";

    // Bypass cooldown logic in MockRedis
    jest
      .spyOn(redis, "set")
      .mockImplementationOnce(() => Promise.resolve("OK"));

    const otp = await otpService.createOTP(email);
    expect(otp).toBeDefined();

    // Verify correct OTP initially exists
    const key = `otp:${email}`;
    expect(store[key]).toBe(otp);

    // 4 failed verification attempts
    for (let i = 0; i < 4; i++) {
      const res = await otpService.verifyOTP(email, "000000"); // wrong code
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("Invalid OTP");
    }

    // 5th failed attempt should invalidate the code
    const res5 = await otpService.verifyOTP(email, "000000");
    expect(res5.valid).toBe(false);
    expect(res5.reason).toContain("Too many failed attempts");

    // The original OTP key should now be deleted/invalidated
    expect(store[key]).toBeUndefined();

    // Trying correct OTP should fail because it was deleted
    const correctRes = await otpService.verifyOTP(email, otp);
    expect(correctRes.valid).toBe(false);
    expect(correctRes.reason).toContain("expired or not found");
  });
});
