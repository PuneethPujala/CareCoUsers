/**
 * Middleware to force password change for temp password accounts.
 * If profile.mustChangePassword is true and the route is NOT an exempt route,
 * returns 403 with { mustChangePassword: true }.
 */
const checkPasswordChange = (req, res, next) => {
    // Routes exempt from forced password change (user must be able to reach these)
    const exemptPaths = [
        '/api/auth/change-password',
        '/api/auth/me',
        '/api/auth/logout',
    ];

    // Use req.originalUrl which always has the full path (req.path is relative inside routers)
    const currentPath = req.originalUrl.split('?')[0]; // strip query params

    if (
        req.profile &&
        req.profile.mustChangePassword === true &&
        !exemptPaths.includes(currentPath)
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
