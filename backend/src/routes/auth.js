const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const Caller = require('../models/Caller');
const Organization = require('../models/Organization');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { checkPasswordChange } = require('../middleware/checkPasswordChange');
const { logEvent, logSecurityEvent } = require('../services/auditService');
const { sendTempPasswordEmail, sendPasswordChangedEmail, sendOTPEmail, sendPasswordResetEmail } = require('../services/emailService');
const { createOTP, verifyOTP } = require('../services/otpService');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTempPassword() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    let pwd = '';
    for (let i = 0; i < 4; i++) pwd += upper[Math.floor(Math.random() * upper.length)];
    for (let i = 0; i < 4; i++) pwd += digits[Math.floor(Math.random() * digits.length)];
    return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

function validatePasswordComplexity(password) {
    const errors = [];
    if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
    return errors;
}

const ROLE_LABELS = {
    super_admin: 'Super Admin',
    org_admin: 'Org Admin',
    care_manager: 'Care Manager',
    caller: 'Caller',
    patient: 'Patient',
};

// Who can create whom
// patient self-registers via /register — not via create-user
const CREATION_HIERARCHY = {
    super_admin: ['org_admin', 'care_manager', 'caller'],
    org_admin: ['care_manager', 'caller'],
    care_manager: ['caller'],
};

// Initialize Supabase admin client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Patient self-registration via the users app.
 * Staff accounts are created by admins via POST /api/auth/create-user.
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, city, organizationId, phone, supabaseUid } = req.body;

        // Validate required fields
        if (!email || !fullName) {
            return res.status(400).json({ error: 'Missing required fields: email, fullName' });
        }
        // city is optional at registration — will be collected at step 2
        if (!supabaseUid && !password) {
            return res.status(400).json({ error: 'Password is required when creating a new user' });
        }

        // Check for existing account BEFORE hitting Supabase — gives a clear error
        const existingPatient = await Patient.findOne({ email: email.toLowerCase().trim(), is_active: true });
        if (existingPatient) {
            return res.status(400).json({
                error: `An account with the email "${email}" already exists. Please log in instead.`,
                code: 'EMAIL_ALREADY_EXISTS',
            });
        }

        // Resolve org from city if provided and organizationId not provided
        let targetOrgId = organizationId;
        if (city && !targetOrgId) {
            const org = await Organization.findOne({ city, isActive: true });
            if (!org) {
                return res.status(400).json({ error: `No active organisation found for city: ${city}` });
            }
            targetOrgId = org._id;
        }

        // If no org resolved yet, use a default org or require it later
        if (!targetOrgId) {
            // Find first active org as placeholder — city will be updated at step 2
            const defaultOrg = await Organization.findOne({ isActive: true });
            if (!defaultOrg) {
                return res.status(400).json({ error: 'No active organization available for registration' });
            }
            targetOrgId = defaultOrg._id;
        }

        // Verify org exists, is active, and has patient capacity
        const org = await Organization.findById(targetOrgId);
        if (!org || !org.isActive) {
            return res.status(400).json({ error: 'Invalid or inactive organization' });
        }
        if (!org.canAdd('patient')) {
            return res.status(400).json({ error: 'This organisation has reached its patient capacity' });
        }

        let finalUid = supabaseUid;
        let authDataPayload = null;

        if (!finalUid) {
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email,
                password,
                user_metadata: { full_name: fullName, role: 'patient' },
                email_confirm: true,
            });

            if (authError) {
                await logEvent('anonymous', 'registration_failed', 'patient', null, req, {
                    email, reason: authError.message,
                });
                return res.status(400).json({
                    error: 'Failed to create user in Supabase',
                    details: authError.message,
                });
            }
            finalUid = authData.user.id;
            authDataPayload = authData.user;
        }

        // Create Patient document only — no Profile for patients
        let patient;
        try {
            patient = new Patient({
                supabase_uid: finalUid,
                email,
                name: fullName,
                city: city || null,
                organization_id: targetOrgId,
                phone: phone || null,
                role: 'patient',
                emailVerified: true,
            });
            await patient.save();
        } catch (mongoError) {
            // Cleanup: delete Supabase user to prevent orphaned auth account
            if (!supabaseUid) {
                try {
                    await supabase.auth.admin.deleteUser(finalUid);
                } catch (cleanupError) {
                    console.error('Failed to cleanup Supabase user after MongoDB error:', cleanupError.message);
                }
            }
            throw mongoError;
        }


        // Increment org patient counter
        await Organization.findByIdAndUpdate(targetOrgId, {
            $inc: { 'counts.patients': 1 },
        });

        await logEvent(finalUid, 'patient_created', 'patient', patient._id, req, {
            email, role: 'patient', organizationId: targetOrgId,
        });

        let userResponse = authDataPayload
            ? (({ password: _, ...rest }) => rest)(authDataPayload)
            : { id: finalUid, email };

        res.status(201).json({
            message: 'Registration successful',
            user: userResponse,
            profile: {
                id: patient._id,
                email: patient.email,
                fullName: patient.name,
                role: patient.role,
                organizationId: patient.organization_id,
                isActive: patient.is_active,
            },
        });

    } catch (error) {
        console.error('Registration error:', error);
        await logEvent('anonymous', 'registration_failed', 'patient', null, req, {
            error: error.message,
        });

        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ error: `${field} already exists` });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Validation Error', details: error.message });
        }

        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

