/**
 * mockAuth.js
 * Auth-related test helpers.
 *
 * Fixes vs original:
 * - mockProfile._id wrapped in fakeId() so .equals() works in route access checks
 * - mockProfile.organizationId wrapped in fakeId() by default — routes call
 *   .equals() on it; plain strings silently fail the check
 * - resetFailedLogin added as jest.fn() — authenticate middleware calls it
 * - save added as jest.fn() — some routes call profile.save()
 * - isLocked getter uses new Date() comparison not Date.now() (Date > number is always false)
 * - fakeAuthenticate now reads from a shared mutable ref so tests can change
 *   profile between requests without re-requiring the module
 * - mockSupabaseUser adds email_confirmed_at and created_at — auth.js reads these
 * - passThrough exported (unchanged — was already correct)
 */

// ─── fakeId ───────────────────────────────────────────────────────────────────
// Mirrors the helper in mockModels.js — returns an object that behaves like
// a Mongoose ObjectId for equality checks used in route access control.

function fakeId(val) {
    const s = String(val);
    return {
        _bsontype: 'ObjectId',
        toString:  () => s,
        toJSON:    () => s,
        equals:    (other) => s === String(other?._id ?? other),
    };
}

// ─── mockProfile ──────────────────────────────────────────────────────────────

/**
 * Build a realistic Profile document for use in tests.
 * _id and organizationId are wrapped in fakeId() so .equals() works in routes.
 */
function mockProfile(overrides = {}) {
    const rawId  = overrides._id            || 'test-profile-id';
    const rawOrg = overrides.organizationId || 'test-org-id';

    const base = {
        _id:                fakeId(rawId),
        supabaseUid:        overrides.supabaseUid        || `sup-uid-${String(rawId).slice(0, 8)}`,
        email:              overrides.email              || 'test@careco.in',
        fullName:           overrides.fullName           || 'Test User',
        role:               overrides.role               || 'care_manager',
        organizationId:     fakeId(rawOrg),
        isActive:           overrides.isActive           !== undefined ? overrides.isActive           : true,
        mustChangePassword: overrides.mustChangePassword !== undefined ? overrides.mustChangePassword  : false,
        emailVerified:      overrides.emailVerified      !== undefined ? overrides.emailVerified       : true,
        failedLoginAttempts: overrides.failedLoginAttempts || 0,
        accountLockedUntil: overrides.accountLockedUntil || null,
        passwordHistory:    overrides.passwordHistory    || [],
        twoFactorEnabled:   overrides.twoFactorEnabled   || false,
        lastLoginAt:        overrides.lastLoginAt        || null,
        metadata:           overrides.metadata           || {},

        // Mongoose instance methods used by routes / middleware
        resetFailedLogin: jest.fn().mockResolvedValue(true),
        save:             jest.fn().mockResolvedValue(true),

        // Computed helpers
        hasRole:    function (role)  { return this.role === role; },
        hasAnyRole: function (roles) { return roles.includes(this.role); },

        // isLocked must compare Date objects, not Date > number
        get isLocked() {
            return !!(this.accountLockedUntil && new Date(this.accountLockedUntil) > new Date());
        },

        toJSON: function () {
            const { save, resetFailedLogin, toJSON, hasRole, hasAnyRole, ...rest } = this;
            return rest;
        },
    };

    // Apply overrides last — but re-apply fakeId fields so plain string
    // overrides don't stomp the ObjectId wrappers
    return {
        ...base,
        ...overrides,
        _id:            fakeId(rawId),
        organizationId: overrides.organizationId !== undefined
            // If caller passed an object with .equals() already, keep it as-is
            ? (typeof overrides.organizationId === 'object' && overrides.organizationId.equals
                ? overrides.organizationId
                : fakeId(overrides.organizationId))
            : fakeId(rawOrg),
    };
}

// ─── mockSupabaseUser ─────────────────────────────────────────────────────────

/**
 * Build a fake Supabase user (shape returned by supabase.auth.getUser).
 * Includes all fields that auth.js reads from the user object.
 */
function mockSupabaseUser(overrides = {}) {
    return {
        id:                  overrides.id    || 'sup-uid-12345678',
        email:               overrides.email || 'test@careco.in',
        email_confirmed_at:  overrides.email_confirmed_at  || new Date().toISOString(),
        created_at:          overrides.created_at          || new Date().toISOString(),
        user_metadata:       overrides.user_metadata || { full_name: 'Test User', role: 'care_manager' },
        app_metadata:        overrides.app_metadata  || {},
        ...overrides,
    };
}

// ─── fakeAuthenticate ─────────────────────────────────────────────────────────

/**
 * Returns a middleware function that injects a fake req.user and req.profile.
 *
 * Pass a mutable state object so individual tests can change the profile
 * between requests without re-requiring or re-mocking the module.
 *
 * Usage — shared state pattern (recommended, matches all test files):
 *
 *   const mockAuthState = { profile: mockProfile(), user: mockSupabaseUser() };
 *
 *   jest.mock('../../src/middleware/authenticate', () => ({
 *       authenticate:  fakeAuthenticate(mockAuthState),
 *       requireRole:   fakeRequireRole(mockAuthState),
 *       optionalAuthenticate: (req, res, next) => next(),
 *   }));
 *
 *   // In a test:
 *   mockAuthState.profile = mockProfile({ role: 'super_admin' });
 *
 * @param {object} state - mutable object with { profile, user? }
 */
function fakeAuthenticate(state = {}) {
    return (req, res, next) => {
        const profile = state.profile || mockProfile();
        const user    = state.user    || mockSupabaseUser({
            id:    profile.supabaseUid,
            email: profile.email,
        });
        req.user    = user;
        req.profile = profile;
        next();
    };
}

// ─── fakeRequireRole ──────────────────────────────────────────────────────────

/**
 * Returns a requireRole(...roles) middleware factory that enforces the real
 * role check against the current state.profile.
 *
 * This lets 403 tests work without reimplementing the check in every test.
 *
 * Usage:
 *   requireRole: fakeRequireRole(mockAuthState),
 */
function fakeRequireRole(state = {}) {
    return (...allowedRoles) => (req, res, next) => {
        const role = (state.profile || req.profile)?.role;
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({
                error:    'Insufficient role permissions',
                code:     'INSUFFICIENT_ROLE',
                required: allowedRoles,
                current:  role,
            });
        }
        next();
    };
}

// ─── passThrough ──────────────────────────────────────────────────────────────

/**
 * Returns a pass-through middleware — just calls next().
 * Use to stub out authorize, scopeFilter, checkPasswordChange, etc.
 */
function passThrough() {
    return (_req, _res, next) => next();
}

module.exports = {
    fakeId,
    mockProfile,
    mockSupabaseUser,
    fakeAuthenticate,
    fakeRequireRole,
    passThrough,
};