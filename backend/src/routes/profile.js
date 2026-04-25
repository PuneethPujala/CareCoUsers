const express = require('express');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const { authenticate, requireRole, requireOwnership } = require('../middleware/authenticate');
const { authorize, authorizeResource, authorizeAny } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { logEvent, autoLogAccess } = require('../services/auditService');
const { invalidateCache, invalidatePattern, CacheKeys } = require('../config/redis');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with Service Role for Admin actions (skips RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const router = express.Router();

/**
 * GET /api/profile/me
 * Get current user's profile
 */
router.get('/me', authenticate, autoLogAccess('profile', 'read'), async (req, res) => {
  try {
    const profile = await Profile.findById(req.profile._id)
      .populate('organizationId', 'name type subscriptionPlan settings address');

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
        .populate('organizationId', 'name type subscriptionPlan address');

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      // Apply additional access control based on role
      const { role } = req.profile;
      let canAccess = false;
      
      // Super admin can see all profiles
      if (role === 'super_admin') {
        canAccess = true;
      }
      // Org admin and care manager can see profiles in their organization
      else if (['org_admin', 'care_manager'].includes(role)) {
        if (profile.organizationId && profile.organizationId.equals(req.profile.organizationId)) {
          canAccess = true;
        }
      }
      // Caretakers can only see their own profile and assigned patients
      else if (role === 'caretaker') {
        if (profile._id.equals(req.profile._id)) {
          canAccess = true;
        } else {
          const CaretakerPatient = require('../models/CaretakerPatient');
          const assignment = await CaretakerPatient.findOne({
            caretakerId: req.profile._id, patientId: profile._id, status: 'active'
          });
          if (assignment) canAccess = true;
        }
      }
      // Patient mentors can only see their own profile and authorized patients
      else if (role === 'patient_mentor') {
        if (profile._id.equals(req.profile._id)) {
          canAccess = true;
        } else {
          const MentorAuthorization = require('../models/MentorAuthorization');
          const authorization = await MentorAuthorization.findOne({
            mentorId: req.profile._id, patientId: profile._id, status: 'active'
          });
          if (authorization) canAccess = true;
        }
      }
      // Patients can only see their own profile
      else if (role === 'patient') {
        if (profile._id.equals(req.profile._id)) {
          canAccess = true;
        }
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this profile' });
      }

      const pObj = profile.toJSON();
      if (['org_admin', 'care_manager'].includes(profile.role) && profile.organizationId) {
          const mongoose = require('mongoose');
          const Patient = require('../models/Patient');
          const orgId = profile.organizationId._id || profile.organizationId;
          pObj.metadata = pObj.metadata || {};
          
          pObj.metadata.patientsCount = await Patient.countDocuments({
              $or: [
                  { organization_id: orgId },
                  { organization_id: orgId.toString() },
                  { organization_id: new mongoose.Types.ObjectId(orgId) }
              ],
              is_active: { $ne: false }
          });
          
          pObj.metadata.callersCount = await Profile.countDocuments({
              role: { $in: ['care_manager', 'caretaker', 'caller'] },
              organizationId: orgId,
              isActive: { $ne: false },
              _id: { $ne: profile._id }
          });
      }

      return res.json(pObj);

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
        managedBy: managerFilter,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query — default to active profiles only (treats missing isActive as active)
      let query = { ...req.scopeFilter, isActive: { $ne: false } };

      if (managerFilter) {
          query.managedBy = managerFilter;
      }

      // Allow explicit override to see inactive profiles (admin use)
      if (req.query.isActive === 'false') {
        query.isActive = false;
      } else if (req.query.isActive === 'all') {
        delete query.isActive;
      }

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
      let inheritedAddress = null;
      if (organizationId) {
        const orgForAddress = await Organization.findById(organizationId);
        if (orgForAddress && orgForAddress.address) {
            inheritedAddress = {
                street: orgForAddress.address.street || '',
                city: orgForAddress.address.district || orgForAddress.address.city || '',
                state: orgForAddress.address.state || '',
                country: orgForAddress.address.country || '',
                postalCode: orgForAddress.address.zipCode || '',
                formattedAddress: [
                    orgForAddress.address.street,
                    orgForAddress.address.district || orgForAddress.address.city,
                    orgForAddress.address.state
                ].filter(Boolean).join(', ')
            };
        }

        if (req.profile.role !== 'super_admin') {
          if (!req.profile.organizationId.equals(organizationId)) {
            return res.status(403).json({ 
              error: 'Cannot create profile in different organization' 
            });
          }
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
        address: inheritedAddress,
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

      if (organizationId) {
        const orgStrId = typeof organizationId === 'object' ? (organizationId._id || organizationId).toString() : organizationId.toString();
        await invalidateCache(CacheKeys.orgDashboard(orgStrId));
      }
      await invalidateCache(CacheKeys.adminDashboard());

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
  autoLogAccess('profile', 'update'),
  async (req, res) => {
    try {
      const profileId = req.params.id;
      const isSelfEdit = String(req.profile._id) === String(profileId);
      const isAdmin = ['super_admin', 'org_admin', 'care_manager'].includes(req.profile.role);

      // Users can always edit their own profile; admins can edit others
      if (!isSelfEdit && !isAdmin) {
        return res.status(403).json({ error: 'You can only edit your own profile' });
      }

      const {
        fullName,
        phone,
        avatarUrl,
        isActive,
        role,
        organizationId,
        metadata
      } = req.body;

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
      if (req.body.address !== undefined) updateData.address = req.body.address;

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

      // --- [START] INACTIVE CALLER COVERAGE PIPELINE ---
      if (['org_admin', 'care_manager'].includes(req.profile.role) && req.body.isActive !== undefined) {
         try {
            const CaretakerPatient = require('../models/CaretakerPatient');

            if (req.body.isActive === false && updatedProfile.role === 'caller') {
                // Caller marked INACTIVE. We need to deploy Secondary Coverages.
                const theirAssignments = await CaretakerPatient.find({ caretakerId: profileId, status: 'active', isTemporary: false });

                if (theirAssignments.length > 0) {
                    const patientIds = theirAssignments.map(a => a.patientId);
                    
                    // Fetch all other ACTIVE callers in this org
                    const OrgIdObject = updatedProfile.organizationId._id || updatedProfile.organizationId;
                    const availableCallers = await Profile.find({
                        organizationId: OrgIdObject,
                        role: 'caller',
                        isActive: true,
                        _id: { $ne: profileId }
                    });

                    if (availableCallers.length > 0) {
                        const callerIds = availableCallers.map(c => c._id);
                        const assignmentCounts = await CaretakerPatient.aggregate([
                            { $match: { caretakerId: { $in: callerIds }, status: 'active' } },
                            { $group: { _id: '$caretakerId', count: { $sum: 1 } } }
                        ]);
                        
                        const countMap = {};
                        assignmentCounts.forEach(c => { countMap[c._id.toString()] = c.count; });
                        
                        const coverageCallers = availableCallers.map(c => ({ id: c._id, count: countMap[c._id.toString()] || 0 }));

                        for (const pid of patientIds) {
                            coverageCallers.sort((a, b) => a.count - b.count);
                            const bestCoverageCaller = coverageCallers[0];

                            if (bestCoverageCaller.count < 30) {
                                // Resolve the coverage caller's care manager
                                const coverageCallerProfile = await Profile.findById(bestCoverageCaller.id).select('managedBy').lean();
                                const coverageManagerId = coverageCallerProfile?.managedBy || req.profile._id;

                                await CaretakerPatient.create({
                                    caretakerId: bestCoverageCaller.id,
                                    patientId: pid,
                                    careManagerId: coverageManagerId,
                                    assignedBy: req.profile._id,
                                    status: 'active',
                                    isTemporary: true,
                                    notes: [{ content: `Temporary System Coverage deployed due to assigned Caller entering sick leave.`, addedBy: req.profile._id }]
                                });
                                bestCoverageCaller.count += 1; 
                            }
                        }
                    }
                }
            } 
            else if (req.body.isActive === true && updatedProfile.role === 'caller') {
                // Caller marked ACTIVE again. Restore operation by purging Temporary Coverages.
                const primaryAssignments = await CaretakerPatient.find({ caretakerId: profileId, status: 'active', isTemporary: false });
                const primaryPatientIds = primaryAssignments.map(a => a.patientId);
                
                if (primaryPatientIds.length > 0) {
                    await CaretakerPatient.deleteMany({ patientId: { $in: primaryPatientIds }, isTemporary: true });
                }
            }
         } catch (covErr) {
             console.error('[Coverage Matrix] Silently failed coverage allocation:', covErr);
         }
      }
      // --- [END] INACTIVE CALLER COVERAGE PIPELINE ---

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
  authorizeAny([
    { resource: 'profile', action: 'delete' },
    { resource: 'care_managers', action: 'delete' },
    { resource: 'caretakers', action: 'delete' }
  ]),
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

      // Enforce organization boundaries
      if (req.profile.role !== 'super_admin') {
        const reqOrgId = req.profile.organizationId?._id || req.profile.organizationId;
        const profileOrgId = profile.organizationId?._id || profile.organizationId;
        if (!profileOrgId || !reqOrgId || profileOrgId.toString() !== reqOrgId.toString()) {
           return res.status(403).json({ error: 'Cannot delete profiles outside your organization' });
        }
      }

      // Cannot delete super admins (only other super admins can)
      if (profile.role === 'super_admin' && req.profile.role !== 'super_admin') {
        return res.status(403).json({ error: 'Cannot delete super admin profiles' });
      }

      // Execute Manager Replacement Reallocation if required
      if (req.query.replaceWith) {
        const replaceWithId = req.query.replaceWith;
        const newManager = await Profile.findById(replaceWithId);

        if (!newManager || newManager.role !== profile.role) {
          return res.status(400).json({ error: 'Replacement manager is invalid or does not have the same role.' });
        }
        const newMgrOrgId = newManager.organizationId?._id || newManager.organizationId;
        const oldMgrOrgId = profile.organizationId?._id || profile.organizationId;
        if (!newMgrOrgId || !oldMgrOrgId || newMgrOrgId.toString() !== oldMgrOrgId.toString()) {
          return res.status(400).json({ error: 'Replacement manager must be part of the same organization.' });
        }

        try {
          const Patient = require('../models/Patient');
          const CaretakerPatient = require('../models/CaretakerPatient');

          // 1. Transfer Profile.managedBy
          await Profile.updateMany({ managedBy: profile._id }, { managedBy: newManager._id });
          
          // 2. Transfer CaretakerPatient.assignedBy and careManagerId
          await CaretakerPatient.updateMany({ assignedBy: profile._id }, { assignedBy: newManager._id });
          await CaretakerPatient.updateMany({ careManagerId: profile._id }, { careManagerId: newManager._id });
          
          // 3. Transfer Patient.care_manager_id and assigned_manager_id
          await Patient.updateMany({ care_manager_id: profile._id }, { care_manager_id: newManager._id, assigned_manager_id: newManager._id });

          console.log(`[Reallocation] successfully migrated records from ${profile._id} to ${newManager._id}`);
        } catch (reallErr) {
          console.error('[Reallocation Protocol Failed]', reallErr);
          return res.status(500).json({ error: 'Failed to reallocate managed assets during deletion.' });
        }
      }

      // Hard Delete from Supabase Auth
      if (profile.supabaseUid && supabase) {
        try {
            const { error: authError } = await supabase.auth.admin.deleteUser(profile.supabaseUid);
            if (authError) {
              console.error('Failed to delete Supabase Auth user:', authError);
              // Proceed with MongoDB deletion even if Supabase fails (fallback sync)
            }
        } catch (e) {
            console.error('Supabase fetch error:', e);
        }
      }

      // Hard Delete from MongoDB
      await profile.deleteOne();

      // Update organization counts
      if (profile.organizationId) {
        await Organization.findByIdAndUpdate(profile.organizationId, {
          $inc: {
            ...(profile.role === 'patient' && { currentPatientCount: -1 }),
            ...(profile.role === 'caretaker' && { currentCaretakerCount: -1 })
          }
        });
        // Invalidate org-specific dashboard cache
        await invalidateCache(CacheKeys.orgDashboard(profile.organizationId));
      }

      // Invalidate admin dashboard cache so stats refresh immediately
      await invalidateCache(CacheKeys.adminDashboard());
      // Invalidate any manager dashboard cache if applicable
      if (profile.managedBy) {
        await invalidateCache(CacheKeys.managerDashboard(profile.managedBy));
      }

      // Log profile deletion
      await logEvent(req.profile.supabaseUid, 'profile_deleted', 'profile', profile._id, req, {
        deletedProfileEmail: profile.email,
        deletedProfileRole: profile.role
      });

      res.json({
        message: 'Profile and associated account permanently deleted',
        profile: {
          id: profile._id,
          email: profile.email,
          fullName: profile.fullName,
          role: profile.role,
          isActive: false
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
        const myOrgId = (req.profile.organizationId?._id || req.profile.organizationId || '').toString();
        if (myOrgId !== orgId.toString()) {
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
