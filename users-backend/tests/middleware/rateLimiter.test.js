const {
  _keyGenerators: {
    aiChatKeyGenerator,
    aiChatIpKeyGenerator,
    aiChatPatientKeyGenerator,
    aiChatSessionKeyGenerator,
  },
} = require("../../src/middleware/rateLimiter");

describe("rateLimiter Key Generators", () => {
  it("aiChatRateLimiter keyGenerator should use req.auth?.userId if available", () => {
    const req = { auth: { userId: "user-abc" }, ip: "192.168.1.1" };
    const key = aiChatKeyGenerator(req);
    expect(key).toBe("user-abc");
  });

  it("aiChatRateLimiter keyGenerator should fallback to req.ip", () => {
    const req = { auth: {}, ip: "192.168.1.1" };
    const key = aiChatKeyGenerator(req);
    expect(key).toBe("192.168.1.1");
  });

  it("aiChatIpRateLimiter keyGenerator should use req.ip", () => {
    const req = { ip: "10.0.0.1" };
    const key = aiChatIpKeyGenerator(req);
    expect(key).toBe("10.0.0.1");
  });

  it("aiChatPatientRateLimiter keyGenerator should use userId for Patient type", () => {
    const req = { auth: { userId: "patient-123", userType: "Patient" }, ip: "192.168.1.1" };
    const key = aiChatPatientKeyGenerator(req);
    expect(key).toBe("patient-123");
  });

  it("aiChatPatientRateLimiter keyGenerator should resolve patientId for Companion type in body", () => {
    const req = {
      auth: { userId: "companion-999", userType: "Companion" },
      body: { patientId: "patient-resolved-body" },
      ip: "192.168.1.1",
    };
    const key = aiChatPatientKeyGenerator(req);
    expect(key).toBe("patient-resolved-body");
  });

  it("aiChatPatientRateLimiter keyGenerator should resolve patientId for Companion type in query", () => {
    const req = {
      auth: { userId: "companion-999", userType: "Companion" },
      query: { patientId: "patient-resolved-query" },
      ip: "192.168.1.1",
    };
    const key = aiChatPatientKeyGenerator(req);
    expect(key).toBe("patient-resolved-query");
  });

  it("aiChatSessionRateLimiter keyGenerator should use req.auth?.userId or req.ip", () => {
    const req = { auth: { userId: "user-session-1" }, ip: "192.168.1.1" };
    expect(aiChatSessionKeyGenerator(req)).toBe("user-session-1");
  });
});
