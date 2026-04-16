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
jest.mock('../../src/models/RolePermission', () => ({
  hasPermission: mockHasPermission,
}));

// ── Mock AuditLog model ─────────────────────────────────────────────────────
jest.mock('../../src/models/AuditLog', () => ({
  createLog: jest.fn().mockResolvedValue(true),
}));

// ── Mock mongoose to avoid real DB connections ──────────────────────────────
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
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
} = require('../../src/middleware/authorize');

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildReq(profileOverrides = {}) {
  return {
    profile: {
      supabaseUid: 'uid-1',
      role: 'care_manager',
      _id: 'profile-id',
      organizationId: 'org-1',
      ...profileOverrides,
    },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
    path: '/api/test',
    method: 'GET',
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
describe('authorize middleware', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns 401 when no profile present', async () => {
    const mw = authorize('patients', 'read');
    const res = buildRes();
    await mw({ profile: undefined, headers: {}, ip: '' }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('super_admin bypasses all checks', async () => {
    const mw = authorize('patients', 'delete');
    const next = jest.fn();
    await mw(buildReq({ role: 'super_admin' }), buildRes(), next);
    expect(next).toHaveBeenCalled();
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  test('returns 403 when role lacks permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    const mw = authorize('patients', 'delete');
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    );
  });

  test('calls next when role has permission', async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorize('patients', 'read');
    const next = jest.fn();
    await mw(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorizeAny()
// ─────────────────────────────────────────────────────────────────────────────
describe('authorizeAny middleware', () => {
  afterEach(() => jest.clearAllMocks());

  test('super_admin bypasses', async () => {
    const mw = authorizeAny([{ resource: 'x', action: 'y' }]);
    const next = jest.fn();
    await mw(buildReq({ role: 'super_admin' }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when none of the permissions match', async () => {
    mockHasPermission.mockResolvedValue(false);
    const mw = authorizeAny([
      { resource: 'a', action: 'read' },
      { resource: 'b', action: 'read' },
    ]);
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('calls next when at least one permission matches', async () => {
    mockHasPermission
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const mw = authorizeAny([
      { resource: 'a', action: 'read' },
      { resource: 'b', action: 'read' },
    ]);
    const next = jest.fn();
    await mw(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorizeAll()
// ─────────────────────────────────────────────────────────────────────────────
describe('authorizeAll middleware', () => {
  afterEach(() => jest.clearAllMocks());

  test('super_admin bypasses', async () => {
    const mw = authorizeAll([{ resource: 'x', action: 'y' }]);
    const next = jest.fn();
    await mw(buildReq({ role: 'super_admin' }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when not all permissions match', async () => {
    mockHasPermission
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const mw = authorizeAll([
      { resource: 'a', action: 'read' },
      { resource: 'b', action: 'write' },
    ]);
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ missing: [{ resource: 'b', action: 'write' }] }),
    );
  });

  test('calls next when all permissions match', async () => {
    mockHasPermission.mockResolvedValue(true);
    const mw = authorizeAll([
      { resource: 'a', action: 'read' },
      { resource: 'b', action: 'read' },
    ]);
    const next = jest.fn();
    await mw(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// authorizeResource()
// ─────────────────────────────────────────────────────────────────────────────
describe('authorizeResource middleware', () => {
  afterEach(() => jest.clearAllMocks());

  test('super_admin bypasses', async () => {
    const mw = authorizeResource('patients', 'read', () => 'owner-id');
    const next = jest.fn();
    await mw(buildReq({ role: 'super_admin' }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when role lacks base permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    const mw = authorizeResource('patients', 'delete', () => 'owner-id');
    const res = buildRes();
    await mw(buildReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
