const express = require('express');
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Profile = require('../models/Profile');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { logEvent, autoLogAccess } = require('../services/auditService');
const { invalidateCache, CacheKeys } = require('../config/redis');

const router = express.Router();

/**
 * GET /api/organizations
 * Get organizations (super admin only)
 */
router.get('/',
  authenticate,
  requireRole('super_admin'),
  authorize('organizations', 'read'),
  autoLogAccess('organizations', 'read'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        type,
        subscriptionPlan,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      let { isActive } = req.query;

      // Build query
      let query = {};

      if (type) query.type = type;
      if (subscriptionPlan) query.subscriptionPlan = subscriptionPlan;

      if (isActive === undefined) {
        query.isActive = true; // Default to active organizations
      } else if (isActive === '' || isActive === 'all') {
        // No filter — return all orgs (active + suspended)
      } else {
        query.isActive = isActive === 'true';
      }

      // Apply search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination and lean conversion for custom mapping
      const organizationsRaw = await Organization.find(query)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();

      // Hydrate all organizations with live aggregate data
      const organizations = await Promise.all(organizationsRaw.map(async (org) => {
        const orgId = org._id;

        // Dynamic Patient Count matching legacy Strings or ObjectIds
        const patientCount = await mongoose.connection.db.collection('patients').countDocuments({
          is_active: { $ne: false },
          $or: [
            { organization_id: orgId },
            { organization_id: String(orgId) },
            { organization_id: new mongoose.Types.ObjectId(orgId) }
          ]
        });

        // Dynamic Staff Count (Admins + Managers + Callers)
        const staffCount = await Profile.countDocuments({
          isActive: { $ne: false },
          $or: [
            { organizationId: orgId },
            { organizationId: String(orgId) },
            { organizationId: new mongoose.Types.ObjectId(orgId) }
          ],
          role: { $in: ['org_admin', 'care_manager', 'caller'] }
        });

        // Map District Logic
        let displayDistrict = org.district || 'Regional Hub';
        if (!org.district && org.address) {
          displayDistrict = typeof org.address === 'string' ? org.address : (org.address.district || org.address.city || 'Regional Hub');
        }

        return {
          ...org,
          district: displayDistrict,
          currentPatientCount: patientCount,
          currentCaretakerCount: staffCount
        };
      }));

      // Get total count
      const total = await Organization.countDocuments(query);

      res.json({
        organizations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get organizations error:', error);
      res.status(500).json({
        error: 'Failed to get organizations',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/organizations/:id
 * Get specific organization
 */
router.get('/:id',
  authenticate,
  authorize('organizations', 'read'),
  autoLogAccess('organizations', 'read'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      // Super admin can access all organizations
      if (role === 'super_admin') {
        canAccess = true;
      }

      // Org admin and care manager can access their own organization
      else if (['org_admin', 'care_manager'].includes(role)) {
        canAccess = req.profile.organizationId &&
          (req.profile.organizationId._id || req.profile.organizationId).toString() === String(organizationId);
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      // Get organization details
      const organization = await Organization.findById(organizationId);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(organization);

    } catch (error) {
      console.error('Get organization error:', error);
      res.status(500).json({
        error: 'Failed to get organization',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/organizations
 * Create new organization (super admin only)
 */
router.post('/',
  authenticate,
  requireRole('super_admin'),
  authorize('organizations', 'create'),
  autoLogAccess('organizations', 'create'),
  async (req, res) => {
    try {
      const {
        name,
        type,
        subscriptionPlan = 'starter',
        maxPatients = 100,
        address,
        phone,
        email,
        licenseNumber,
        licenseExpiryDate,
        settings
      } = req.body;

      // Validate required fields
      if (!name || !type) {
        return res.status(400).json({
          error: 'Missing required fields: name, type'
        });
      }

      // Check if organization with same name already exists
      const existingOrg = await Organization.findOne({ name });
      if (existingOrg) {
        return res.status(400).json({ error: 'Organization with this name already exists' });
      }

      // Create organization
      const organization = new Organization({
        name,
        type,
        subscriptionPlan,
        maxPatients,
        address,
        phone,
        email,
        licenseNumber,
        licenseExpiryDate,
        settings,
        createdBy: req.profile.supabaseUid
      });

      await organization.save();

      // Log organization creation
      await logEvent(req.profile.supabaseUid, 'organization_created', 'organization', organization._id, req, {
        organizationName: name,
        organizationType: type,
        subscriptionPlan
      });

      // Invalidate admin dashboard cache so new org shows immediately
      await invalidateCache(CacheKeys.adminDashboard());

      res.status(201).json({
        message: 'Organization created successfully',
        organization
      });

    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({
        error: 'Failed to create organization',
        details: error.message
      });
    }
  }
);

/**
 * PUT /api/organizations/:id
 * Update organization
 */
router.put('/:id',
  authenticate,
  authorize('organizations', 'update'),
  autoLogAccess('organizations', 'update'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;
      const {
        name,
        type,
        subscriptionPlan,
        maxPatients,
        address,
        phone,
        email,
        licenseNumber,
        licenseExpiryDate,
        settings,
        isActive
      } = req.body;

      // Check access permissions
      const { role } = req.profile;
      let canUpdate = false;
      let allowedFields = [];

      // Super admin can update all fields
      if (role === 'super_admin') {
        canUpdate = true;
        allowedFields = ['name', 'type', 'subscriptionPlan', 'maxPatients', 'address', 'phone', 'email', 'licenseNumber', 'licenseExpiryDate', 'settings', 'isActive'];
      }

      // Org admin can update limited fields
      else if (role === 'org_admin') {
        canUpdate = req.profile.organizationId && (req.profile.organizationId._id || req.profile.organizationId).toString() === String(organizationId);
        allowedFields = ['address', 'phone', 'email', 'settings'];
      }

      if (!canUpdate) {
        return res.status(403).json({ error: 'Access denied to update this organization' });
      }

      // Build update data with only allowed fields
      const updateData = {};
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      // Update organization
      const updatedOrganization = await Organization.findByIdAndUpdate(
        organizationId,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedOrganization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Log organization update
      await logEvent(req.profile.supabaseUid, 'organization_updated', 'organization', organizationId, req, {
        updatedFields: Object.keys(updateData)
      });

      // Invalidate dashboard caches
      await invalidateCache(CacheKeys.adminDashboard());
      await invalidateCache(CacheKeys.orgDashboard(organizationId));

      res.json({
        message: 'Organization updated successfully',
        organization: updatedOrganization
      });

    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({
        error: 'Failed to update organization',
        details: error.message
      });
    }
  }
);

/**
 * POST /api/organizations/:id/collaborations
 * Add a new collaboration/tie-up (super admin or org admin)
 */
router.post('/:id/collaborations',
  authenticate,
  authorize('organizations', 'update'),
  autoLogAccess('organizations', 'update'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;
      const { partnerName, dealAmount, date, status } = req.body;

      // Check access permissions
      const { role } = req.profile;
      let canUpdate = false;

      if (role === 'super_admin') {
        canUpdate = true;
      } else if (role === 'org_admin') {
        canUpdate = req.profile.organizationId && (req.profile.organizationId._id || req.profile.organizationId).toString() === String(organizationId);
      }

      if (!canUpdate) {
        return res.status(403).json({ error: 'Access denied to update this organization' });
      }

      if (!partnerName || dealAmount === undefined) {
        return res.status(400).json({ error: 'partnerName and dealAmount are required' });
      }

      const organization = await Organization.findById(organizationId);
      if (!organization) return res.status(404).json({ error: 'Organization not found' });

      const safeAmount = parseFloat(String(dealAmount).replace(/,/g, '')) || 0;

      const newCollaboration = {
        partnerName,
        dealAmount: safeAmount,
        date: date || new Date(),
        status: status || 'Active',
      };

      if (req.profile && req.profile._id) {
        newCollaboration.addedBy = req.profile._id;
      }

      if (!organization.collaborations) {
        organization.collaborations = [];
      }
      organization.collaborations.push(newCollaboration);
      organization.totalRevenue = (organization.totalRevenue || 0) + safeAmount;

      await organization.save();

      // Log event
      await logEvent(req.profile.supabaseUid, 'collaboration_added', 'organization', organizationId, req, {
        partnerName,
        dealAmount
      });

      await invalidateCache(CacheKeys.adminDashboard());
      await invalidateCache(CacheKeys.orgDashboard(organizationId));

      res.status(201).json({
        message: 'Collaboration added successfully',
        organization
      });
    } catch (error) {
      require('fs').writeFileSync('routes_crash.txt', String(error.stack || error));
      console.error('Add collaboration error:', error);
      res.status(500).json({ error: 'Failed to add collaboration', details: error.message });
    }
  }
);

/**
 * DELETE /api/organizations/:id
 * Delete/deactivate organization (super admin only)
 */
router.delete('/:id',
  authenticate,
  requireRole('super_admin'),
  authorize('organizations', 'delete'),
  autoLogAccess('organizations', 'delete'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;

      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Check if organization has active users
      const activeUsers = await Profile.countDocuments({
        organizationId,
        isActive: true
      });

      if (activeUsers > 0) {
        return res.status(400).json({
          error: 'Cannot delete organization with active users. Deactivate all users first.'
        });
      }

      // Hard delete from MongoDB
      await organization.deleteOne();

      // Log organization deletion
      await logEvent(req.profile.supabaseUid, 'organization_deleted', 'organization', organizationId, req, {
        organizationName: organization.name,
        organizationType: organization.type
      });

      // Invalidate dashboard caches
      await invalidateCache(CacheKeys.adminDashboard());
      await invalidateCache(CacheKeys.orgDashboard(organizationId));

      res.json({
        message: 'Organization permanently deleted',
        organization: {
          id: organization._id,
          name: organization.name,
          type: organization.type,
          isActive: false
        }
      });

    } catch (error) {
      console.error('Delete organization error:', error);
      res.status(500).json({
        error: 'Failed to delete organization',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/organizations/:id/users
 * Get users in an organization
 */
router.get('/:id/users',
  authenticate,
  authorize('organizations', 'read'),
  autoLogAccess('organizations', 'read'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;
      const {
        page = 1,
        limit = 20,
        role: roleFilter,
        search,
        isActive = true
      } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        canAccess = req.profile.organizationId &&
          String(req.profile.organizationId) === String(organizationId);
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      // Build query
      let query = { organizationId };
      if (roleFilter) query.role = roleFilter;
      if (isActive !== undefined) query.isActive = isActive === 'true';

      // Apply search filter
      if (search) {
        query.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Execute query with pagination
      const users = await Profile.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Profile.countDocuments(query);

      res.json({
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get organization users error:', error);
      res.status(500).json({
        error: 'Failed to get organization users',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/organizations/:id/stats
 * Get organization statistics
 */
router.get('/:id/stats',
  authenticate,
  authorize('organizations', 'read'),
  autoLogAccess('organizations', 'read'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        canAccess = req.profile.organizationId &&
          String(req.profile.organizationId) === String(organizationId);
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      // Get user counts by role directly supporting multiple format mappings natively
      const userStats = await Profile.aggregate([
        {
          $match: {
            isActive: { $ne: false },
            $or: [
              { organizationId: organizationId },
              { organizationId: organizationId.toString() },
              { organizationId: new mongoose.Types.ObjectId(organizationId) }
            ]
          }
        },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      // Get assignment stats
      const CaretakerPatient = require('../models/CaretakerPatient');
      const assignmentStats = await CaretakerPatient.getAssignmentStats(organizationId);

      // Get organization details
      const organization = await Organization.findById(organizationId);

      // Get precise patient count
      const patientCount = await mongoose.connection.db.collection('patients').countDocuments({
        is_active: { $ne: false },
        $or: [
          { organization_id: organizationId },
          { organization_id: organizationId.toString() },
          { organization_id: new mongoose.Types.ObjectId(organizationId) }
        ]
      });

      // Get precise patient revenue
      const patientRevenueAgg = await mongoose.connection.db.collection('patients').aggregate([
        {
          $match: {
            'subscription.status': 'active',
            $or: [
              { organization_id: organizationId },
              { organization_id: organizationId.toString() },
              { organization_id: new mongoose.Types.ObjectId(organizationId) }
            ]
          }
        },
        { $group: { _id: null, total: { $sum: '$subscription.amount' } } }
      ]).toArray();
      const patientRevenue = patientRevenueAgg.length > 0 ? patientRevenueAgg[0].total : 0;

      res.json({
        organization: {
          name: organization.name,
          type: organization.type,
          subscriptionPlan: organization.subscriptionPlan,
          maxPatients: organization.maxPatients,
          currentPatientCount: patientCount,
          currentCaretakerCount: organization.currentCaretakerCount,
          isAtPatientCapacity: organization.isAtPatientCapacity,
          isLicenseExpired: organization.isLicenseExpired,
          tieupRevenue: organization.totalRevenue || 0,
          patientRevenue: patientRevenue,
          totalRevenue: (organization.totalRevenue || 0) + patientRevenue
        },
        userStats: userStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        assignmentStats: assignmentStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      });

    } catch (error) {
      console.error('Get organization stats error:', error);
      res.status(500).json({
        error: 'Failed to get organization statistics',
        details: error.message
      });
    }
  }
);

/**
 * PATCH /api/organizations/:id/toggle-status
 * Deactivate or reactivate an organization (super admin only)
 */
router.patch('/:id/toggle-status',
  authenticate,
  requireRole('super_admin'),
  async (req, res) => {
    try {
      const organizationId = req.params.id;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive (boolean) is required' });
      }

      const organization = await Organization.findByIdAndUpdate(
        organizationId,
        { $set: { isActive } },
        { new: true }
      );

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const action = isActive ? 'reactivated' : 'deactivated';

      // Log the event
      await logEvent(req.profile.supabaseUid, `organization_${action}`, 'organization', organizationId, req, {
        organizationName: organization.name
      });

      res.json({
        message: `Organization "${organization.name}" has been ${action}`,
        organization: {
          _id: organization._id,
          name: organization.name,
          isActive: organization.isActive
        }
      });

    } catch (error) {
      console.error('Toggle organization status error:', error);
      res.status(500).json({
        error: 'Failed to update organization status',
        details: error.message
      });
    }
  }
);

module.exports = router;