/**
 * POST /api/auth/login
 * Authenticate user — Supabase handles the password check.
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        if (!role) {
            return res.status(400).json({ error: 'Please select a role' });
        }

        let account = null;
        let isPatient = role === 'patient';

        if (isPatient) {
            // Patient login — query patients collection
            account = await Patient.findOne({
                email: email.toLowerCase().trim(),
                is_active: true,
            });

            if (!account) {
                return res.status(403).json({
                    error: 'No account found with this email. Please sign up first.',
                    code: 'PROFILE_NOT_FOUND',
                });
            }
        } else {
            // Staff login — query profiles collection
            account = await Profile.findOne({
                email: email.toLowerCase().trim(),
                role,
                isActive: true,
            }).populate('organizationId', 'name city');

            if (!account) {
                const existingProfile = await Profile.findOne({
                    email: email.toLowerCase().trim(),
                    isActive: true,
                });

                if (existingProfile) {
                    return res.status(403).json({
                        error: `No account found for role "${ROLE_LABELS[role] || role}". Please select the correct role.`,
                        code: 'ROLE_MISMATCH',
                        hint: 'Please select the role that was assigned to your account.',
                    });
                }

                return res.status(403).json({
                    error: 'No account found with this email. Please contact your administrator.',
                    code: 'PROFILE_NOT_FOUND',
                });
            }
        }

        // Authenticate with Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email, password,
        });

        if (authError) {
            await logSecurityEvent('anonymous', 'login_failed', 'medium',
                `Failed login attempt for ${email}: ${authError.message}`, req);
            return res.status(401).json({
                error: 'Invalid credentials. Please check your password.',
                code: 'INVALID_CREDENTIALS',
            });
        }

        if (account.isLocked) {
            await logSecurityEvent(authData.user.id, 'login_failed', 'high', 'Account is locked', req);
            return res.status(423).json({
                error: 'Account is temporarily locked',
                code: 'ACCOUNT_LOCKED',
                lockedUntil: account.accountLockedUntil,
            });
        }

        if (account.failedLoginAttempts > 0) {
            await account.resetFailedLogin();
        }

        const accountId = account._id;
        const accountUidField = isPatient ? account.supabase_uid : account.supabaseUid;
        await logEvent(authData.user.id, 'login', isPatient ? 'patient' : 'profile', accountId, req, {
            role: isPatient ? 'patient' : account.role,
            organizationId: isPatient ? account.organization_id : account.organizationId?._id,
        });

        // Build response
        let subscriptionStatus = null;
        if (isPatient) {
            subscriptionStatus = account.subscription?.status || 'pending_payment';
        }

        res.json({
            message: 'Login successful',
            session: {
                access_token: authData.session.access_token,
                refresh_token: authData.session.refresh_token,
                expires_in: authData.session.expires_in,
                user: {
                    id: authData.user.id,
                    email: authData.user.email,
                    email_verified: authData.user.email_confirmed_at !== null,
                },
            },
            profile: {
                id: accountId,
                email: isPatient ? account.email : account.email,
                fullName: isPatient ? account.name : account.fullName,
                role: isPatient ? 'patient' : account.role,
                organizationId: isPatient ? account.organization_id : account.organizationId,
                isActive: isPatient ? account.is_active : account.isActive,
                emailVerified: account.emailVerified,
                mustChangePassword: account.mustChangePassword || false,
                subscription_status: subscriptionStatus,
            },
        });

    } catch (error) {
        console.error('Login error:', error?.message);
        res.status(500).json({ error: 'Login failed', details: error.message });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req, res) => {
    try {
        const { error } = await supabase.auth.admin.signOut(req.user.id, 'global');
        if (error) console.error('Supabase logout error:', error);

        await logEvent(req.profile.supabaseUid, 'logout', 'profile', req.profile._id, req);
        res.json({ message: 'Logout successful' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed', details: error.message });
    }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const { data: authData, error: authError } = await supabase.auth.refreshSession({ refresh_token });
        if (authError) {
            return res.status(401).json({
                error: 'Invalid or expired refresh token',
                code: 'INVALID_REFRESH_TOKEN',
            });
        }

        // Try Profile first, then Patient
        let profile = await Profile.findOne({
            supabaseUid: authData.user.id,
            isActive: true,
        }).populate('organizationId', 'name city');

        let isPatient = false;
        if (!profile) {
            profile = await Patient.findOne({
                supabase_uid: authData.user.id,
                is_active: true,
            });
            isPatient = !!profile;
        }

        if (!profile) {
            return res.status(403).json({
                error: 'Profile not found or account deactivated',
                code: 'PROFILE_NOT_FOUND',
            });
        }

        res.json({
            message: 'Token refreshed successfully',
            session: {
                access_token: authData.session.access_token,
                refresh_token: authData.session.refresh_token,
                expires_in: authData.session.expires_in,
            },
            profile: {
                id: profile._id,
                email: profile.email,
                fullName: isPatient ? profile.name : profile.fullName,
                role: isPatient ? 'patient' : profile.role,
                organizationId: isPatient ? profile.organization_id : profile.organizationId,
                isActive: isPatient ? profile.is_active : profile.isActive,
            },
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed', details: error.message });
    }
});

/**
 * POST /api/auth/reset-password
 * Sends a custom OTP to the user's email for password reset (replaces Supabase default)
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Always return same message — don't reveal whether account exists
        const genericResponse = {
            message: 'If an account with this email exists, a password reset code has been sent',
        };

        // Check both Profile and Patient collections
        const profile = await Profile.findOne({ email: email.toLowerCase().trim(), isActive: true });
        const patient = await Patient.findOne({ email: email.toLowerCase().trim(), is_active: true });

        if (!profile && !patient) return res.json(genericResponse);

        // Generate and send OTP
        const otp = await createOTP(`reset:${email.toLowerCase().trim()}`);
        // Fire-and-forget — don't block the response waiting for email delivery
        sendPasswordResetEmail(email, otp).catch(err => console.error('Reset email failed:', err.message));

        const uid = profile ? profile.supabaseUid : patient.supabase_uid;
        const docId = profile ? profile._id : patient._id;
        await logEvent(uid, 'password_reset_requested', profile ? 'profile' : 'patient', docId, req);

        res.json(genericResponse);
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Password reset failed', details: error.message });
    }
});

/**
 * POST /api/auth/reset-password/verify
 * Verify the reset OTP and set a new password
 */
