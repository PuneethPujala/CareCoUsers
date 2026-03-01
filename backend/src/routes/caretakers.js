const express = require('express');
const Profile = require('../models/Profile');
const CaretakerPatient = require('../models/CaretakerPatient');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { getCaretakerPatients, addAssignmentNote } = require('../services/caretakerService');
const { logEvent, autoLogAccess } = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/caretakers
 * Get caretakers with role-based access control
 */
router.get('/', 
  authenticate, 
  authorize('caretakers', 'read'),
  scopeFilter('caretakers'),
  autoLogAccess('caretakers', 'read'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query for caretakers only
      let query = { 
        role: 'caretaker',
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
      const caretakers = await Profile.find(query)
        .populate('organizationId', 'name type')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Profile.countDocuments(query);

      res.json({
        caretakers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get caretakers error:', error);
      res.status(500).json({ 
        error: 'Failed to get caretakers', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/caretakers/:id
 * Get specific caretaker with role-based access
 */
router.get('/:id', 
  authenticate, 
  authorize('caretakers', 'read'),
  autoLogAccess('caretakers', 'read'),
  async (req, res) => {
    try {
      const caretakerId = req.params.id;
      
      // Check access permissions based on role
      const { role } = req.profile;
      let canAccess = false;

      // Super admin can access all caretakers
      if (role === 'super_admin') {
        canAccess = true;
      }

      // Org admin and care manager can access caretakers in their organization
      else if (['org_admin', 'care_manager'].includes(role)) {
        const caretaker = await Profile.findById(caretakerId);
        canAccess = caretaker && 
                   caretaker.organizationId && 
                   caretaker.organizationId.equals(req.profile.organizationId);
      }

      // Caretaker can access their own profile
      else if (role === 'caretaker') {
        canAccess = req.profile._id.toString() === caretakerId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this caretaker' });
      }

      // Get caretaker details
      const caretaker = await Profile.findById(caretakerId)
        .populate('organizationId', 'name type settings');

      if (!caretaker || caretaker.role !== 'caretaker') {
        return res.status(404).json({ error: 'Caretaker not found' });
      }

      res.json(caretaker);

    } catch (error) {
      console.error('Get caretaker error:', error);
      res.status(500).json({ 
        error: 'Failed to get caretaker', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/caretakers/:id/patients
 * Get all patients assigned to a caretaker
 */
router.get('/:id/patients', 
  authenticate, 
  authorize('caretakers', 'read'),
  autoLogAccess('caretakers', 'read'),
  async (req, res) => {
    try {
      const caretakerId = req.params.id;
      const { includeInactive = false } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const caretaker = await Profile.findById(caretakerId);
        canAccess = caretaker && 
                   caretaker.organizationId && 
                   caretaker.organizationId.equals(req.profile.organizationId);
      } else if (role === 'caretaker') {
        canAccess = req.profile._id.toString() === caretakerId; // Caretaker checking their own assignments
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this caretaker' });
      }

      const patients = await getCaretakerPatients(req.profile, caretakerId, {
        includeInactive: includeInactive === 'true'
      });

      res.json({ patients });

    } catch (error) {
      console.error('Get caretaker patients error:', error);
      res.status(500).json({ 
        error: 'Failed to get caretaker patients', 
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/caretakers/:id/patients/:patientId/notes
 * Add note to caretaker-patient assignment
 */
router.post('/:id/patients/:patientId/notes', 
  authenticate, 
  authorize('caretakers', 'update'),
  autoLogAccess('caretakers', 'update'),
  async (req, res) => {
    try {
      const { id: caretakerId, patientId } = req.params;
      const { content, isPrivate = false } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ 
          error: 'Note content is required' 
        });
      }

      const assignment = await addAssignmentNote(
        req.profile,
        caretakerId,
        patientId,
        content.trim(),
        isPrivate
      );

      res.status(201).json({
        message: 'Note added successfully',
        assignment
      });

    } catch (error) {
      console.error('Add assignment note error:', error);
      res.status(400).json({ 
        error: 'Failed to add note', 
        details: error.message 
      });
    }
  }
);

module.exports = router;
