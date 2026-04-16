process.env.AUTH_ENABLE_SUPABASE_FALLBACK = 'true';

/**
 * Tests for src/middleware/authenticate.js
 *
 * Strategy: we mock Supabase (supabase.auth.getUser), Profile.findOne,
 * AuditLog.createLog, and exercise every branch:
 *   1. Missing Authorization header
 *   2. Invalid / expired token
 *   3. No profile found
 *   4. Locked account
 *   5. Email not verified (non-super_admin)
 *   6. Happy-path (sets req.user, req.profile, calls next)
 *   7. requireRole – allowed / denied / missing profile
 *   8. requireOrganization – allowed, denied, super_admin bypass
 *   9. requireOwnership – own resource, other resource, super_admin bypass
 */

// ── Mock Supabase ────────────────────────────────────────────────────────────
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

// ── Mock Profile model ──────────────────────────────────────────────────────
const mockFindOneProfile = jest.fn();
jest.mock('../../src/models/Profile', () => {
  const chain = { populate: jest.fn() };
  chain.populate.mockImplementation(() => chain._result);
  const findOne = jest.fn((...args) => {
    const result = mockFindOneProfile(...args);
    chain._result = result;
    return chain;
  });
  return { findOne };
});

// ── Mock Patient model ──────────────────────────────────────────────────────
const mockFindOnePatient = jest.fn();
jest.mock('../../src/models/Patient', () => ({
  findOne: jest.fn((...args) => mockFindOnePatient(...args)),
}));

// ── Mock AuditLog model ─────────────────────────────────────────────────────
jest.mock('../../src/models/AuditLog', () => ({
  createLog: jest.fn().mockResolvedValue(true),
}));

const {
  authenticate,
  requireRole,
  requireOrganization,
  requireOwnership,
} = require('../../src/middleware/authenticate');

const mongoose = require('mongoose');

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildReq(overrides = {}) {
  return {
    headers: { authorization: 'Bearer valid-token', 'user-agent': 'jest' },
    ip: '127.0.0.1',
    params: {},
    ...overrides,
  };
}

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// authenticate
// ─────────────────────────────────────────────────────────────────────────────
describe('authenticate middleware', () => {
  afterEach(() => jest.clearAllMocks());

  test('rejects when Authorization header is missing', async () => {
    const req = buildReq({ headers: {} });
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MISSING_AUTH_HEADER' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects on invalid token from Supabase', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });

  test('returns 403 when no profile exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockFindOneProfile.mockReturnValue(null);

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROFILE_NOT_FOUND' }),
    );
  });

  test('returns 423 when account is locked', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockFindOneProfile.mockReturnValue({
      _id: new mongoose.Types.ObjectId(),
      role: 'care_manager',
      isLocked: true,
      accountLockedUntil: new Date(Date.now() + 60_000),
    });

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_LOCKED' }),
    );
  });

  test('returns 403 when email not verified (non-super_admin)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockFindOneProfile.mockReturnValue({
      _id: new mongoose.Types.ObjectId(),
      role: 'care_manager',
      isLocked: false,
      emailVerified: false,
      failedLoginAttempts: 0,
    });

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }),
    );
  });

  test('authenticates successfully and calls next()', async () => {
    const profile = {
      _id: new mongoose.Types.ObjectId(),
      supabaseUid: 'u1',
      role: 'care_manager',
      isLocked: false,
      emailVerified: true,
      failedLoginAttempts: 0,
      organizationId: { _id: new mongoose.Types.ObjectId(), name: 'TestOrg', city: 'Hyd' },
      resetFailedLogin: jest.fn().mockResolvedValue(true),
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockFindOneProfile.mockReturnValue(profile);

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'u1' });
    expect(req.profile).toBe(profile);
  });

  test('falls back to Patient collection when no Profile exists', async () => {
    const patient = {
      _id: new mongoose.Types.ObjectId(),
      supabase_uid: 'u-patient',
      role: 'patient',
      is_active: true,
      isLocked: false,
      emailVerified: true,
      failedLoginAttempts: 0,
      resetFailedLogin: jest.fn().mockResolvedValue(true),
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-patient' } }, error: null });
    mockFindOneProfile.mockReturnValue(null);      // No Profile
    mockFindOnePatient.mockReturnValue(patient);   // Found in Patient

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.profile).toBe(patient);
    expect(req.profile.role).toBe('patient');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireRole
// ─────────────────────────────────────────────────────────────────────────────
describe('requireRole middleware', () => {
  test('returns 401 when no profile on request', () => {
    const mw = requireRole('care_manager');
    const req = {};
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when role not allowed', () => {
    const mw = requireRole('super_admin');
    const req = { profile: { role: 'patient' } };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_ROLE' }),
    );
  });

  test('calls next when role is in allowed list', () => {
    const mw = requireRole('care_manager', 'org_admin');
    const req = { profile: { role: 'care_manager' } };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireOrganization
// ─────────────────────────────────────────────────────────────────────────────
describe('requireOrganization middleware', () => {
  const orgId = new mongoose.Types.ObjectId();

  test('returns 401 when no profile', () => {
    const mw = requireOrganization(orgId);
    const req = {};
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('super_admin bypasses org check', () => {
    const mw = requireOrganization(orgId);
    const req = { profile: { role: 'super_admin' } };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 for wrong organization', () => {
    const mw = requireOrganization(orgId);
    const wrongOrg = new mongoose.Types.ObjectId();
    const req = {
      profile: {
        role: 'care_manager',
        organizationId: { equals: (id) => id.toString() === wrongOrg.toString() },
      },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('calls next for matching organization', () => {
    const mw = requireOrganization(orgId);
    const req = {
      profile: {
        role: 'care_manager',
        organizationId: { equals: (id) => id.toString() === orgId.toString() },
      },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireOwnership
// ─────────────────────────────────────────────────────────────────────────────
describe('requireOwnership middleware', () => {
  test('returns 401 when no profile', () => {
    const mw = requireOwnership();
    const req = { params: {} };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('super_admin is allowed regardless of ownership', () => {
    const mw = requireOwnership();
    const req = {
      params: { id: 'some-other-id' },
      profile: { role: 'super_admin', _id: new mongoose.Types.ObjectId() },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when user does not own the resource', () => {
    const mw = requireOwnership();
    const profileId = new mongoose.Types.ObjectId();
    const req = {
      params: { id: new mongoose.Types.ObjectId().toString() },
      profile: { role: 'care_manager', _id: profileId },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('calls next when user owns the resource', () => {
    const mw = requireOwnership();
    const profileId = new mongoose.Types.ObjectId();
    const req = {
      params: { id: profileId.toString() },
      profile: { role: 'care_manager', _id: profileId },
    };
    const res = buildRes();
    const next = jest.fn();

    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