router.post('/reset-password/verify', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Email, OTP, and new password are required' });
        }

        const complexityErrors = validatePasswordComplexity(newPassword);
        if (complexityErrors.length > 0) {
            return res.status(400).json({ error: 'Password does not meet requirements', details: complexityErrors });
        }

        // Verify OTP
        const result = await verifyOTP(`reset:${email.toLowerCase().trim()}`, otp);
        if (!result.valid) {
            return res.status(400).json({ error: result.reason });
        }

        // Find user in Profile or Patient
        const profile = await Profile.findOne({ email: email.toLowerCase().trim(), isActive: true });
        const patient = await Patient.findOne({ email: email.toLowerCase().trim(), is_active: true });

        if (!profile && !patient) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const uid = profile ? profile.supabaseUid : patient.supabase_uid;

        // Update password in Supabase
        const { error: updateError } = await supabase.auth.admin.updateUserById(uid, { password: newPassword });
        if (updateError) {
            return res.status(500).json({ error: 'Failed to update password', details: updateError.message });
        }

        // Send confirmation email
        const fullName = profile ? profile.fullName : patient.name;
        sendPasswordChangedEmail(email, fullName);

        await logEvent(uid, 'password_reset_completed', profile ? 'profile' : 'patient', profile ? profile._id : patient._id, req);

        res.json({ message: 'Password has been reset successfully. Please log in with your new password.' });
    } catch (error) {
        console.error('Reset password verify error:', error);
        res.status(500).json({ error: 'Password reset failed', details: error.message });
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user's profile
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const isPatient = req.profile.role === 'patient';

        if (isPatient) {
            // Patient is already attached by middleware — return it directly
            const patient = req.profile;
            res.json({
                user: {
                    id: req.user.id,
                    email: req.user.email,
                    email_verified: req.user.email_confirmed_at !== null,
                    created_at: req.user.created_at,
                },
                profile: {
                    id: patient._id,
                    email: patient.email,
                    fullName: patient.name,
                    role: 'patient',
                    organizationId: patient.organization_id,
                    phone: patient.phone,
                    avatarUrl: patient.avatar_url,
                    isActive: patient.is_active,
                    emailVerified: patient.emailVerified,
                    lastLoginAt: patient.lastLoginAt,
                    subscription_status: patient.subscription?.status || 'pending_payment',
                },
            });
        } else {
            // Staff path — unchanged
            const profile = await Profile.findById(req.profile._id)
                .populate('organizationId', 'name city subscriptionPlan');

            let subscriptionStatus = null;
            if (profile.role === 'caller') {
                let caller = await Caller.findOne({ supabase_uid: req.user.id });

                if (!caller && req.user.email) {
                    caller = await Caller.findOne({ email: req.user.email.toLowerCase().trim() });
                }

                if (caller && caller.supabase_uid !== req.user.id) {
                    caller.supabase_uid = req.user.id;
                    await caller.save();
                    console.log(`[Auto-Heal] Synced Caller supabase_uid for: ${caller.email}`);
                }
            }

            res.json({
                user: {
                    id: req.user.id,
                    email: req.user.email,
                    email_verified: req.user.email_confirmed_at !== null,
                    created_at: req.user.created_at,
                },
                profile: {
                    id: profile._id,
                    email: profile.email,
                    fullName: profile.fullName,
                    role: profile.role,
                    organizationId: profile.organizationId,
                    phone: profile.phone,
                    avatarUrl: profile.avatarUrl,
                    isActive: profile.isActive,
                    emailVerified: profile.emailVerified,
                    lastLoginAt: profile.lastLoginAt,
                    twoFactorEnabled: profile.twoFactorEnabled,
                    metadata: profile.metadata,
                    mustChangePassword: profile.mustChangePassword || false,
                    subscription_status: subscriptionStatus,
                },
            });
        }
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile', details: error.message });
    }
});

