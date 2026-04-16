const express = require('express');
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { getUserActivitySummary, getSecurityIncidents } = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/reports/user-activity
 * Get user activity reports
 */
router.get('/user-activity',
  authenticate,
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const { userId, days = 30 } = req.query;
      const { role } = req.profile;
      let targetUserId = userId;

      if (role === 'super_admin') {
        if (!userId) {
          return res.status(400).json({ error: 'userId is required for super admin' });
        }
      } else if (['org_admin', 'care_manager'].includes(role)) {
        if (!userId) {
          targetUserId = req.profile.supabaseUid;
        } else {
          const user = await Profile.findOne({ supabaseUid: userId });
          if (!user || !user.organizationId.equals(req.profile.organizationId)) {
            return res.status(403).json({ error: 'Access denied to user outside your organization' });
          }
        }
      } else {
        // All other roles can only see their own activity
        targetUserId = req.profile.supabaseUid;
        if (userId && userId !== req.profile.supabaseUid) {
          return res.status(403).json({ error: 'Access denied to other users\' activity' });
        }
      }

      const activitySummary = await getUserActivitySummary(targetUserId, parseInt(days));

      res.json({
        userId: targetUserId,
        days: parseInt(days),
        activitySummary,
      });

    } catch (error) {
      console.error('Get user activity report error:', error);
      res.status(500).json({ error: 'Failed to get user activity report', details: error.message });
    }
  }
);

/**
 * GET /api/reports/organization-stats
 * Get organisation statistics
 */
router.get('/organization-stats',
  authenticate,
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const { organizationId } = req.query;
      const { role } = req.profile;
      let targetOrgId = organizationId;

      if (role === 'super_admin') {
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for super admin' });
        }
      } else if (['org_admin', 'care_manager'].includes(role)) {
        targetOrgId = req.profile.organizationId;
        if (organizationId && organizationId !== req.profile.organizationId.toString()) {
          return res.status(403).json({ error: 'Access denied to other organizations' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied to organization reports' });
      }

      const organization = await Organization.findById(targetOrgId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // User counts broken down by role
      const userStats = await Profile.aggregate([
        { $match: { organizationId: new mongoose.Types.ObjectId(targetOrgId) } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]);

      // Activity over the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentActivity = await AuditLog.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'supabaseUid',
            foreignField: 'supabaseUid',
            as: 'profile',
          },
        },
        { $unwind: '$profile' },
        {
          $match: {
            'profile.organizationId': new mongoose.Types.ObjectId(targetOrgId),
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              action: '$action',
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.date',
            actions: { $push: { action: '$_id.action', count: '$count' } },
            totalActions: { $sum: '$count' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({
        organization: {
          id: organization._id,
          name: organization.name,
          city: organization.city,
          counts: organization.counts,
          limits: organization.limits
        },
        userStats: userStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        recentActivity,
      });

    } catch (error) {
      console.error('Get organization stats report error:', error);
      res.status(500).json({ error: 'Failed to get organization stats report', details: error.message });
    }
  }
);

/**
 * GET /api/reports/security-incidents
 * Get security incidents — super_admin and org_admin only
 */
router.get('/security-incidents',
  authenticate,
  requireRole('super_admin', 'org_admin'),
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const { severity, startDate, endDate, limit = 50 } = req.query;

      const filters = {};
      if (severity) filters.severity = severity;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (limit) filters.limit = parseInt(limit);

      // org_admin: scope incidents to their own org's users only
      if (req.profile.role === 'org_admin') {
        const orgUsers = await Profile.find({
          organizationId: req.profile.organizationId,
        }).select('supabaseUid');

        filters.userIds = orgUsers.map(u => u.supabaseUid);
      }

      const incidents = await getSecurityIncidents(filters);

      res.json({
        incidents,
        filters,
        total: incidents.length,
      });

    } catch (error) {
      console.error('Get security incidents report error:', error);
      res.status(500).json({ error: 'Failed to get security incidents report', details: error.message });
    }
  }
);

module.exports = router;