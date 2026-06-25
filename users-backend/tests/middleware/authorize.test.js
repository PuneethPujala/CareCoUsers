/**
 * Tests for src/middleware/authorize.js
 *
 * Covers:
 *   authorize()       — single resource+action check
 *   authorizeAny()    — at-least-one-of check
 *   authorizeAll()    — all-of check
 *   authorizeResource() — role + ownership check
 */

// ── Mock RolePermission model ────────────────────────────────────────────────
const mockHasPermission = jest.fn();
jest.mock("../../src/models/RolePermission", () => ({
  hasPermission: mockHasPermission,
}));

// ── Mock AuditLog model ─────────────────────────────────────────────────────
jest.mock("../../src/models/AuditLog", () => ({
  createLog: jest.fn().mockResolvedValue(true),
}));

// ── Mock mongoose to avoid real DB connections ──────────────────────────────
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return {
    ...actual,
    model: jest.fn(),
  };
});

const {
  authorize,
  authorizeAny,
  authorizeAll,
  authorizeResource,
} = require("../../src/middleware/authorize");

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildReq(profileOverrides = {}) {
  return {
    profile: {
      supabaseUid: "uid-1",
      role: "care_manager",
      _id: "profile-id",
      organizationId: "org-1",
      ...profileOverrides,
    },
    ip: "127.0.0.1",
    headers: { "user-agent": "jest" },
    path: "/api/test",
    method: "GET",
  };
}

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// authorize()
// ─────────────────────────────────────────────────────────────────────────────
describe("authorize middleware", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 401 when no profile present", async () => {
    const mw = authorize("patients", "read");
    const res = buildRes();
    await mw({ profile: undefined, headers: {}, ip: "" }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("super_admin bypasses all checks", async () => {
    const mw = authorize("patients", "delete");
    const next = jest.fn();
    await mw(buildReq({ role: "super_admin" }), buildRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  test("returns 403 when role lacks permission", async () => {
    mockHasPermission.mockResolvedValue(false);
    const mw = authorize("patients", "delete");
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  test("calls next when role has permission", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorize("patients", "read");
    const next = jest.fn();
    await mw(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorizeAny()
// ─────────────────────────────────────────────────────────────────────────────
describe("authorizeAny middleware", () => {
  afterEach(() => jest.clearAllMocks());

  test("super_admin bypasses", async () => {
    const mw = authorizeAny([{ resource: "x", action: "y" }]);
    const next = jest.fn();
    await mw(buildReq({ role: "super_admin" }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("returns 403 when none of the permissions match", async () => {
    mockHasPermission.mockResolvedValue(false);
    const mw = authorizeAny([
      { resource: "a", action: "read" },
      { resource: "b", action: "read" },
    ]);
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("calls next when at least one permission matches", async () => {
    mockHasPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const mw = authorizeAny([
      { resource: "a", action: "read" },
      { resource: "b", action: "read" },
    ]);
    const next = jest.fn();
    await mw(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorizeAll()
// ─────────────────────────────────────────────────────────────────────────────
describe("authorizeAll middleware", () => {
  afterEach(() => jest.clearAllMocks());

  test("super_admin bypasses", async () => {
    const mw = authorizeAll([{ resource: "x", action: "y" }]);
    const next = jest.fn();
    await mw(buildReq({ role: "super_admin" }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("returns 403 when not all permissions match", async () => {
    mockHasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const mw = authorizeAll([
      { resource: "a", action: "read" },
      { resource: "b", action: "write" },
    ]);
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        missing: [{ resource: "b", action: "write" }],
      }),
    );
  });

  test("calls next when all permissions match", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorizeAll([
      { resource: "a", action: "read" },
      { resource: "b", action: "read" },
    ]);
    const next = jest.fn();
    await mw(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorizeResource()
// ─────────────────────────────────────────────────────────────────────────────
describe("authorizeResource middleware", () => {
  afterEach(() => jest.clearAllMocks());

  test("super_admin bypasses", async () => {
    const mw = authorizeResource("patients", "read", () => "owner-id");
    const next = jest.fn();
    await mw(buildReq({ role: "super_admin" }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("returns 403 when role lacks base permission", async () => {
    mockHasPermission.mockResolvedValue(false);
    const mw = authorizeResource("patients", "delete", () => "owner-id");
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("returns 403 when not owner and no special access (regular role)", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorizeResource("patients", "update", () => "other-owner-id");
    const res = buildRes();
    const req = buildReq({ _id: "my-owner-id", role: "caller" });

    // Mock mongoose model resolution
    const mongoose = require("mongoose");
    const mockProfileModel = {
      findById: jest.fn().mockResolvedValue(null),
    };
    mongoose.model.mockReturnValue(mockProfileModel);

    await mw(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "RESOURCE_OWNERSHIP_REQUIRED" }),
    );
  });

  test("calls next when user is owner (string ID vs string ID comparison)", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorizeResource("patients", "update", () => "my-owner-id");
    const next = jest.fn();
    const req = buildReq({ _id: "my-owner-id", role: "caller" });

    await mw(req, buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("calls next when user is owner (Mongoose ObjectId comparison)", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const myId = new mongoose.Types.ObjectId();
    const mw = authorizeResource("patients", "update", () => myId);
    const next = jest.fn();
    const req = buildReq({ _id: myId, role: "caller" });

    await mw(req, buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("calls next when not owner but care_manager has special access in organization (Profile lookup)", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const targetProfileId = new mongoose.Types.ObjectId();
    const myOrgId = new mongoose.Types.ObjectId();

    const mw = authorizeResource("profile", "update", () => targetProfileId);
    const next = jest.fn();

    // Mock target user profile (same organizationId)
    const mockTargetUser = {
      _id: targetProfileId,
      organizationId: myOrgId,
    };

    const mockProfileModel = {
      findById: jest.fn().mockResolvedValue(mockTargetUser),
    };

    mongoose.model.mockImplementation((name) => {
      if (name === "Profile") return mockProfileModel;
      return {};
    });

    const req = buildReq({
      _id: new mongoose.Types.ObjectId(),
      role: "care_manager",
      organizationId: myOrgId,
    });

    await mw(req, buildRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockProfileModel.findById).toHaveBeenCalledWith(targetProfileId);
  });

  test("calls next when not owner but org_admin has special access to a Patient (Patient lookup, snake_case org check)", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const targetPatientId = new mongoose.Types.ObjectId();
    const myOrgId = new mongoose.Types.ObjectId();

    const mw = authorizeResource("patients", "update", () => targetPatientId);
    const next = jest.fn();

    // Mock target patient (has organization_id instead of organizationId)
    const mockTargetPatient = {
      _id: targetPatientId,
      organization_id: myOrgId,
    };

    const mockProfileModel = {
      findById: jest.fn().mockResolvedValue(null), // Not in Profile collection
    };
    const mockPatientModel = {
      findById: jest.fn().mockResolvedValue(mockTargetPatient), // Found in Patient collection!
    };

    mongoose.model.mockImplementation((name) => {
      if (name === "Profile") return mockProfileModel;
      if (name === "Patient") return mockPatientModel;
      return {};
    });

    const req = buildReq({
      _id: new mongoose.Types.ObjectId(),
      role: "org_admin",
      organizationId: myOrgId,
    });

    await mw(req, buildRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockProfileModel.findById).toHaveBeenCalledWith(targetPatientId);
    expect(mockPatientModel.findById).toHaveBeenCalledWith(targetPatientId);
  });

  test("fails closed when target organization_id is null/undefined", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const targetPatientId = new mongoose.Types.ObjectId();
    const myOrgId = new mongoose.Types.ObjectId();

    const mw = authorizeResource("patients", "update", () => targetPatientId);
    const res = buildRes();

    const mockTargetPatient = {
      _id: targetPatientId,
      organization_id: null,
    };

    const mockProfileModel = { findById: jest.fn().mockResolvedValue(null) };
    const mockPatientModel = { findById: jest.fn().mockResolvedValue(mockTargetPatient) };

    mongoose.model.mockImplementation((name) => {
      if (name === "Profile") return mockProfileModel;
      if (name === "Patient") return mockPatientModel;
      return {};
    });

    const req = buildReq({
      _id: new mongoose.Types.ObjectId(),
      role: "org_admin",
      organizationId: myOrgId,
    });

    await mw(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("fails closed when current user organizationId is null/undefined", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const targetPatientId = new mongoose.Types.ObjectId();
    const myOrgId = new mongoose.Types.ObjectId();

    const mw = authorizeResource("patients", "update", () => targetPatientId);
    const res = buildRes();

    const mockTargetPatient = {
      _id: targetPatientId,
      organization_id: myOrgId,
    };

    const mockProfileModel = { findById: jest.fn().mockResolvedValue(null) };
    const mockPatientModel = { findById: jest.fn().mockResolvedValue(mockTargetPatient) };

    mongoose.model.mockImplementation((name) => {
      if (name === "Profile") return mockProfileModel;
      if (name === "Patient") return mockPatientModel;
      return {};
    });

    const req = buildReq({
      _id: new mongoose.Types.ObjectId(),
      role: "org_admin",
      organizationId: null,
    });

    await mw(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("fails closed when both organization IDs are null/undefined (null-vs-null check)", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const targetPatientId = new mongoose.Types.ObjectId();

    const mw = authorizeResource("patients", "update", () => targetPatientId);
    const res = buildRes();

    const mockTargetPatient = {
      _id: targetPatientId,
      organization_id: null,
    };

    const mockProfileModel = { findById: jest.fn().mockResolvedValue(null) };
    const mockPatientModel = { findById: jest.fn().mockResolvedValue(mockTargetPatient) };

    mongoose.model.mockImplementation((name) => {
      if (name === "Profile") return mockProfileModel;
      if (name === "Patient") return mockPatientModel;
      return {};
    });

    const req = buildReq({
      _id: new mongoose.Types.ObjectId(),
      role: "org_admin",
      organizationId: null,
    });

    await mw(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("calls next when organization IDs match but one is string and the other is ObjectId", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mongoose = require("mongoose");
    const targetPatientId = new mongoose.Types.ObjectId();
    const myOrgId = new mongoose.Types.ObjectId();

    const mw = authorizeResource("patients", "update", () => targetPatientId);
    const next = jest.fn();

    const mockTargetPatient = {
      _id: targetPatientId,
      organization_id: myOrgId.toString(),
    };

    const mockProfileModel = { findById: jest.fn().mockResolvedValue(null) };
    const mockPatientModel = { findById: jest.fn().mockResolvedValue(mockTargetPatient) };

    mongoose.model.mockImplementation((name) => {
      if (name === "Profile") return mockProfileModel;
      if (name === "Patient") return mockPatientModel;
      return {};
    });

    const req = buildReq({
      _id: new mongoose.Types.ObjectId(),
      role: "org_admin",
      organizationId: myOrgId,
    });

    await mw(req, buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("skips ownership check when getResourceOwner returns undefined/null", async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorizeResource("patients", "update", () => null);
    const next = jest.fn();
    const req = buildReq({ role: "caller" });

    await mw(req, buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