/**
 * POST /api/auth/create-user
 * Admin creates a staff account with a temporary password.
 * Patients self-register via /register — not via this route.
 */
router.post('/create-user', authenticate, checkPasswordChange, async (req, res) => {
    try {
        const { email, fullName, role, organizationId } = req.body;
        const callerRole = req.profile.role;

        if (!email || !fullName || !role) {
            return res.status(400).json({ error: 'Missing required fields: email, fullName, role' });
        }

        // Validate creation hierarchy
        const allowedTargetRoles = CREATION_HIERARCHY[callerRole];
        if (!allowedTargetRoles || !allowedTargetRoles.includes(role)) {
            return res.status(403).json({
                error: `Role '${callerRole}' cannot create role '${role}'`,
                code: 'ROLE_HIERARCHY_VIOLATION',
            });
        }

        const targetOrgId = organizationId || req.profile.organizationId || null;

        if (['care_manager', 'caller'].includes(role) && !targetOrgId) {
            return res.status(400).json({ error: 'organizationId is required for this role' });
        }

        // Verify org and check capacity
        if (targetOrgId) {
            const org = await Organization.findById(targetOrgId);
            if (!org || !org.isActive) {
                return res.status(400).json({ error: 'Invalid or inactive organization' });
            }
            // Capacity check using canAdd()
            if (!org.canAdd(role)) {
                return res.status(400).json({
                    error: `Organisation has reached its ${role} capacity`,
                    code: 'CAPACITY_LIMIT_REACHED',
                });
            }
        }

        const existingProfile = await Profile.findOne({ email: email.toLowerCase().trim() });
        if (existingProfile) {
            return res.status(400).json({ error: `A user with the email "${email}" already exists.` });
        }

        const tempPassword = generateTempPassword();

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password: tempPassword,
            user_metadata: { full_name: fullName, role },
            email_confirm: true,
        });

        if (authError) {
            await logEvent(req.profile.supabaseUid, 'create_user_failed', 'profile', null, req, {
                targetEmail: email, targetRole: role, reason: authError.message,
            });

            const msg = (authError.message || '').toLowerCase();
            let userMessage = 'Failed to create user account';
            if (msg.includes('already') || msg.includes('duplicate') || msg.includes('exists')) {
                userMessage = 'A user with this email address already exists.';
            } else if (msg.includes('email')) {
                userMessage = 'The email address provided is invalid.';
            } else if (msg.includes('password')) {
                userMessage = 'The password does not meet the minimum requirements.';
            }

            return res.status(400).json({ error: userMessage });
        }

        const hashedTemp = await bcrypt.hash(tempPassword, 12);

        const profile = new Profile({
            supabaseUid: authData.user.id,
            email,
            fullName,
            role,
            organizationId: targetOrgId || null,
            mustChangePassword: true,
            passwordHistory: [hashedTemp],
            createdBy: req.profile._id,
            emailVerified: true,
        });
        await profile.save();

        // Increment org counters for staff roles
        if (targetOrgId) {
            const incField =
                role === 'caller' ? 'counts.callers' :
                    role === 'care_manager' ? 'counts.managers' : null;

            if (incField) {
                await Organization.findByIdAndUpdate(targetOrgId, {
                    $inc: { [incField]: 1 },
                });
            }
        }

        // Send temp password email (non-blocking — don't await)
        sendTempPasswordEmail(email, fullName, tempPassword, ROLE_LABELS[role] || role);

        await logEvent(req.profile.supabaseUid, 'create_user', 'profile', profile._id, req, {
            targetEmail: email, targetRole: role, createdByRole: callerRole,
        });

        res.status(201).json({
            message: `${ROLE_LABELS[role] || role} account created successfully. Temporary password sent to ${email}.`,
            profile: {
                id: profile._id,
                email: profile.email,
                fullName: profile.fullName,
                role: profile.role,
                organizationId: profile.organizationId,
            },
        });

    } catch (error) {
        console.warn('Create user error:', error?.message);
        if (error.code === 11000 || error.message?.includes('E11000')) {
            return res.status(400).json({ error: 'A user with this email address already exists.' });
        }
        res.status(500).json({ error: 'Failed to create user. Please try again.' });
    }
});

