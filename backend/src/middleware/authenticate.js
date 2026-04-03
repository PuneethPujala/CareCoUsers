const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

/**
 * authenticate
 * Verifies Supabase JWT and fetches MongoDB profile.
 * Attaches req.user (Supabase) and req.profile (MongoDB) to the request.
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing or invalid Authorization header',
                code: 'MISSING_AUTH_HEADER',
            });
        }

        const token = authHeader.split(' ')[1];

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            await AuditLog.createLog({
                supabaseUid: 'anonymous',
                action: 'login_failed',
                resourceType: 'system',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                outcome: 'failure',
                details: {
                    reason: error?.message || 'Invalid token',
                    tokenPrefix: token.substring(0, 10) + '...',
                },
            });

            return res.status(401).json({
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN',
            });
        }

        let profile = await Profile.findOne({
            supabaseUid: user.id,
            isActive: true,
        }).populate('organizationId', 'name city');

        // Auto-heal Supabase UID mismatch if user was recreated in Supabase but their MongoDB profile remains
        if (!profile && user.email) {
            const emailProfile = await Profile.findOne({
                email: user.email.toLowerCase().trim(),
                isActive: true,
            });
            if (emailProfile) {
                emailProfile.supabaseUid = user.id;
                await emailProfile.save();
                profile = await Profile.findById(emailProfile._id).populate('organizationId', 'name city');
                console.log(`Auto-healed supabaseUid for profile: ${profile.email}`);
            }
        }

        if (!profile) {
            // ── Patient fallback ──────────────────────────
            let patient = await Patient.findOne({
                supabase_uid: user.id,
                is_active: true,
            });

            // Auto-heal Patient UID mismatch by email
            if (!patient && user.email) {
                const emailPatient = await Patient.findOne({
                    email: user.email.toLowerCase().trim(),
                    is_active: true,
                });
                if (emailPatient) {
                    emailPatient.supabase_uid = user.id;
                    await emailPatient.save();
                    patient = emailPatient;
                    console.log(`Auto-healed supabase_uid for patient: ${patient.email}`);
                }
            }

            if (patient) {
                profile = patient; // attach Patient doc as req.profile
                // Normalize organization field for middleware consistency
                profile.organizationId = patient.organization_id;
            }
        }

        if (!profile) {
            return res.status(403).json({
                error: 'No account found. Please sign up first.',
                code: 'PROFILE_NOT_FOUND',
            });
        }

        if (profile.isLocked) {
            await AuditLog.createLog({
                supabaseUid: user.id,
                action: 'login_failed',
                resourceType: 'profile',
                resourceId: profile._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                outcome: 'failure',
                details: {
                    reason: 'Account locked',
                    lockedUntil: profile.accountLockedUntil,
                },
            });

            return res.status(423).json({
                error: 'Account is temporarily locked',
                code: 'ACCOUNT_LOCKED',
                lockedUntil: profile.accountLockedUntil,
            });
        }

        // All staff roles except super_admin require verified email
        // Patients skip this check — their email is confirmed via Supabase at registration
        if (profile.role !== 'super_admin' && profile.role !== 'patient' && !profile.emailVerified) {
            return res.status(403).json({
                error: 'Email verification required',
                code: 'EMAIL_NOT_VERIFIED',
            });
        }

        if (profile.failedLoginAttempts > 0) {
            await profile.resetFailedLogin();
        }

        req.user = user;     // Supabase user object
        req.profile = profile;  // MongoDB profile with role and org

        await AuditLog.createLog({
            supabaseUid: user.id,
            action: 'login',
            resourceType: 'profile',
            resourceId: profile._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'success',
            details: {
                role: profile.role,
                organizationId: profile.organizationId?._id,
            },
        });

        next();
    } catch (err) {
        console.error('Authentication error:', err);

        await AuditLog.createLog({
            supabaseUid: 'anonymous',
            action: 'login_failed',
            resourceType: 'system',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            outcome: 'failure',
            details: {
                reason: 'System error during authentication',
                error: err.message,
            },
        });

        return res.status(500).json({
            error: 'Authentication error',
            code: 'AUTH_SYSTEM_ERROR',
        });
    }
};

/**
 * optionalAuthenticate
 * Attaches req.user and req.profile if a valid token is present,
 * but does not block the request if missing or invalid.
 */
const optionalAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return next();

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return next();

        let profile = await Profile.findOne({
            supabaseUid: user.id,
            isActive: true,
        }).populate('organizationId', 'name city'); // ← fixed: was 'name type'

        // Auto-heal Supabase UID mismatch if user was recreated in Supabase but their MongoDB profile remains
        if (!profile && user.email) {
            const emailProfile = await Profile.findOne({
                email: user.email.toLowerCase().trim(),
                isActive: true,
            });
            if (emailProfile) {
                emailProfile.supabaseUid = user.id;
                await emailProfile.save();
                profile = await Profile.findById(emailProfile._id).populate('organizationId', 'name city');
                console.log(`[Optional Auth] Auto-healed supabaseUid for profile: ${profile.email}`);
            }
        }

        // ── Patient fallback ──────────────────────────
        if (!profile) {
            let patient = await Patient.findOne({
                supabase_uid: user.id,
                is_active: true,
            });
            if (!patient && user.email) {
                const emailPatient = await Patient.findOne({
                    email: user.email.toLowerCase().trim(),
                    is_active: true,
                });
                if (emailPatient) {
                    emailPatient.supabase_uid = user.id;
                    await emailPatient.save();
                    patient = emailPatient;
                    console.log(`[Optional Auth] Auto-healed supabase_uid for patient: ${patient.email}`);
                }
            }
            if (patient) {
                profile = patient;
                // Normalize organization field for middleware consistency
                profile.organizationId = patient.organization_id;
            }
        }

        if (profile && !profile.isLocked &&
            (profile.role === 'super_admin' || profile.role === 'patient' || profile.emailVerified)) {
            req.user = user;
            req.profile = profile;
        }

        next();
    } catch (err) {
        console.error('Optional authentication error:', err);
        next();
    }
};

/**
 * authenticateSession
 * Only verifies the Supabase token and attaches req.user.
 * Does NOT require a MongoDB profile/patient to exist.
 */
const authenticateSession = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing or invalid Authorization header',
                code: 'MISSING_AUTH_HEADER',
            });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN',
            });
        }

        // Attach user and try to find profile, but don't fail if missing
        req.user = user;

        let profile = await Profile.findOne({
            supabaseUid: user.id,
            isActive: true,
        }).populate('organizationId', 'name city');

        if (!profile) {
            let patient = await Patient.findOne({
                supabase_uid: user.id,
                is_active: true,
            });
            if (patient) {
                profile = patient;
                // Normalize organization field for middleware consistency
                profile.organizationId = patient.organization_id;
            }
        }

        req.profile = profile; // May be null
        next();
    } catch (err) {
        console.error('Session authentication error:', err);
        return res.status(500).json({ error: 'Authentication error' });
    }
};

/**
 * requireRole(...roles)
 * Blocks request if authenticated user's role is not in the allowed list.
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.profile) {
            return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        if (!allowedRoles.includes(req.profile.role)) {
            return res.status(403).json({
                error: 'Insufficient role permissions',
                code: 'INSUFFICIENT_ROLE',
                required: allowedRoles,
                current: req.profile.role,
            });
        }
        next();
    };
};

/**
 * requireOrganization(organizationId)
 * Ensures the authenticated user belongs to a specific org.
 * super_admin bypasses this check.
 */
const requireOrganization = (organizationId) => {
    return (req, res, next) => {
        if (!req.profile) {
            return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        if (req.profile.role === 'super_admin') return next();

        if (!req.profile.organizationId ||
            !req.profile.organizationId.equals(organizationId)) {
            return res.status(403).json({
                error: 'Access denied to this organization',
                code: 'ORGANIZATION_ACCESS_DENIED',
            });
        }
        next();
    };
};

/**
 * requireOwnership(resourceIdParam)
 * Ensures the user is accessing their own resource.
 * super_admin bypasses this check.
 */
const requireOwnership = (resourceIdParam = 'id') => {
    return (req, res, next) => {
        if (!req.profile) {
            return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
        }
        if (req.profile.role === 'super_admin') return next();

        const resourceId = req.params[resourceIdParam];
        if (resourceId !== req.profile._id.toString()) {
            return res.status(403).json({
                error: 'Access denied — can only access own resources',
                code: 'OWNERSHIP_REQUIRED',
            });
        }
        next();
    };
};

module.exports = {
    authenticate,
    optionalAuthenticate,
    authenticateSession,
    requireRole,
    requireOrganization,
    requireOwnership,
};