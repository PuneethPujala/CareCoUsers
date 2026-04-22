/**
 * Middleware to enforce onboarding gates:
 * 1. Force phone verification for org_admin, care_manager, caller
 * 2. Force password change for temp password accounts
 *
 * Gate order matters: phone verification first (session survives),
 * then password change (which invalidates the Supabase token → auto-logout).
 */

const PHONE_REQUIRED_ROLES = ['org_admin', 'care_manager', 'caller'];

const checkPasswordChange = (req, res, next) => {
    // Routes exempt from all onboarding gates
    const exemptPaths = [
        '/api/auth/change-password',
        '/api/auth/me',
        '/api/auth/logout',
        '/api/auth/phone/send-otp',
        '/api/auth/phone/verify-otp',
        '/api/profile/me',
    ];

    const currentPath = req.originalUrl.split('?')[0]; // strip query params

    if (exemptPaths.includes(currentPath)) {
        return next();
    }

    // Gate 1: Phone verification required (checked first — session survives)
    if (
        req.profile &&
        PHONE_REQUIRED_ROLES.includes(req.profile.role) &&
        req.profile.phoneVerified !== true
    ) {
        return res.status(403).json({
            error: 'Phone verification required',
            code: 'MUST_VERIFY_PHONE',
            mustVerifyPhone: true,
        });
    }

    // Gate 2: Password change required (checked second — invalidates token)
    if (
        req.profile &&
        req.profile.mustChangePassword === true
    ) {
        return res.status(403).json({
            error: 'Password change required',
            code: 'MUST_CHANGE_PASSWORD',
            mustChangePassword: true,
        });
    }

    next();
};

module.exports = { checkPasswordChange };