/**
 * POST /api/auth/change-password
 * Works for both forced temp-password change and voluntary change.
 */
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'currentPassword and newPassword are required' });
        }

        const complexityErrors = validatePasswordComplexity(newPassword);
        if (complexityErrors.length > 0) {
            return res.status(400).json({ error: 'Password does not meet requirements', details: complexityErrors });
        }

        // Verify current password via Supabase sign-in
        const profileEmail = req.profile.role === 'patient' ? req.profile.email : req.profile.email;
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: profileEmail,
            password: currentPassword,
        });
        if (signInError) {
            const uid = req.profile.role === 'patient' ? req.profile.supabase_uid : req.profile.supabaseUid;
            await logSecurityEvent(uid, 'password_change_failed', 'medium',
                'Incorrect current password during password change', req);
            return res.status(401).json({ error: 'Current password is incorrect', code: 'INVALID_CURRENT_PASSWORD' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'New password must be different from current password' });
        }

        // Check password history (staff only — patients don't store password history)
        if (req.profile.role !== 'patient') {
            const profile = await Profile.findById(req.profile._id).select('+passwordHistory');
            if (profile.passwordHistory?.length > 0) {
                for (const oldHash of profile.passwordHistory) {
                    const matches = await bcrypt.compare(newPassword, oldHash);
                    if (matches) {
                        return res.status(400).json({
                            error: 'Cannot reuse any of your last 3 passwords',
                            code: 'PASSWORD_REUSE',
                        });
                    }
                }
            }
        }

        // Update Supabase password
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            req.user.id, { password: newPassword }
        );
        if (updateError) {
            return res.status(500).json({ error: 'Failed to update password', details: updateError.message });
        }

        // Update MongoDB password history (staff only)
        if (req.profile.role !== 'patient') {
            const newHash = await bcrypt.hash(newPassword, 12);
            const profile = await Profile.findById(req.profile._id).select('+passwordHistory');
            const history = [...(profile.passwordHistory || []), newHash].slice(-3);

            await Profile.findByIdAndUpdate(req.profile._id, {
                passwordHistory: history,
                mustChangePassword: false,
                passwordChangedAt: new Date(),
            });
        }

        // Invalidate all Supabase sessions
        await supabase.auth.admin.signOut(req.user.id, 'global');

        // Send confirmation email (non-blocking)
        const fullName = req.profile.role === 'patient' ? req.profile.name : req.profile.fullName;
        sendPasswordChangedEmail(req.profile.email, fullName);

        const uid = req.profile.role === 'patient' ? req.profile.supabase_uid : req.profile.supabaseUid;
        await logEvent(uid, 'password_changed', req.profile.role === 'patient' ? 'patient' : 'profile', req.profile._id, req, {
            forced: req.profile.mustChangePassword,
        });

        res.json({ message: 'Password changed successfully. Please log in again.' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password', details: error.message });
    }
});

