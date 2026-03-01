const express = require('express');
const mongoose = require('mongoose');
const Profile = require('../models/Profile');
const Organization = require('../models/Organization');
const CaretakerPatient = require('../models/CaretakerPatient');
const MentorAuthorization = require('../models/MentorAuthorization');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
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
      const {
        userId,
        days = 30,
        organizationId: orgFilter
      } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;
      let targetUserId = userId;

      if (role === 'super_admin') {
        canAccess = true;
        if (!userId) {
          return res.status(400).json({ error: 'userId is required for super admin' });
        }
      } else if (['org_admin', 'care_manager'].includes(role)) {
        canAccess = true;
        if (!userId) {
          targetUserId = req.profile.supabaseUid;
        } else {
          // Verify user is in same organization
          const user = await Profile.findOne({ supabaseUid: userId });
          if (!user || !user.organizationId.equals(req.profile.organizationId)) {
            return res.status(403).json({ error: 'Access denied to user outside your organization' });
          }
        }
      } else {
        // Users can only see their own activity
        canAccess = true;
        targetUserId = req.profile.supabaseUid;
        if (userId && userId !== req.profile.supabaseUid) {
          return res.status(403).json({ error: 'Access denied to other users\' activity' });
        }
      }

      const activitySummary = await getUserActivitySummary(targetUserId, parseInt(days));

      res.json({
        userId: targetUserId,
        days: parseInt(days),
        activitySummary
      });

    } catch (error) {
      console.error('Get user activity report error:', error);
      res.status(500).json({
        error: 'Failed to get user activity report',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/reports/organization-stats
 * Get organization statistics
 */
router.get('/organization-stats',
  authenticate,
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const { organizationId } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let targetOrgId = organizationId;

      if (role === 'super_admin') {
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for super admin' });
        }
      } else if (['org_admin', 'care_manager'].includes(role)) {
        targetOrgId = req.profile.organizationId;
        if (organizationId && !organizationId.equals(req.profile.organizationId)) {
          return res.status(403).json({ error: 'Access denied to other organizations' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied to organization reports' });
      }

      // Get organization details
      const organization = await Organization.findById(targetOrgId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Get user statistics by role
      const userStats = await Profile.aggregate([
        { $match: { organizationId: organization._id } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      // Get assignment statistics
      const assignmentStats = await CaretakerPatient.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'caretakerId',
            foreignField: '_id',
            as: 'caretaker'
          }
        },
        { $unwind: '$caretaker' },
        {
          $match: {
            'caretaker.organizationId': organization._id
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get mentor authorization statistics
      const mentorStats = await MentorAuthorization.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'patientId',
            foreignField: '_id',
            as: 'patient'
          }
        },
        { $unwind: '$patient' },
        {
          $match: {
            'patient.organizationId': organization._id
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get recent activity (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentActivity = await AuditLog.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'supabaseUid',
            foreignField: 'supabaseUid',
            as: 'profile'
          }
        },
        { $unwind: '$profile' },
        {
          $match: {
            'profile.organizationId': organization._id,
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              action: "$action"
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            actions: {
              $push: {
                action: "$_id.action",
                count: "$count"
              }
            },
            totalActions: { $sum: "$count" }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      res.json({
        organization: {
          id: organization._id,
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
        }, {}),
        mentorStats: mentorStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        recentActivity
      });

    } catch (error) {
      console.error('Get organization stats report error:', error);
      res.status(500).json({
        error: 'Failed to get organization stats report',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/reports/security-incidents
 * Get security incidents report
 */
router.get('/security-incidents',
  authenticate,
  requireRole('super_admin', 'org_admin'),
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const {
        severity,
        startDate,
        endDate,
        organizationId: orgFilter,
        limit = 50
      } = req.query;

      // Build filters
      const filters = {};
      if (severity) filters.severity = severity;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (limit) filters.limit = parseInt(limit);

      // For org admins, filter by their organization
      if (req.profile.role === 'org_admin') {
        // Get all users in the organization
        const orgUsers = await Profile.find({
          organizationId: req.profile.organizationId
        }).select('supabaseUid');

        const orgUserIds = orgUsers.map(user => user.supabaseUid);
        filters.userIds = orgUserIds;
      }

      const incidents = await getSecurityIncidents(filters);

      res.json({
        incidents,
        filters,
        total: incidents.length
      });

    } catch (error) {
      console.error('Get security incidents report error:', error);
      res.status(500).json({
        error: 'Failed to get security incidents report',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/reports/assignment-overview
 * Get caretaker-patient assignment overview
 */
router.get('/assignment-overview',
  authenticate,
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const { organizationId } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let targetOrgId = organizationId;

      if (role === 'super_admin') {
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for super admin' });
        }
      } else if (['org_admin', 'care_manager'].includes(role)) {
        targetOrgId = req.profile.organizationId;
        if (organizationId && !organizationId.equals(req.profile.organizationId)) {
          return res.status(403).json({ error: 'Access denied to other organizations' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied to assignment reports' });
      }

      // Get assignment overview
      const assignmentOverview = await CaretakerPatient.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'caretakerId',
            foreignField: '_id',
            as: 'caretaker'
          }
        },
        { $unwind: '$caretaker' },
        {
          $match: {
            'caretaker.organizationId': mongoose.Types.ObjectId(targetOrgId)
          }
        },
        {
          $lookup: {
            from: 'profiles',
            localField: 'patientId',
            foreignField: '_id',
            as: 'patient'
          }
        },
        { $unwind: '$patient' },
        {
          $group: {
            _id: '$caretakerId',
            caretakerName: { $first: '$caretaker.fullName' },
            caretakerEmail: { $first: '$caretaker.email' },
            totalPatients: { $sum: 1 },
            activePatients: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            inactivePatients: {
              $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
            },
            averagePriority: { $avg: '$priority' },
            lastAssignment: { $max: '$createdAt' }
          }
        },
        {
          $sort: { activePatients: -1 }
        }
      ]);

      // Get patient assignment summary
      const patientSummary = await CaretakerPatient.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'patientId',
            foreignField: '_id',
            as: 'patient'
          }
        },
        { $unwind: '$patient' },
        {
          $match: {
            'patient.organizationId': mongoose.Types.ObjectId(targetOrgId)
          }
        },
        {
          $group: {
            _id: '$patientId',
            patientName: { $first: '$patient.fullName' },
            patientEmail: { $first: '$patient.email' },
            totalCaretakers: { $sum: 1 },
            activeCaretakers: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            }
          }
        },
        {
          $sort: { activeCaretakers: -1 }
        }
      ]);

      res.json({
        organizationId: targetOrgId,
        caretakerOverview: assignmentOverview,
        patientSummary,
        summary: {
          totalCaretakers: assignmentOverview.length,
          totalPatients: patientSummary.length,
          totalActiveAssignments: assignmentOverview.reduce((sum, caretaker) => sum + caretaker.activePatients, 0)
        }
      });

    } catch (error) {
      console.error('Get assignment overview report error:', error);
      res.status(500).json({
        error: 'Failed to get assignment overview report',
        details: error.message
      });
    }
  }
);

/**
 * GET /api/reports/mentor-overview
 * Get mentor authorization overview
 */
router.get('/mentor-overview',
  authenticate,
  authorize('reports', 'read'),
  async (req, res) => {
    try {
      const { organizationId } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let targetOrgId = organizationId;

      if (role === 'super_admin') {
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for super admin' });
        }
      } else if (['org_admin', 'care_manager'].includes(role)) {
        targetOrgId = req.profile.organizationId;
        if (organizationId && !organizationId.equals(req.profile.organizationId)) {
          return res.status(403).json({ error: 'Access denied to other organizations' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied to mentor reports' });
      }

      // Get mentor authorization overview
      const mentorOverview = await MentorAuthorization.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'mentorId',
            foreignField: '_id',
            as: 'mentor'
          }
        },
        { $unwind: '$mentor' },
        {
          $match: {
            'mentor.organizationId': mongoose.Types.ObjectId(targetOrgId)
          }
        },
        {
          $lookup: {
            from: 'profiles',
            localField: 'patientId',
            foreignField: '_id',
            as: 'patient'
          }
        },
        { $unwind: '$patient' },
        {
          $group: {
            _id: '$mentorId',
            mentorName: { $first: '$mentor.fullName' },
            mentorEmail: { $first: '$mentor.email' },
            totalPatients: { $sum: 1 },
            activeAuthorizations: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            revokedAuthorizations: {
              $sum: { $cond: [{ $eq: ['$status', 'revoked'] }, 1, 0] }
            },
            averagePermissions: { $avg: { $size: '$permissions' } },
            lastAuthorization: { $max: '$createdAt' }
          }
        },
        {
          $sort: { activeAuthorizations: -1 }
        }
      ]);

      // Get patient authorization summary
      const patientSummary = await MentorAuthorization.aggregate([
        {
          $lookup: {
            from: 'profiles',
            localField: 'patientId',
            foreignField: '_id',
            as: 'patient'
          }
        },
        { $unwind: '$patient' },
        {
          $match: {
            'patient.organizationId': mongoose.Types.ObjectId(targetOrgId)
          }
        },
        {
          $group: {
            _id: '$patientId',
            patientName: { $first: '$patient.fullName' },
            patientEmail: { $first: '$patient.email' },
            totalMentors: { $sum: 1 },
            activeMentors: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            }
          }
        },
        {
          $sort: { activeMentors: -1 }
        }
      ]);

      res.json({
        organizationId: targetOrgId,
        mentorOverview,
        patientSummary,
        summary: {
          totalMentors: mentorOverview.length,
          totalPatients: patientSummary.length,
          totalActiveAuthorizations: mentorOverview.reduce((sum, mentor) => sum + mentor.activeAuthorizations, 0)
        }
      });

    } catch (error) {
      console.error('Get mentor overview report error:', error);
      res.status(500).json({
        error: 'Failed to get mentor overview report',
        details: error.message
      });
    }
  }
);

module.exports = router;
