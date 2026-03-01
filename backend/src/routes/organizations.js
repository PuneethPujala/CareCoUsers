const express = require('express');
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const Profile = require('../models/Profile');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { logEvent, autoLogAccess } = require('../services/auditService');

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
        isActive = true,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      let query = {};

      if (type) query.type = type;
      if (subscriptionPlan) query.subscriptionPlan = subscriptionPlan;
      if (isActive !== undefined) query.isActive = isActive === 'true';

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

      // Execute query with pagination
      const organizations = await Organization.find(query)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

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
          req.profile.organizationId.equals(organizationId);
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
        canUpdate = req.profile.organizationId && req.profile.organizationId.equals(organizationId);
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

      // Soft delete by deactivating
      organization.isActive = false;
      await organization.save();

      // Log organization deletion
      await logEvent(req.profile.supabaseUid, 'organization_deleted', 'organization', organizationId, req, {
        organizationName: organization.name,
        organizationType: organization.type
      });

      res.json({
        message: 'Organization deactivated successfully',
        organization: {
          id: organization._id,
          name: organization.name,
          type: organization.type,
          isActive: organization.isActive
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
          req.profile.organizationId.equals(organizationId);
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
          req.profile.organizationId.equals(organizationId);
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      // Get user counts by role
      const userStats = await Profile.aggregate([
        { $match: { organizationId: mongoose.Types.ObjectId(organizationId) } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      // Get assignment stats
      const CaretakerPatient = require('../models/CaretakerPatient');
      const assignmentStats = await CaretakerPatient.getAssignmentStats(organizationId);

      // Get organization details
      const organization = await Organization.findById(organizationId);

      res.json({
        organization: {
          name: organization.name,
          type: organization.type,
          subscriptionPlan: organization.subscriptionPlan,
          maxPatients: organization.maxPatients,
          currentPatientCount: organization.currentPatientCount,
          currentCaretakerCount: organization.currentCaretakerCount,
          isAtPatientCapacity: organization.isAtPatientCapacity,
          isLicenseExpired: organization.isLicenseExpired
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

module.exports = router;
