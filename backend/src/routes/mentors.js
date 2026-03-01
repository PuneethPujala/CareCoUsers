const express = require('express');
const Profile = require('../models/Profile');
const MentorAuthorization = require('../models/MentorAuthorization');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { 
  getMentorAuthorizedPatients, 
  updateMentorPermissions,
  checkMentorPermission,
  logMentorAccess
} = require('../services/mentorService');
const { logEvent, autoLogAccess } = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/mentors
 * Get mentors with role-based access control
 */
router.get('/', 
  authenticate, 
  authorize('mentors', 'read'),
  scopeFilter('mentors'),
  autoLogAccess('mentors', 'read'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query for mentors only
      let query = { 
        role: 'patient_mentor',
        ...req.scopeFilter
      };

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
      const mentors = await Profile.find(query)
        .populate('organizationId', 'name type')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Profile.countDocuments(query);

      res.json({
        mentors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get mentors error:', error);
      res.status(500).json({ 
        error: 'Failed to get mentors', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/mentors/:id
 * Get specific mentor with role-based access
 */
router.get('/:id', 
  authenticate, 
  authorize('mentors', 'read'),
  autoLogAccess('mentors', 'read'),
  async (req, res) => {
    try {
      const mentorId = req.params.id;
      
      // Check access permissions based on role
      const { role } = req.profile;
      let canAccess = false;

      // Super admin can access all mentors
      if (role === 'super_admin') {
        canAccess = true;
      }

      // Org admin and care manager can access mentors in their organization
      else if (['org_admin', 'care_manager'].includes(role)) {
        const mentor = await Profile.findById(mentorId);
        canAccess = mentor && 
                   mentor.organizationId && 
                   mentor.organizationId.equals(req.profile.organizationId);
      }

      // Mentor can access their own profile
      else if (role === 'patient_mentor') {
        canAccess = req.profile._id.toString() === mentorId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this mentor' });
      }

      // Get mentor details
      const mentor = await Profile.findById(mentorId)
        .populate('organizationId', 'name type settings');

      if (!mentor || mentor.role !== 'patient_mentor') {
        return res.status(404).json({ error: 'Mentor not found' });
      }

      res.json(mentor);

    } catch (error) {
      console.error('Get mentor error:', error);
      res.status(500).json({ 
        error: 'Failed to get mentor', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/mentors/:id/patients
 * Get all patients a mentor is authorized to access
 */
router.get('/:id/patients', 
  authenticate, 
  authorize('mentors', 'read'),
  autoLogAccess('mentors', 'read'),
  async (req, res) => {
    try {
      const mentorId = req.params.id;
      const { includeInactive = false } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const mentor = await Profile.findById(mentorId);
        canAccess = mentor && 
                   mentor.organizationId && 
                   mentor.organizationId.equals(req.profile.organizationId);
      } else if (role === 'patient_mentor') {
        canAccess = req.profile._id.toString() === mentorId; // Mentor checking their own authorizations
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this mentor' });
      }

      const patients = await getMentorAuthorizedPatients(req.profile, mentorId, {
        includeInactive: includeInactive === 'true'
      });

      res.json({ patients });

    } catch (error) {
      console.error('Get mentor patients error:', error);
      res.status(500).json({ 
        error: 'Failed to get mentor patients', 
        details: error.message 
      });
    }
  }
);

/**
 * PUT /api/mentors/:id/patients/:patientId/permissions
 * Update mentor permissions for a specific patient
 */
router.put('/:id/patients/:patientId/permissions', 
  authenticate, 
  authorize('mentors', 'update'),
  autoLogAccess('mentors', 'update'),
  async (req, res) => {
    try {
      const { id: mentorId, patientId } = req.params;
      const { permissions } = req.body;

      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ 
          error: 'Permissions array is required' 
        });
      }

      const authorization = await updateMentorPermissions(
        req.profile,
        mentorId,
        patientId,
        permissions,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Mentor permissions updated successfully',
        authorization
      });

    } catch (error) {
      console.error('Update mentor permissions error:', error);
      res.status(400).json({ 
        error: 'Failed to update mentor permissions', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/mentors/:id/patients/:patientId/permissions/check
 * Check if mentor has specific permission for patient
 */
router.get('/:id/patients/:patientId/permissions/check', 
  authenticate, 
  authorize('mentors', 'read'),
  autoLogAccess('mentors', 'read'),
  async (req, res) => {
    try {
      const { id: mentorId, patientId } = req.params;
      const { permission } = req.query;

      if (!permission) {
        return res.status(400).json({ 
          error: 'Permission parameter is required' 
        });
      }

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const mentor = await Profile.findById(mentorId);
        canAccess = mentor && 
                   mentor.organizationId && 
                   mentor.organizationId.equals(req.profile.organizationId);
      } else if (role === 'patient_mentor') {
        canAccess = req.profile._id.toString() === mentorId; // Mentor checking their own permissions
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this mentor' });
      }

      const hasPermission = await checkMentorPermission(mentorId, patientId, permission);

      res.json({ 
        hasPermission,
        permission,
        mentorId,
        patientId
      });

    } catch (error) {
      console.error('Check mentor permission error:', error);
      res.status(500).json({ 
        error: 'Failed to check mentor permission', 
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/mentors/:id/patients/:patientId/access-log
 * Log mentor access to patient data (called by other services)
 */
router.post('/:id/patients/:patientId/access-log', 
  authenticate, 
  authorize('mentors', 'read'),
  async (req, res) => {
    try {
      const { id: mentorId, patientId } = req.params;
      const { action } = req.body;

      if (!action) {
        return res.status(400).json({ 
          error: 'Action is required' 
        });
      }

      // Verify this is the mentor themselves or an admin
      const { role } = req.profile;
      let canLog = false;

      if (role === 'super_admin' || role === 'care_manager' || role === 'org_admin') {
        canLog = true;
      } else if (role === 'patient_mentor') {
        canLog = req.profile._id.toString() === mentorId;
      }

      if (!canLog) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const authorization = await logMentorAccess(mentorId, patientId, action, req);

      res.json({
        message: 'Access logged successfully',
        authorization
      });

    } catch (error) {
      console.error('Log mentor access error:', error);
      res.status(500).json({ 
        error: 'Failed to log mentor access', 
        details: error.message 
      });
    }
  }
);

module.exports = router;
