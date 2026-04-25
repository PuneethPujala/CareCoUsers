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
 * Get all organizations — super_admin only
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
                city,
                subscriptionPlan,
                isActive = true,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = req.query;

            const query = {};
            if (city)             query.city             = { $regex: city, $options: 'i' };
            if (subscriptionPlan) query.subscriptionPlan = subscriptionPlan;
            if (isActive !== undefined) query.isActive   = isActive === 'true';

            if (search) {
                query.$or = [
                    { name:  { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { city:  { $regex: search, $options: 'i' } },
                ];
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const [organizations, total] = await Promise.all([
                Organization.find(query)
                    .sort(sort)
                    .limit(parseInt(limit))
                    .skip((parseInt(page) - 1) * parseInt(limit)),
                Organization.countDocuments(query),
            ]);

            res.json({
                organizations,
                pagination: {
                    page:  parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });

        } catch (error) {
            console.error('Get organizations error:', error);
            res.status(500).json({ error: 'Failed to get organizations', details: error.message });
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
            const { role } = req.profile;

            // Super admin sees all; org_admin and care_manager see only their own
            if (!['super_admin'].includes(role)) {
                if (
                    !req.profile.organizationId ||
                    !req.profile.organizationId.equals(req.params.id)
                ) {
                    return res.status(403).json({ error: 'Access denied to this organization' });
                }
            }

            const organization = await Organization.findById(req.params.id);
            if (!organization) {
                return res.status(404).json({ error: 'Organization not found' });
            }

            res.json(organization);

        } catch (error) {
            console.error('Get organization error:', error);
            res.status(500).json({ error: 'Failed to get organization', details: error.message });
        }
    }
);

/**
 * POST /api/organizations
 * Create new organization — super_admin only
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
                city,
                state,
                country,
                timezone,
                subscriptionPlan = 'starter',
                limits,
                phone,
                email,
                licenseNumber,
                licenseExpiryDate,
                settings,
            } = req.body;

            if (!name || !city) {
                return res.status(400).json({ error: 'Missing required fields: name, city' });
            }

            // Each city should have only one active organisation
            const existingOrg = await Organization.findOne({ city, isActive: true });
            if (existingOrg) {
                return res.status(400).json({ error: `An active organisation already exists for ${city}` });
            }

            const organization = new Organization({
                name,
                city,
                state,
                country,
                timezone,
                subscriptionPlan,
                limits,
                phone,
                email,
                licenseNumber,
                licenseExpiryDate,
                settings,
                createdBy: req.profile.supabaseUid,
            });

            await organization.save();

            await logEvent(
                req.profile.supabaseUid,
                'organization_created',
                'organization',
                organization._id,
                req,
                { organizationName: name, city, subscriptionPlan }
            );

            res.status(201).json({ message: 'Organization created successfully', organization });

        } catch (error) {
            console.error('Create organization error:', error);
            res.status(500).json({ error: 'Failed to create organization', details: error.message });
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
            const { role } = req.profile;
            const organizationId = req.params.id;
            let canUpdate = false;
            let allowedFields = [];

            if (role === 'super_admin') {
                canUpdate = true;
                // Super admin can update everything except createdBy and counts
                allowedFields = [
                    'name', 'city', 'state', 'country', 'timezone',
                    'subscriptionPlan', 'limits', 'phone', 'email',
                    'licenseNumber', 'licenseExpiryDate', 'settings', 'isActive',
                ];
            } else if (role === 'org_admin') {
                canUpdate = req.profile.organizationId &&
                    req.profile.organizationId.equals(organizationId);
                // Org admin can only update contact and settings
                allowedFields = ['phone', 'email', 'settings'];
            }

            if (!canUpdate) {
                return res.status(403).json({ error: 'Access denied to update this organization' });
            }

            const updateData = {};
            allowedFields.forEach((field) => {
                if (req.body[field] !== undefined) updateData[field] = req.body[field];
            });

            const updatedOrganization = await Organization.findByIdAndUpdate(
                organizationId,
                updateData,
                { new: true, runValidators: true }
            );

            if (!updatedOrganization) {
                return res.status(404).json({ error: 'Organization not found' });
            }

            await logEvent(
                req.profile.supabaseUid,
                'organization_updated',
                'organization',
                organizationId,
                req,
                { updatedFields: Object.keys(updateData) }
            );

            res.json({ message: 'Organization updated successfully', organization: updatedOrganization });

        } catch (error) {
            console.error('Update organization error:', error);
            res.status(500).json({ error: 'Failed to update organization', details: error.message });
        }
    }
);

/**
 * DELETE /api/organizations/:id
 * Soft-delete (deactivate) organization — super_admin only
 */
router.delete('/:id',
    authenticate,
    requireRole('super_admin'),
    authorize('organizations', 'delete'),
    autoLogAccess('organizations', 'delete'),
    async (req, res) => {
        try {
            const organization = await Organization.findById(req.params.id);
            if (!organization) {
                return res.status(404).json({ error: 'Organization not found' });
            }

            // Block deletion if active users still exist
            const activeUsers = await Profile.countDocuments({
                organizationId: req.params.id,
                isActive: true,
            });

            if (activeUsers > 0) {
                return res.status(400).json({
                    error: `Cannot deactivate organisation with ${activeUsers} active users. Deactivate all users first.`,
                });
            }

            organization.isActive = false;
            await organization.save();

            await logEvent(
                req.profile.supabaseUid,
                'organization_deleted',
                'organization',
                req.params.id,
                req,
                { organizationName: organization.name, city: organization.city }
            );

            res.json({
                message: 'Organization deactivated successfully',
                organization: {
                    id:       organization._id,
                    name:     organization.name,
                    city:     organization.city,
                    isActive: organization.isActive,
                },
            });

        } catch (error) {
            console.error('Delete organization error:', error);
            res.status(500).json({ error: 'Failed to delete organization', details: error.message });
        }
    }
);

/**
 * GET /api/organizations/:id/users
 * Get all users in an organization with pagination + filtering
 */
router.get('/:id/users',
    authenticate,
    authorize('organizations', 'read'),
    autoLogAccess('organizations', 'read'),
    async (req, res) => {
        try {
            const { role } = req.profile;
            const organizationId = req.params.id;

            if (role !== 'super_admin') {
                if (
                    !req.profile.organizationId ||
                    !req.profile.organizationId.equals(organizationId)
                ) {
                    return res.status(403).json({ error: 'Access denied to this organization' });
                }
            }

            const {
                page = 1,
                limit = 20,
                role: roleFilter,
                search,
                isActive = true,
            } = req.query;

            const query = { organizationId };
            if (roleFilter)        query.role     = roleFilter;
            if (isActive !== undefined) query.isActive = isActive === 'true';

            if (search) {
                query.$or = [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email:    { $regex: search, $options: 'i' } },
                ];
            }

            const [users, total] = await Promise.all([
                Profile.find(query)
                    .sort({ createdAt: -1 })
                    .limit(parseInt(limit))
                    .skip((parseInt(page) - 1) * parseInt(limit)),
                Profile.countDocuments(query),
            ]);

            res.json({
                users,
                pagination: {
                    page:  parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            });

        } catch (error) {
            console.error('Get organization users error:', error);
            res.status(500).json({ error: 'Failed to get organization users', details: error.message });
        }
    }
);

/**
 * GET /api/organizations/:id/stats
 * Get live statistics for an organization
 */
router.get('/:id/stats',
    authenticate,
    authorize('organizations', 'read'),
    autoLogAccess('organizations', 'read'),
    async (req, res) => {
        try {
            const { role } = req.profile;
            const organizationId = req.params.id;

            if (role !== 'super_admin') {
                if (
                    !req.profile.organizationId ||
                    !req.profile.organizationId.equals(organizationId)
                ) {
                    return res.status(403).json({ error: 'Access denied to this organization' });
                }
            }

            const organization = await Organization.findById(organizationId);
            if (!organization) {
                return res.status(404).json({ error: 'Organization not found' });
            }

            // Live role breakdown from Profile collection
            const userStats = await Profile.aggregate([
                { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
                { $group: { _id: '$role', count: { $sum: 1 } } },
            ]);

            const statsByRole = userStats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {});

            res.json({
                organization: {
                    id:               organization._id,
                    name:             organization.name,
                    city:             organization.city,
                    subscriptionPlan: organization.subscriptionPlan,
                    isOperational:    organization.isOperational,
                    limits:           organization.limits,
                    counts:           organization.counts,
                    // Capacity flags
                    isAtPatientCapacity: organization.isAtPatientCapacity,
                    isAtCallerCapacity:  organization.isAtCallerCapacity,
                    isAtManagerCapacity: organization.isAtManagerCapacity,
                },
                // Live breakdown by role
                userStats: statsByRole,
            });

        } catch (error) {
            console.error('Get organization stats error:', error);
            res.status(500).json({ error: 'Failed to get organization statistics', details: error.message });
        }
    }
);

module.exports = router;