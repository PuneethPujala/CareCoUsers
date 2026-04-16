const express = require('express');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize, authorizeResource } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { logEvent, autoLogAccess } = require('../services/auditService');

const router = express.Router();

// ─────────────────────────────────────────────
// IMPORTANT: static routes must come before /:id
// otherwise Express matches 'me', 'organization'
// etc. as the :id param.
// ─────────────────────────────────────────────

/**
 * GET /api/profile/me
 * Get the currently authenticated user's own profile
 */
router.get('/me',
    authenticate,
    autoLogAccess('profile', 'read'),
    async (req, res) => {
        try {
            const profile = await Profile.findById(req.profile._id)
                .populate('organizationId', 'name city subscriptionPlan settings');

            res.json(profile);
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ error: 'Failed to get profile', details: error.message });
        }
    }
);

/**
 * GET /api/profile/organization/:orgId
 * Get all profiles in an organisation — admin / care_manager only
 * NOTE: must be defined before /:id to avoid route conflict
 */
router.get('/organization/:orgId',
    authenticate,
    authorize('profile', 'read'),
    requireRole('super_admin', 'org_admin', 'care_manager'),
    autoLogAccess('profile', 'read'),
    async (req, res) => {
        try {
            const { orgId } = req.params;
            const { role: roleFilter, page = 1, limit = 20 } = req.query;

            if (req.profile.role !== 'super_admin') {
                if (!req.profile.organizationId.equals(orgId)) {
                    return res.status(403).json({ error: 'Cannot access profiles from a different organization' });
                }
            }

            const query = { organizationId: orgId };

            // Only allow valid staff roles — patients are in Patient collection
            if (roleFilter) {
                const validRoles = ['super_admin', 'org_admin', 'care_manager', 'caller'];
                if (!validRoles.includes(roleFilter)) {
                    return res.status(400).json({ error: `Invalid role filter. Valid roles: ${validRoles.join(', ')}` });
                }
                query.role = roleFilter;
            } else {
                // Default: exclude patient role since they live in Patient collection
                query.role = { $in: ['org_admin', 'care_manager', 'caller'] };
            }

            const [profiles, total] = await Promise.all([
                Profile.find(query)
                    .populate('organizationId', 'name city')
                    .sort({ createdAt: -1 })
                    .limit(parseInt(limit))
                    .skip((parseInt(page) - 1) * parseInt(limit)),
                Profile.countDocuments(query),
            ]);

            res.json({
                profiles,
                pagination: {
                    page:  parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });

        } catch (error) {
            console.error('Get organization profiles error:', error);
            res.status(500).json({ error: 'Failed to get organization profiles', details: error.message });
        }
    }
);

/**
 * GET /api/profile
 * List profiles with filtering and pagination
 */
router.get('/',
    authenticate,
    authorize('profile', 'read'),
    scopeFilter('profile'),
    autoLogAccess('profile', 'read'),
    async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                role: roleFilter,
                organizationId: orgFilter,
                search,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = req.query;

            const query = {
                ...req.scopeFilter,
                // Never return patient role from Profile — they're in Patient collection
                role: { $in: ['super_admin', 'org_admin', 'care_manager', 'caller'] },
            };

            if (roleFilter) query.role = roleFilter;
            if (orgFilter && req.profile.role === 'super_admin') query.organizationId = orgFilter;

            if (search) {
                query.$or = [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email:    { $regex: search, $options: 'i' } },
                    { phone:    { $regex: search, $options: 'i' } },
                ];
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const [profiles, total] = await Promise.all([
                Profile.find(query)
                    .populate('organizationId', 'name city')
                    .sort(sort)
                    .limit(parseInt(limit))
                    .skip((parseInt(page) - 1) * parseInt(limit)),
                Profile.countDocuments(query),
            ]);

            res.json({
                profiles,
                pagination: {
                    page:  parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });

        } catch (error) {
            console.error('Get profiles error:', error);
            res.status(500).json({ error: 'Failed to get profiles', details: error.message });
        }
    }
);

/**
 * GET /api/profile/:id
 * Get a specific staff profile by ID
 */
router.get('/:id',
    authenticate,
    authorize('profile', 'read'),
    autoLogAccess('profile', 'read'),
    async (req, res) => {
        try {
            const profile = await Profile.findById(req.params.id)
                .populate('organizationId', 'name city subscriptionPlan');

            if (!profile) {
                return res.status(404).json({ error: 'Profile not found' });
            }

            const { role } = req.profile;

            if (role === 'super_admin') {
                return res.json(profile);
            }

            if (['org_admin', 'care_manager', 'caller'].includes(role)) {
                if (
                    profile.organizationId &&
                    profile.organizationId._id?.equals(req.profile.organizationId)
                ) {
                    return res.json(profile);
                }
                return res.status(403).json({ error: 'Access denied to this profile' });
            }

            // Callers / other staff can see their own profile
            if (profile._id.equals(req.profile._id)) {
                return res.json(profile);
            }

            res.status(403).json({ error: 'Access denied' });

        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ error: 'Failed to get profile', details: error.message });
        }
    }
);

/**
 * POST /api/profile
 * Create a new staff profile — admin only
 * Note: patients are created via POST /api/patients, not here
 */