/**
 * PUT /api/auth/patient-city
 * Update patient city after registration (Step 2 of onboarding)
 */
router.put('/patient-city', authenticate, async (req, res) => {
    try {
        const { city } = req.body;
        if (!city) {
            return res.status(400).json({ error: 'City is required' });
        }

        // Find and update the patient record
        const patient = await Patient.findOneAndUpdate(
            { supabase_uid: req.user.id },
            { city },
            { new: true }
        );

        if (!patient) {
            return res.status(404).json({ error: 'Patient record not found' });
        }

        // Update organization if city changed
        const org = await Organization.findOne({ city, isActive: true });
        if (org && org._id.toString() !== patient.organization_id?.toString()) {
            patient.organization_id = org._id;
            await patient.save();
        }

        await logEvent(req.user.id, 'patient_city_updated', 'patient', patient._id, req, { city });

        res.json({
            message: 'City updated successfully',
            city: patient.city,
            organizationId: patient.organization_id,
        });

    } catch (error) {
        console.error('Update patient city error:', error);
        res.status(500).json({ error: 'Failed to update city', details: error.message });
    }
});

/**
 * PUT /api/auth/me
 * Update current user's own profile
 */
router.put('/me', authenticate, checkPasswordChange, authorize('profile', 'update'), async (req, res) => {
    try {
        const { fullName, phone, avatarUrl } = req.body;
        const updateData = {};

        if (fullName !== undefined) updateData.fullName = fullName;
        if (phone !== undefined) updateData.phone = phone;
        if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

        const profile = await Profile.findByIdAndUpdate(
            req.profile._id,
            updateData,
            { new: true, runValidators: true }
        ).populate('organizationId', 'name city');

        await logEvent(req.profile.supabaseUid, 'profile_updated', 'profile', profile._id, req, {
            updatedFields: Object.keys(updateData),
        });

        res.json({
            message: 'Profile updated successfully',
            profile: {
                id: profile._id,
                email: profile.email,
                fullName: profile.fullName,
                role: profile.role,
                organizationId: profile.organizationId,
                phone: profile.phone,
                avatarUrl: profile.avatarUrl,
                isActive: profile.isActive,
                emailVerified: profile.emailVerified,
            },
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile', details: error.message });
    }
});

// ─── OTP Endpoints ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/send-otp
 * Send a 6-digit OTP to the user's email or phone.
 * For email: generates a real OTP and sends via email.
 * For phone: uses placeholder OTP (123456) — no SMS service yet.
 */
router.post('/send-otp', async (req, res) => {
    try {
        const { identifier, type } = req.body; // type: 'email' or 'phone'
        if (!identifier || !type) {
            return res.status(400).json({ error: 'identifier and type (email/phone) are required' });
        }

        if (type === 'email') {
            // Generate real OTP and send via email
            const otp = await createOTP(identifier.toLowerCase().trim());
            // Fire-and-forget — don't block the response waiting for email delivery
            sendOTPEmail(identifier, otp).catch(err => console.error('OTP email failed:', err.message));
            res.json({ message: 'Verification code sent to your email.' });
        } else if (type === 'phone') {
            // Placeholder: store fixed OTP 123456
            const redis = require('../lib/redis');
            const key = `otp:${identifier.trim()}`;
            await redis.del(key);
            await redis.set(key, '123456', 'EX', 600);
            console.log(`📱 Phone OTP set to 123456 for ${identifier} (dev mode)`);
            res.json({ message: 'Verification code sent to your phone.' });
        } else {
            return res.status(400).json({ error: 'type must be "email" or "phone"' });
        }
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ error: 'Failed to send verification code', details: error.message });
    }
});

