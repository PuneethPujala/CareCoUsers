const express = require('express');
const Profile = require('../models/Profile');
const CaretakerPatient = require('../models/CaretakerPatient');
const MentorAuthorization = require('../models/MentorAuthorization');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { scopeFilter } = require('../middleware/scopeFilter');
const { assignPatientToCaretaker, unassignPatientFromCaretaker, getPatientCaretakers } = require('../services/caretakerService');
const { authorizeMentor, revokeMentorAuthorization, getPatientAuthorizedMentors } = require('../services/mentorService');
const { logEvent, autoLogAccess } = require('../services/auditService');

const router = express.Router();

/**
 * GET /api/patients
 * Get patients with role-based access control
 */
router.get('/', 
  authenticate, 
  authorize('patients', 'read'),
  scopeFilter('patients'),
  autoLogAccess('patients', 'read'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        status = 'active'
      } = req.query;

      // Build query for patients only
      let query = { 
        role: 'patient',
        ...req.scopeFilter,
        isActive: status === 'active'
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
      const patients = await Profile.find(query)
        .populate('organizationId', 'name type')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Profile.countDocuments(query);

      res.json({
        patients,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get patients error:', error);
      res.status(500).json({ 
        error: 'Failed to get patients', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/patients/:id
 * Get specific patient with role-based access
 */
router.get('/:id', 
  authenticate, 
  authorize('patients', 'read'),
  autoLogAccess('patients', 'read'),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      
      // Check access permissions based on role
      const { role } = req.profile;
      let canAccess = false;

      // Super admin can access all patients
      if (role === 'super_admin') {
        canAccess = true;
      }

      // Org admin and care manager can access patients in their organization
      else if (['org_admin', 'care_manager'].includes(role)) {
        const patient = await Profile.findById(patientId);
        canAccess = patient && 
                   patient.organizationId && 
                   patient.organizationId.equals(req.profile.organizationId);
      }

      // Caretaker can access assigned patients
      else if (role === 'caretaker') {
        const assignment = await CaretakerPatient.findOne({
          caretakerId: req.profile._id,
          patientId: patientId,
          status: 'active'
        });
        canAccess = !!assignment;
      }

      // Patient mentor can access authorized patients
      else if (role === 'patient_mentor') {
        const authorization = await MentorAuthorization.findOne({
          mentorId: req.profile._id,
          patientId: patientId,
          status: 'active'
        });
        canAccess = !!authorization;
      }

      // Patient can access their own profile
      else if (role === 'patient') {
        canAccess = req.profile._id.toString() === patientId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this patient' });
      }

      // Get patient details
      const patient = await Profile.findById(patientId)
        .populate('organizationId', 'name type settings');

      if (!patient || patient.role !== 'patient') {
        return res.status(404).json({ error: 'Patient not found' });
      }

      res.json(patient);

    } catch (error) {
      console.error('Get patient error:', error);
      res.status(500).json({ 
        error: 'Failed to get patient', 
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/patients
 * Create new patient (admin/care manager only)
 */
router.post('/', 
  authenticate, 
  authorize('patients', 'create'),
  autoLogAccess('patients', 'create'),
  async (req, res) => {
    try {
      const {
        supabaseUid,
        email,
        fullName,
        phone,
        organizationId,
        metadata
      } = req.body;

      // Validate required fields
      if (!supabaseUid || !email || !fullName) {
        return res.status(400).json({ 
          error: 'Missing required fields: supabaseUid, email, fullName' 
        });
      }

      // Check organization access
      let targetOrgId = organizationId;
      if (req.profile.role !== 'super_admin') {
        targetOrgId = req.profile.organizationId;
      } else if (organizationId) {
        targetOrgId = organizationId;
      } else {
        return res.status(400).json({ 
          error: 'Organization ID is required for patient creation' 
        });
      }

      // Create patient profile
      const patient = new Profile({
        supabaseUid,
        email,
        fullName,
        role: 'patient',
        organizationId: targetOrgId,
        phone: phone || null,
        metadata: metadata || {},
        emailVerified: true
      });

      await patient.save();

      // Update organization patient count
      const Organization = require('../models/Organization');
      await Organization.findByIdAndUpdate(targetOrgId, {
        $inc: { currentPatientCount: 1 }
      });

      // Log patient creation
      await logEvent(req.profile.supabaseUid, 'patient_created', 'patient', patient._id, req, {
        patientEmail: email,
        organizationId: targetOrgId
      });

      res.status(201).json({
        message: 'Patient created successfully',
        patient
      });

    } catch (error) {
      console.error('Create patient error:', error);
      res.status(500).json({ 
        error: 'Failed to create patient', 
        details: error.message 
      });
    }
  }
);

/**
 * PUT /api/patients/:id
 * Update patient information
 */
router.put('/:id', 
  authenticate, 
  authorize('patients', 'update'),
  autoLogAccess('patients', 'update'),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const {
        fullName,
        phone,
        avatarUrl,
        isActive,
        metadata
      } = req.body;

      // Check access permissions (same logic as GET)
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const patient = await Profile.findById(patientId);
        canAccess = patient && 
                   patient.organizationId && 
                   patient.organizationId.equals(req.profile.organizationId);
      } else if (role === 'caretaker') {
        const assignment = await CaretakerPatient.findOne({
          caretakerId: req.profile._id,
          patientId: patientId,
          status: 'active'
        });
        canAccess = !!assignment;
      } else if (role === 'patient_mentor') {
        const authorization = await MentorAuthorization.findOne({
          mentorId: req.profile._id,
          patientId: patientId,
          status: 'active'
        });
        canAccess = !!authorization;
      } else if (role === 'patient') {
        canAccess = req.profile._id.toString() === patientId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this patient' });
      }

      // Build update data
      const updateData = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (phone !== undefined) updateData.phone = phone;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (metadata !== undefined) updateData.metadata = metadata;

      // Only admins can change active status
      if (['super_admin', 'org_admin', 'care_manager'].includes(role)) {
        if (isActive !== undefined) updateData.isActive = isActive;
      }

      // Update patient
      const updatedPatient = await Profile.findByIdAndUpdate(
        patientId,
        updateData,
        { new: true, runValidators: true }
      ).populate('organizationId', 'name type');

      // Log patient update
      await logEvent(req.profile.supabaseUid, 'patient_updated', 'patient', patientId, req, {
        updatedFields: Object.keys(updateData)
      });

      res.json({
        message: 'Patient updated successfully',
        patient: updatedPatient
      });

    } catch (error) {
      console.error('Update patient error:', error);
      res.status(500).json({ 
        error: 'Failed to update patient', 
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/patients/:caretakerId/assign/:patientId
 * Assign patient to caretaker
 */
router.post('/:caretakerId/assign/:patientId', 
  authenticate, 
  authorize('patients', 'assign'),
  autoLogAccess('patients', 'assign'),
  async (req, res) => {
    try {
      const { caretakerId, patientId } = req.params;
      const assignmentData = {
        ...req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const assignment = await assignPatientToCaretaker(
        req.profile,
        caretakerId,
        patientId,
        assignmentData
      );

      res.status(201).json({
        message: 'Patient assigned to caretaker successfully',
        assignment
      });

    } catch (error) {
      console.error('Assign patient error:', error);
      res.status(400).json({ 
        error: 'Failed to assign patient', 
        details: error.message 
      });
    }
  }
);

/**
 * DELETE /api/patients/:caretakerId/unassign/:patientId
 * Unassign patient from caretaker
 */
router.delete('/:caretakerId/unassign/:patientId', 
  authenticate, 
  authorize('patients', 'assign'),
  autoLogAccess('patients', 'assign'),
  async (req, res) => {
    try {
      const { caretakerId, patientId } = req.params;
      const { reason = '' } = req.body;

      const assignment = await unassignPatientFromCaretaker(
        req.profile,
        caretakerId,
        patientId,
        reason,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Patient unassigned from caretaker successfully',
        assignment
      });

    } catch (error) {
      console.error('Unassign patient error:', error);
      res.status(400).json({ 
        error: 'Failed to unassign patient', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/patients/:id/caretakers
 * Get all caretakers assigned to a patient
 */
router.get('/:id/caretakers', 
  authenticate, 
  authorize('patients', 'read'),
  autoLogAccess('patients', 'read'),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const { includeInactive = false } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const patient = await Profile.findById(patientId);
        canAccess = patient && 
                   patient.organizationId && 
                   patient.organizationId.equals(req.profile.organizationId);
      } else if (role === 'caretaker') {
        canAccess = req.profile._id.toString() === patientId; // Caretaker checking their own patient assignments
      } else if (role === 'patient_mentor') {
        const authorization = await MentorAuthorization.findOne({
          mentorId: req.profile._id,
          patientId: patientId,
          status: 'active'
        });
        canAccess = !!authorization;
      } else if (role === 'patient') {
        canAccess = req.profile._id.toString() === patientId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this patient' });
      }

      const caretakers = await getPatientCaretakers(req.profile, patientId, {
        includeInactive: includeInactive === 'true'
      });

      res.json({ caretakers });

    } catch (error) {
      console.error('Get patient caretakers error:', error);
      res.status(500).json({ 
        error: 'Failed to get patient caretakers', 
        details: error.message 
      });
    }
  }
);

/**
 * POST /api/patients/:id/mentors/authorize
 * Authorize a mentor for a patient
 */
router.post('/:id/mentors/authorize', 
  authenticate, 
  authorize('patients', 'authorize'),
  autoLogAccess('patients', 'authorize'),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const { mentorId, relationship, permissions, accessSchedule } = req.body;

      if (!mentorId || !relationship) {
        return res.status(400).json({ 
          error: 'Missing required fields: mentorId, relationship' 
        });
      }

      const authorization = await authorizeMentor(
        req.profile,
        mentorId,
        patientId,
        {
          relationship,
          permissions,
          accessSchedule,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.status(201).json({
        message: 'Mentor authorized successfully',
        authorization
      });

    } catch (error) {
      console.error('Authorize mentor error:', error);
      res.status(400).json({ 
        error: 'Failed to authorize mentor', 
        details: error.message 
      });
    }
  }
);

/**
 * DELETE /api/patients/:id/mentors/:mentorId/revoke
 * Revoke mentor authorization for a patient
 */
router.delete('/:id/mentors/:mentorId/revoke', 
  authenticate, 
  authorize('patients', 'revoke'),
  autoLogAccess('patients', 'revoke'),
  async (req, res) => {
    try {
      const { id: patientId, mentorId } = req.params;
      const { reason = '' } = req.body;

      const authorization = await revokeMentorAuthorization(
        req.profile,
        mentorId,
        patientId,
        reason,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      res.json({
        message: 'Mentor authorization revoked successfully',
        authorization
      });

    } catch (error) {
      console.error('Revoke mentor error:', error);
      res.status(400).json({ 
        error: 'Failed to revoke mentor authorization', 
        details: error.message 
      });
    }
  }
);

/**
 * GET /api/patients/:id/mentors
 * Get all mentors authorized for a patient
 */
router.get('/:id/mentors', 
  authenticate, 
  authorize('patients', 'read'),
  autoLogAccess('patients', 'read'),
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const { includeInactive = false } = req.query;

      // Check access permissions
      const { role } = req.profile;
      let canAccess = false;

      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const patient = await Profile.findById(patientId);
        canAccess = patient && 
                   patient.organizationId && 
                   patient.organizationId.equals(req.profile.organizationId);
      } else if (role === 'patient_mentor') {
        canAccess = req.profile._id.toString() === patientId; // Mentor checking their own authorizations
      } else if (role === 'patient') {
        canAccess = req.profile._id.toString() === patientId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this patient' });
      }

      const mentors = await getPatientAuthorizedMentors(req.profile, patientId, {
        includeInactive: includeInactive === 'true'
      });

      res.json({ mentors });

    } catch (error) {
      console.error('Get patient mentors error:', error);
      res.status(500).json({ 
        error: 'Failed to get patient mentors', 
        details: error.message 
      });
    }
  }
);

module.exports = router;