router.post('/',
    authenticate,
    authorize('profile', 'create'),
    autoLogAccess('profile', 'create'),
    async (req, res) => {
        try {
            const {
                supabaseUid,
                email,
                fullName,
                role,
                organizationId,
                phone,
                avatarUrl,
                metadata,
            } = req.body;

            if (!supabaseUid || !email || !fullName || !role) {
                return res.status(400).json({
                    error: 'Missing required fields: supabaseUid, email, fullName, role',
                });
            }

            // Block patient creation through this endpoint
            if (role === 'patient') {
                return res.status(400).json({
                    error: 'Patients must be created via POST /api/patients',
                });
            }

            // Only super_admin can create super_admin profiles
            if (role === 'super_admin' && req.profile.role !== 'super_admin') {
                return res.status(403).json({ error: 'Only super admins can create super admin profiles' });
            }

            // Staff roles require an org
            if (['org_admin', 'care_manager', 'caller'].includes(role) && !organizationId) {
                return res.status(400).json({ error: 'organizationId is required for this role' });
            }

            // Non-super_admin cannot create profiles in a different org
            if (organizationId && req.profile.role !== 'super_admin') {
                if (!req.profile.organizationId.equals(organizationId)) {
                    return res.status(403).json({ error: 'Cannot create profile in a different organization' });
                }
            }

            const [existingUid, existingEmail] = await Promise.all([
                Profile.findOne({ supabaseUid }),
                Profile.findOne({ email }),
            ]);
            if (existingUid)   return res.status(400).json({ error: 'Profile already exists for this user' });
            if (existingEmail) return res.status(400).json({ error: 'Email already in use' });

            const profile = new Profile({
                supabaseUid,
                email,
                fullName,
                role,
                organizationId: organizationId || null,
                phone:          phone     || null,
                avatarUrl:      avatarUrl || null,
                metadata:       metadata  || {},
                emailVerified:  true,
            });

            await profile.save();

            // Update org caller/manager counters
            if (organizationId) {
                const incField =
                    role === 'caller'       ? 'counts.callers'  :
                    role === 'care_manager' ? 'counts.managers' : null;

                if (incField) {
                    await Organization.findByIdAndUpdate(organizationId, {
                        $inc: { [incField]: 1 },
                    });
                }
            }

            await logEvent(
                req.profile.supabaseUid,
                'profile_created',
                'profile',
                profile._id,
                req,
                { createdProfileEmail: email, createdProfileRole: role, organizationId }
            );

            res.status(201).json({ message: 'Profile created successfully', profile });

        } catch (error) {
            console.error('Create profile error:', error);
            res.status(500).json({ error: 'Failed to create profile', details: error.message });
        }
    }
);

/**
 * PUT /api/profile/:id
 * Update a staff profile
 */
router.put('/:id',
    authenticate,
    authorizeResource('profile', 'update', (req) => req.params.id),
    autoLogAccess('profile', 'update'),
    async (req, res) => {
        try {
            const profile = await Profile.findById(req.params.id);
            if (!profile) {
                return res.status(404).json({ error: 'Profile not found' });
            }

            const { role } = req.profile;
            const {
                fullName, phone, avatarUrl, metadata,
                isActive, role: newRole, organizationId,
            } = req.body;

            const updateData = {};
            if (fullName  !== undefined) updateData.fullName  = fullName;
            if (phone     !== undefined) updateData.phone     = phone;
            if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
            if (metadata  !== undefined) updateData.metadata  = metadata;

            // Only super_admin can change role or org
            if (role === 'super_admin') {
                if (isActive      !== undefined) updateData.isActive      = isActive;
                if (newRole       !== undefined) updateData.role          = newRole;
                if (organizationId!== undefined) updateData.organizationId= organizationId;
            } else if (['org_admin', 'care_manager'].includes(role)) {
                if (isActive !== undefined) updateData.isActive = isActive;
            }

            const updatedProfile = await Profile.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: true }
            ).populate('organizationId', 'name city');

            await logEvent(
                req.profile.supabaseUid,
                'profile_updated',
                'profile',
                profile._id,
                req,
                { updatedFields: Object.keys(updateData), targetProfile: profile.email }
            );

            res.json({ message: 'Profile updated successfully', profile: updatedProfile });

        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({ error: 'Failed to update profile', details: error.message });
        }
    }
);

/**
 * DELETE /api/profile/:id
 * Soft-delete (deactivate) a staff profile — admin only
 */
router.delete('/:id',
    authenticate,
    authorize('profile', 'delete'),
    autoLogAccess('profile', 'delete'),
    async (req, res) => {
        try {
            const profile = await Profile.findById(req.params.id);
            if (!profile) {
                return res.status(404).json({ error: 'Profile not found' });
            }

            if (profile._id.equals(req.profile._id)) {
                return res.status(400).json({ error: 'Cannot deactivate your own profile' });
            }

            if (profile.role === 'super_admin' && req.profile.role !== 'super_admin') {
                return res.status(403).json({ error: 'Cannot deactivate super admin profiles' });
            }

            profile.isActive = false;
            await profile.save();

            // Decrement org counters for staff roles
            if (profile.organizationId) {
                const decField =
                    profile.role === 'caller'       ? 'counts.callers'  :
                    profile.role === 'care_manager' ? 'counts.managers' : null;

                if (decField) {
                    await Organization.findByIdAndUpdate(profile.organizationId, {
                        $inc: { [decField]: -1 },
                    });
                }
            }

            await logEvent(
                req.profile.supabaseUid,
                'profile_deleted',
                'profile',
                profile._id,
                req,
                { deletedProfileEmail: profile.email, deletedProfileRole: profile.role }
            );

            res.json({
                message: 'Profile deactivated successfully',
                profile: {
                    id:       profile._id,
                    email:    profile.email,
                    fullName: profile.fullName,
                    role:     profile.role,
                    isActive: profile.isActive,
                },
            });

        } catch (error) {
            console.error('Delete profile error:', error);
            res.status(500).json({ error: 'Failed to delete profile', details: error.message });
        }
    }
);

module.exports = router;