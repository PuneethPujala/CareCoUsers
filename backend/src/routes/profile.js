const express = require('express');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const { authenticate, requireRole, requireOwnership } = require('../middleware/authenticate');
const { authorize, authorizeResource } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { logEvent, autoLogAccess } = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/profile/me
 * Get current user's profile
 */
router.get('/me', authenticate, autoLogAccess('profile', 'read'), async (req, res) => {
  try {
    const profile = await Profile.findById(req.profile._id)
      .populate('organizationId', 'name type subscriptionPlan settings');

    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get profile', 
      details: error.message 
    });
  }
});

/**
 * GET /api/profile/:id
 * Get specific profile (with RBAC)
 */
router.get('/:id', 
  authenticate, 
  authorize('profile', 'read'),
  autoLogAccess('profile', 'read'),
  async (req, res) => {
    try {
      const profile = await Profile.findById(req.params.id)
        .populate('organizationId', 'name type subscriptionPlan');

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      // Apply additional access control based on role
      const { role } = req.profile;
      
      // Super admin can see all profiles
      if (role === 'super_admin') {
        return res.json(profile);
      }

      // Org admin and care manager can see profiles in their organization
      if (['org_admin', 'care_manager'].includes(role)) {
        if (profile.organizationId && 
            profile.organizationId.equals(req.profile.organizationId)) {
          return res.json(profile);
        }
        return res.status(403).json({ error: 'Access denied to this profile' });
      }

      // Caretakers can only see their own profile and assigned patients
      if (role === 'caretaker') {
        if (profile._id.equals(req.profile._id)) {
          return res.json(profile);
        }
        // Check if this patient is assigned to this caretaker
        const CaretakerPatient = require('../models/CaretakerPatient');
        const assignment = await CaretakerPatient.findOne({
          caretakerId: req.profile._id,
          patientId: profile._id,
          status: 'active'
        });
        if (assignment) {
          return res.json(profile);
        }
        return res.status(403).json({ error: 'Access denied to this profile' });
      }

      // Patient mentors can only see their own profile and authorized patients
      if (role === 'patient_mentor') {
        if (profile._id.equals(req.profile._id)) {
          return res.json(profile);
        }
        // Check if this patient is authorized for this mentor
        const MentorAuthorization = require('../models/MentorAuthorization');
        const authorization = await MentorAuthorization.findOne({
          mentorId: req.profile._id,
          patientId: profile._id,
          status: 'active'
        });
        if (authorization) {
          return res.json(profile);
        }
        return res.status(403).json({ error: 'Access denied to this profile' });
      }

      // Patients can only see their own profile
      if (role === 'patient') {
        if (profile._id.equals(req.profile._id)) {
          return res.json(profile);
        }
        return res.status(403).json({ error: 'Access denied to this profile' });
      }

      res.status(403).json({ error: 'Access denied' });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ 
        error: 'Failed to get profile', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/profile
 * Get profiles with filtering and pagination (with RBAC)
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
        sortOrder = 'desc'
      } = req.query;

      // Build query
      let query = { ...req.scopeFilter };

      // Apply role filter
      if (roleFilter) {
        query.role = roleFilter;
      }

      // Apply organization filter (only for super admins)
      if (orgFilter && req.profile.role === 'super_admin') {
        query.organizationId = orgFilter;
      }

      // Apply search filter
      if (search) {
        query.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const profiles = await Profile.find(query)
        .populate('organizationId', 'name type')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Profile.countDocuments(query);

      res.json({
        profiles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get profiles error:', error);
      res.status(500).json({ 
        error: 'Failed to get profiles', 
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/profile
 * Create a new profile (admin only)
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
        metadata
      } = req.body;

      // Validate required fields
      if (!supabaseUid || !email || !fullName || !role) {
        return res.status(400).json({ 
          error: 'Missing required fields: supabaseUid, email, fullName, role' 
        });
      }

      // Check if profile already exists
      const existingProfile = await Profile.findOne({ supabaseUid });
      if (existingProfile) {
        return res.status(400).json({ error: 'Profile already exists for this user' });
      }

      // Check if email already exists
      const existingEmail = await Profile.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Validate organization access
      if (organizationId && req.profile.role !== 'super_admin') {
        if (!req.profile.organizationId.equals(organizationId)) {
          return res.status(403).json({ 
            error: 'Cannot create profile in different organization' 
          });
        }
      }

      // Validate role permissions
      if (role === 'super_admin' && req.profile.role !== 'super_admin') {
        return res.status(403).json({ 
          error: 'Only super admins can create super admin profiles' 
        });
      }

      if (['org_admin', 'care_manager'].includes(role) && !organizationId) {
        return res.status(400).json({ 
          error: 'Organization ID is required for admin and care manager roles' 
        });
      }

      // Create profile
      const profile = new Profile({
        supabaseUid,
        email,
        fullName,
        role,
        organizationId: organizationId || null,
        phone: phone || null,
        avatarUrl: avatarUrl || null,
        metadata: metadata || {},
        emailVerified: true // Assume verified if created by admin
      });

      await profile.save();

      // Update organization counts if applicable
      if (organizationId) {
        await Organization.findByIdAndUpdate(organizationId, {
          $inc: {
            ...(role === 'patient' && { currentPatientCount: 1 }),
            ...(role === 'caretaker' && { currentCaretakerCount: 1 })
          }
        });
      }

      // Log profile creation
      await logEvent(req.profile.supabaseUid, 'profile_created', 'profile', profile._id, req, {
        createdProfileEmail: email,
        createdProfileRole: role,
        organizationId
      });

      res.status(201).json({
        message: 'Profile created successfully',
        profile
      });

    } catch (error) {
      console.error('Create profile error:', error);
      res.status(500).json({ 
        error: 'Failed to create profile', 
        details: error.message 
      });
    }
  }
);

/**
 * PUT /api/profile/:id
 * Update profile (with RBAC)
 */
router.put('/:id', 
  authenticate, 
  authorizeResource('profile', 'update', (req) => req.params.id),
  autoLogAccess('profile', 'update'),
  async (req, res) => {
    try {
      const {
        fullName,
        phone,
        avatarUrl,
        isActive,
        role,
        organizationId,
        metadata
      } = req.body;

      const profileId = req.params.id;
      const profile = await Profile.findById(profileId);

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      // Build update object
      const updateData = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (phone !== undefined) updateData.phone = phone;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (metadata !== undefined) updateData.metadata = metadata;

      // Only admins can change these fields
      if (['super_admin', 'org_admin', 'care_manager'].includes(req.profile.role)) {
        if (isActive !== undefined) updateData.isActive = isActive;
        if (role !== undefined && req.profile.role === 'super_admin') {
          updateData.role = role;
        }
        if (organizationId !== undefined && req.profile.role === 'super_admin') {
          updateData.organizationId = organizationId;
        }
      }

      // Update profile
      const updatedProfile = await Profile.findByIdAndUpdate(
        profileId,
        updateData,
        { new: true, runValidators: true }
      ).populate('organizationId', 'name type');

      // Log profile update
      await logEvent(req.profile.supabaseUid, 'profile_updated', 'profile', profile._id, req, {
        updatedFields: Object.keys(updateData),
        targetProfile: profile.email
      });

      res.json({
        message: 'Profile updated successfully',
        profile: updatedProfile
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ 
        error: 'Failed to update profile', 
        details: error.message 
      });
    }
  }
);

/**
 * DELETE /api/profile/:id
 * Delete/deactivate profile (admin only)
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

      // Cannot delete self
      if (profile._id.equals(req.profile._id)) {
        return res.status(400).json({ error: 'Cannot delete your own profile' });
      }

      // Cannot delete super admins (only other super admins can)
      if (profile.role === 'super_admin' && req.profile.role !== 'super_admin') {
        return res.status(403).json({ error: 'Cannot delete super admin profiles' });
      }

      // Soft delete by deactivating
      profile.isActive = false;
      await profile.save();

      // Update organization counts
      if (profile.organizationId) {
        await Organization.findByIdAndUpdate(profile.organizationId, {
          $inc: {
            ...(profile.role === 'patient' && { currentPatientCount: -1 }),
            ...(profile.role === 'caretaker' && { currentCaretakerCount: -1 })
          }
        });
      }

      // Log profile deletion
      await logEvent(req.profile.supabaseUid, 'profile_deleted', 'profile', profile._id, req, {
        deletedProfileEmail: profile.email,
        deletedProfileRole: profile.role
      });

      res.json({
        message: 'Profile deactivated successfully',
        profile: {
          id: profile._id,
          email: profile.email,
          fullName: profile.fullName,
          role: profile.role,
          isActive: profile.isActive
        }
      });

    } catch (error) {
      console.error('Delete profile error:', error);
      res.status(500).json({ 
        error: 'Failed to delete profile', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/profile/organization/:orgId
 * Get profiles by organization (admin only)
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

      // Check organization access
      if (req.profile.role !== 'super_admin') {
        if (!req.profile.organizationId.equals(orgId)) {
          return res.status(403).json({ 
            error: 'Cannot access profiles from different organization' 
          });
        }
      }

      // Build query
      let query = { organizationId: orgId };
      if (roleFilter) {
        query.role = roleFilter;
      }

      // Execute query
      const profiles = await Profile.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Profile.countDocuments(query);

      res.json({
        profiles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get organization profiles error:', error);
      res.status(500).json({ 
        error: 'Failed to get organization profiles', 
        details: error.message 
      });
    }
  }
);

module.exports = router;
