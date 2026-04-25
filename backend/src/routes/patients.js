const express = require('express');
const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
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
        status = 'active',
        organizationId,
        unassigned
      } = req.query;

      // Build query for patients only
      let query = {
        ...req.scopeFilter,
        is_active: status === 'active'
      };

      // Apply super admin isolated organization mapping filter
      if (organizationId && req.profile.role === 'super_admin') {
        query.organization_id = organizationId;
      }

      // 🚨 CRITICAL: Extract Unassigned Queue Interceptor
      if (unassigned === 'true') {
        const CaretakerPatient = require('../models/CaretakerPatient');

        // Target targetOrgId appropriately
        let targetOrgId = organizationId;
        if (req.profile.role !== 'super_admin') {
          targetOrgId = req.profile.organizationId;
        }

        // Find all active caretaker assignments inside this Organization
        // We only care about patients who lack an active mapping!
        const activeAssignedPatients = await CaretakerPatient.find({ status: 'active' }).distinct('patientId');

        // Exclude all patients who exist inside active assignment mappings
        query._id = { $nin: activeAssignedPatients };

        // Fallback safety to ensure we only show unassigned for the specific manager's organization
        if (targetOrgId) {
          query.organization_id = targetOrgId;
        }
      }

      // Apply search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const patients = await Patient.find(query)
        .populate('organization_id', 'name type')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Patient.countDocuments(query);

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
        const patient = await Patient.findById(patientId);

        const orgIdStr = typeof req.profile.organizationId === 'object' && req.profile.organizationId !== null
          ? (req.profile.organizationId._id || req.profile.organizationId.id).toString()
          : String(req.profile.organizationId);

        const patOrgIdStr = typeof patient?.organization_id === 'object' && patient?.organization_id !== null
          ? (patient.organization_id._id || patient.organization_id.id).toString()
          : String(patient?.organization_id);

        canAccess = patient && patOrgIdStr && patOrgIdStr === orgIdStr;
      }

      // Caretaker & Caller can access assigned patients
      else if (role === 'caretaker' || role === 'caller') {
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

      // Get patient details initially from Patient collection
      let patient = await Patient.findOne({
          $or: [{ _id: patientId }, { profile_id: patientId }]
      })
        .populate('organization_id', 'name type settings')
        .populate('profile_id', 'conditions phone email fullName avatarUrl');

      let patientData;
      const Medication = require('../models/Medication');

      if (!patient) {
        // Fallback: If no Patient document exists AT ALL, just return Profile data
        const Profile = require('../models/Profile');
        const profile = await Profile.findById(patientId).populate('organizationId', 'name type settings');
        if (!profile) {
          return res.status(404).json({ error: 'Patient not found' });
        }
        patientData = profile.toJSON();
        patientData.name = profile.fullName; // match patient schema
        patientData.organization_id = profile.organizationId;
        patientData.is_active = profile.isActive;
        patientData.metadata = profile.metadata || {};
      } else {
        patientData = patient.toJSON();
        patientData.metadata = patientData.metadata || {};
        // Merge phone/email/name from the linked Profile if missing on the Patient doc
        if (patient.profile_id) {
            if (!patientData.phone) patientData.phone = patient.profile_id.phone;
            if (!patientData.email) patientData.email = patient.profile_id.email;
            if (!patientData.name && !patientData.fullName) patientData.fullName = patient.profile_id.fullName;
        }
      }

      // Merge existing root conditions with profile conditions
      const existingConditions = Array.isArray(patientData.metadata.conditions) ? patientData.metadata.conditions : (Array.isArray(patientData.conditions) ? patientData.conditions : []);
      const profileConditions = patient && patient.profile_id && Array.isArray(patient.profile_id.conditions) ? patient.profile_id.conditions : [];
      patientData.metadata.conditions = [...existingConditions, ...profileConditions];

      // Merge existing root medications with Medication collection
      const existingMeds = Array.isArray(patientData.metadata.medications) ? patientData.metadata.medications : (Array.isArray(patientData.medications) ? patientData.medications : []);

      const searchIds = [patientId];
      if (patient && patient.profile_id) {
        const profileIdStr = typeof patient.profile_id === 'object' ? (patient.profile_id._id || patient.profile_id).toString() : patient.profile_id.toString();
        if (profileIdStr !== patientId.toString()) {
          searchIds.push(profileIdStr);
        }
      }

      const externalMeds = await Medication.find({ patientId: { $in: searchIds }, isActive: true }).lean();
      patientData.metadata.medications = [...externalMeds, ...existingMeds]; // Put external meds first so unique() in frontend keeps the updated ones

      // --- DYNAMIC MEDICINELOG MERGE ---
      // The frontend reads med.takenLogs[].date to decide green checkmarks.
      // MedicineLog is the true source of truth for daily adherence.
      // Merge today's MedicineLog entries into each medication's takenLogs.
      try {
          const MedicineLog = require('../models/MedicineLog');
          const _now = new Date();
          const _y = _now.getFullYear();
          const _m = String(_now.getMonth() + 1).padStart(2, '0');
          const _d = String(_now.getDate()).padStart(2, '0');
          const todayStr = `${_y}-${_m}-${_d}`;
          const today = new Date(`${todayStr}T00:00:00.000Z`);

          const truePatientId = patient ? patient._id : patientId;
          const todayLog = await MedicineLog.findOne({ patient_id: truePatientId, date: today }).lean();

          if (todayLog && todayLog.medicines) {
              patientData.metadata.medications = patientData.metadata.medications.map(m => {
                  const mObj = (m && typeof m.toJSON === 'function') ? m.toJSON() : { ...m };
                  const mName = mObj.name || mObj.genericName || mObj.medicine_name;
                  if (!mName) return mObj;

                  // Find ANY taken entry for this med name in the MedicineLog
                  const takenEntry = todayLog.medicines.find(l => l.medicine_name === mName && l.taken);

                  if (takenEntry) {
                      const logArray = Array.isArray(mObj.takenLogs) ? [...mObj.takenLogs] : [];
                      if (!logArray.some(l => l.date === todayStr)) {
                          logArray.push({
                              date: todayStr,
                              timestamp: takenEntry.taken_at || new Date().toISOString()
                          });
                      }
                      mObj.takenLogs = logArray;

                      const dateArray = Array.isArray(mObj.takenDates) ? [...mObj.takenDates] : [];
                      if (!dateArray.includes(todayStr)) dateArray.push(todayStr);
                      mObj.takenDates = dateArray;
                  }
                  return mObj;
              });
          }
      } catch (mergeErr) {
          console.error('Error merging MedicineLog:', mergeErr);
      }

      res.json(patientData);

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
      const patient = new Patient({
        supabase_uid: supabaseUid,
        email,
        name: fullName,
        organization_id: targetOrgId,
        phone: phone || null,
        metadata: metadata || {},
        is_active: true
      });

      await patient.save();

      // Update organization patient count
      const Organization = require('../models/Organization');
      await Organization.findByIdAndUpdate(targetOrgId, {
        $inc: { currentPatientCount: 1 }
      });

      // --- [START] ZERO-TOUCH ROUND-ROBIN ASSIGNMENT ---
      try {
        const Profile = require('../models/Profile');
        const CaretakerPatient = require('../models/CaretakerPatient');

        // 1. Fetch available callers explicitly mapped to this organization
        const callers = await Profile.find({
          organizationId: targetOrgId,
          role: { $in: ['caller', 'caretaker'] },
          isActive: { $ne: false }
        });

        if (callers && callers.length > 0) {
          // 2. Map and aggregate current active assignments per caller
          const callerIds = callers.map(c => c._id);
          const assignmentCounts = await CaretakerPatient.aggregate([
            {
              $match: {
                caretakerId: { $in: callerIds },
                status: 'active'
              }
            },
            { $group: { _id: '$caretakerId', count: { $sum: 1 } } }
          ]);

          const mapCounts = {};
          assignmentCounts.forEach(doc => {
            mapCounts[doc._id.toString()] = doc.count;
          });

          // 3. Find the least burdened caller
          let assignedCaller = callers[0];
          let minCount = mapCounts[assignedCaller._id.toString()] || 0;

          for (let i = 1; i < callers.length; i++) {
            const count = mapCounts[callers[i]._id.toString()] || 0;
            if (count < minCount) {
              minCount = count;
              assignedCaller = callers[i];
            }
          }

          // 4. Directly create CaretakerPatient mapping (bypasses Profile-based validation)
          if (minCount < 30) {
            // Resolve the caller's care manager for patient app visibility
            const callerProfile = await Profile.findById(assignedCaller._id).select('managedBy').lean();
            const callerManagerId = callerProfile?.managedBy || null;

            await CaretakerPatient.findOneAndUpdate(
              { caretakerId: assignedCaller._id, patientId: patient._id },
              {
                caretakerId: assignedCaller._id,
                patientId: patient._id,
                careManagerId: callerManagerId,
                assignedBy: req.profile._id,
                status: 'active',
                notes: [{ content: 'System Auto-Assigned (Round-Robin) by Load Balancer', addedBy: req.profile._id }],
                schedule: { startDate: new Date() }
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            // Sync with Patient model for users app visibility
            patient.assigned_caller_id = assignedCaller._id;
            patient.caller_id = assignedCaller._id;
            if (callerManagerId) {
              patient.care_manager_id = callerManagerId;
              patient.assigned_manager_id = callerManagerId;
            }
            await patient.save();

            console.log(`[Auto-Assign] Patient ${patient.name} → Caller ${assignedCaller.fullName}`);
          } else {
            console.warn(`[Auto-Assign Warning] All Callers at full capacity (30 limit) for Org ${targetOrgId}`);
          }
        }
      } catch (autoAssignErr) {
        console.error('[Auto-Assign] System load-balancer failed routing silently:', autoAssignErr);
      }
      // --- [END] ZERO-TOUCH ROUND-ROBIN ASSIGNMENT ---

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
        const patient = await Patient.findById(patientId);
        canAccess = patient &&
          patient.organization_id &&
          patient.organization_id.equals(req.profile.organizationId);
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
      if (fullName !== undefined) updateData.name = fullName;
      if (phone !== undefined) updateData.phone = phone;
      if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
      if (metadata !== undefined) updateData.metadata = metadata;

      // Only admins can change active status
      if (['super_admin', 'org_admin', 'care_manager'].includes(role)) {
        if (isActive !== undefined) updateData.is_active = isActive;
      }

      // Update patient
      const updatedPatient = await Patient.findByIdAndUpdate(
        patientId,
        updateData,
        { new: true, runValidators: true }
      ).populate('organization_id', 'name type');

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

/**
 * POST /api/patients/:id/medications/:medId/toggle
 * Toggle medication adherence for a specific date
 */
router.post('/:id/medications/:medId/toggle',
  authenticate,
  async (req, res) => {
    try {
      const patientId = req.params.id;
      const medId = req.params.medId;
      const { date, time } = req.body;

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Valid date required (YYYY-MM-DD format)' });
      }

      // Role check explicitly allows caller/caretaker/mentor to track, or the patient themselves
      const { role } = req.profile;
      let canAccess = false;
      if (role === 'super_admin') {
        canAccess = true;
      } else if (['org_admin', 'care_manager'].includes(role)) {
        const patient = await Patient.findById(patientId);
        canAccess = patient && patient.organization_id && patient.organization_id.equals(req.profile.organizationId);
      } else if (role === 'caretaker' || role === 'caller') {
        const assignment = await CaretakerPatient.findOne({ caretakerId: req.profile._id, patientId: patientId, status: 'active' });
        canAccess = !!assignment;
      } else if (role === 'patient_mentor') {
        const auth = await MentorAuthorization.findOne({ mentorId: req.profile._id, patientId: patientId, status: 'active' });
        canAccess = !!auth;
      } else if (role === 'patient') {
        canAccess = req.profile._id.toString() === patientId;
      }

      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // --- Helper to sync with Daily Checklist (MedicineLog) ---
      const syncMedicineLogHelper = async (pId, d, t, mName, isTaken, role) => {
        try {
          const MedicineLog = require('../models/MedicineLog');
          const targetDate = new Date(d);
          targetDate.setHours(0, 0, 0, 0);

          const log = await MedicineLog.findOne({
            patient_id: pId,
            date: targetDate
          });

          if (log) {
            let bucket = 'morning';
            if (t) {
              const hour = parseInt(t.split(':')[0], 10);
              if (hour >= 12 && hour < 17) bucket = 'afternoon';
              else if (hour >= 17) bucket = 'night';
            }

            const dailyMed = log.medicines.find(m =>
              m.medicine_name === mName && m.scheduled_time === bucket
            ) || log.medicines.find(m => m.medicine_name === mName);

            if (dailyMed) {
              dailyMed.taken = isTaken;
              dailyMed.taken_at = isTaken ? (t ? new Date(d + 'T' + t) : new Date()) : null;
              dailyMed.marked_by = ['caller', 'care_manager', 'org_admin', 'super_admin'].includes(role) ? 'caller' : 'patient';

              await log.save();
              console.log(`[MedicineLog Sync] Updated ${mName} to taken=${isTaken} by ${dailyMed.marked_by}`);
            }
          }
        } catch (syncLogErr) {
          console.error('MedicineLog sync error during toggle:', syncLogErr);
        }
      };
      // ---------------------------------------------------------

      const Medication = require('../models/Medication');
      const mongoose = require('mongoose');
      let med = null;
      if (mongoose.Types.ObjectId.isValid(medId)) {
        med = await Medication.findById(medId);
      }

      if (!med) {
        // Fallback: Check if the medication is embedded inside the Profile model natively
        const Profile = require('../models/Profile');
        let fallbackTarget = await Profile.findById(patientId);

        let foundMed = false;
        let hasTaken = false;
        let isProfileMeta = true;

        if (fallbackTarget && fallbackTarget.metadata && fallbackTarget.metadata.medications) {
          const m = fallbackTarget.metadata.medications.find(x => (x._id && x._id.toString() === medId) || x.id === medId);
          if (m) {
            foundMed = true;
            m.takenLogs = m.takenLogs || [];
            const existingLogIndex = m.takenLogs.findIndex(l => l.date === date);

            if (existingLogIndex >= 0) {
              m.takenLogs.splice(existingLogIndex, 1);
              hasTaken = true;
            } else {
              m.takenLogs.push({ date, timestamp: time ? new Date(date + 'T' + time) : new Date() });
            }

            fallbackTarget.markModified('metadata.medications');
            await fallbackTarget.save();
            await syncMedicineLogHelper(patientId, date, time, m.name, !hasTaken, req.profile.role);
            return res.json({ message: 'Toggled successfully', medication: m, isTakenOffset: !hasTaken });
          }
        }

        // Second Fallback: Check if the medication is embedded inside the Patient model
        if (!foundMed) {
          const PatientModel = require('../models/Patient');
          fallbackTarget = await PatientModel.findById(patientId);
          if (fallbackTarget && fallbackTarget.get('medications')) {
            const medsList = fallbackTarget.get('medications');
            const m = medsList.find(x => (x._id && x._id.toString() === medId) || x.id === medId);
            if (m) {
              foundMed = true;
              m.takenLogs = m.takenLogs || [];
              const existingLogIndex = m.takenLogs.findIndex(l => l.date === date);

              if (existingLogIndex >= 0) {
                m.takenLogs.splice(existingLogIndex, 1);
                hasTaken = true;
              } else {
                m.takenLogs.push({ date, timestamp: time ? new Date(date + 'T' + time) : new Date() });
              }

              fallbackTarget.markModified('medications');
              await fallbackTarget.save();
              await syncMedicineLogHelper(patientId, date, time, m.name, !hasTaken, req.profile.role);
              return res.json({ message: 'Toggled successfully', medication: m, isTakenOffset: !hasTaken });
            }
          }
          if (fallbackTarget && fallbackTarget.get('metadata') && fallbackTarget.get('metadata').medications) {
            const medsList = fallbackTarget.get('metadata').medications;
            const m = medsList.find(x => (x._id && x._id.toString() === medId) || x.id === medId);
            if (m) {
              foundMed = true;
              m.takenLogs = m.takenLogs || [];
              const existingLogIndex = m.takenLogs.findIndex(l => l.date === date);

              if (existingLogIndex >= 0) {
                m.takenLogs.splice(existingLogIndex, 1);
                hasTaken = true;
              } else {
                m.takenLogs.push({ date, timestamp: time ? new Date(date + 'T' + time) : new Date() });
              }

              fallbackTarget.markModified('metadata.medications');
              await fallbackTarget.save();
              await syncMedicineLogHelper(patientId, date, time, m.name, !hasTaken, req.profile.role);
              return res.json({ message: 'Toggled successfully', medication: m, isTakenOffset: !hasTaken });
            }
          }
        }

        if (!foundMed) {
          return res.status(404).json({ error: 'Medication not found in any database' });
        }
      } else {
        const existingLog = med.takenLogs ? med.takenLogs.find(l => l.date === date) : null;
        let updatedMed;
        if (existingLog) {
          updatedMed = await Medication.findByIdAndUpdate(medId, { $pull: { takenLogs: { date: date } } }, { new: true });
        } else {
          const timestamp = time ? new Date(date + 'T' + time) : new Date();
          updatedMed = await Medication.findByIdAndUpdate(medId, { $addToSet: { takenLogs: { date: date, timestamp: timestamp } } }, { new: true });
        }

        // --- SYNC TO EMBEDDED PATIENT DOCS FOR USERS-APP VISIBILITY ---
        try {
          const PatientModel = require('../models/Patient');
          let pTarget = await PatientModel.findById(patientId);
          if (pTarget) {
            let synced = false;
            if (pTarget.get('medications')) {
              const mList = pTarget.get('medications');
              const m = mList.find(x => (x._id && x._id.toString() === medId) || x.id === medId);
              if (m) {
                m.takenLogs = m.takenLogs || [];
                const idx = m.takenLogs.findIndex(l => l.date === date);
                if (idx >= 0 && existingLog) {
                  m.takenLogs.splice(idx, 1);
                } else if (!existingLog && idx < 0) {
                  m.takenLogs.push({ date, timestamp: time ? new Date(date + 'T' + time) : new Date() });
                }
                pTarget.markModified('medications');
                synced = true;
              }
            }
            if (pTarget.get('metadata') && pTarget.get('metadata').medications) {
              const mList = pTarget.get('metadata').medications;
              const m = mList.find(x => (x._id && x._id.toString() === medId) || x.id === medId);
              if (m) {
                m.takenLogs = m.takenLogs || [];
                const idx = m.takenLogs.findIndex(l => l.date === date);
                if (idx >= 0 && existingLog) {
                  m.takenLogs.splice(idx, 1);
                } else if (!existingLog && idx < 0) {
                  m.takenLogs.push({ date, timestamp: time ? new Date(date + 'T' + time) : new Date() });
                }
                pTarget.markModified('metadata.medications');
                synced = true;
              }
            }
            if (synced) await pTarget.save();
          }
        } catch (syncErr) {
          console.error('Patient embedded sync error during toggle:', syncErr);
        }
        // -------------------------------------------------------------

        await syncMedicineLogHelper(patientId, date, time, updatedMed.name, !existingLog, req.profile.role);

        return res.json({ message: 'Toggled successfully', medication: updatedMed, isTakenOffset: !existingLog });
      }
    } catch (error) {
      console.error('Toggle error:', error);
      res.status(500).json({ error: 'Failed to toggle medication.' });
    }
  }
);

module.exports = router;