/**
 * POST /api/auth/verify-otp
 * Verify the 6-digit OTP for email or phone.
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { identifier, otp, type } = req.body;
        if (!identifier || !otp) {
            return res.status(400).json({ error: 'identifier and otp are required' });
        }

        // TEMP: Allow 123456 for all verifications in dev/test
        if (otp === '123456') {
            console.log(`🔓 [DEV] Bypassing OTP check for ${identifier} via temporary 123456 code`);
            return res.json({ message: 'Verification successful', verified: true });
        }

        const key = type === 'phone' ? identifier.trim() : identifier.toLowerCase().trim();
        const result = await verifyOTP(key, otp);

        if (!result.valid) {
            return res.status(400).json({ error: result.reason });
        }

        res.json({ message: 'Verification successful', verified: true });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'Verification failed', details: error.message });
    }
});

/**
 * POST /api/auth/set-password
 * Allows a Google-authenticated user to set a password for email/password login.
 */
router.post('/set-password', authenticate, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword) {
            return res.status(400).json({ error: 'newPassword is required' });
        }

        const complexityErrors = validatePasswordComplexity(newPassword);
        if (complexityErrors.length > 0) {
            return res.status(400).json({ error: 'Password does not meet requirements', details: complexityErrors });
        }

        // Update password in Supabase
        const { error: updateError } = await supabase.auth.admin.updateUserById(
            req.user.id, { password: newPassword }
        );
        if (updateError) {
            return res.status(500).json({ error: 'Failed to set password', details: updateError.message });
        }

        const fullName = req.profile.role === 'patient' ? req.profile.name : req.profile.fullName;
        sendPasswordChangedEmail(req.profile.email, fullName);

        const uid = req.profile.role === 'patient' ? req.profile.supabase_uid : req.profile.supabaseUid;
        await logEvent(uid, 'password_set', req.profile.role === 'patient' ? 'patient' : 'profile', req.profile._id, req);

        res.json({ message: 'Password set successfully. You can now log in with email and password.' });
    } catch (error) {
        console.error('Set password error:', error);
        res.status(500).json({ error: 'Failed to set password', details: error.message });
    }
});

module.exports = router;