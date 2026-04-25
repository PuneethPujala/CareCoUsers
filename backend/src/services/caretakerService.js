const CaretakerPatient = require('../models/CaretakerPatient');
const Profile = require('../models/Profile');
const AuditLog = require('../models/AuditLog');
const Organization = require('../models/Organization');
const Patient = require('../models/Patient');

/**
 * Assign a patient to a caretaker
 * @param {Object} callerProfile - Profile of the user making the assignment
 * @param {string} caretakerId - ID of the caretaker
 * @param {string} patientId - ID of the patient
 * @param {Object} assignmentData - Additional assignment data
 * @returns {Object} The created/updated assignment
 */
const assignPatientToCaretaker = async (callerProfile, caretakerId, patientId, assignmentData = {}) => {
  // Validate caller permissions
  if (callerProfile.role !== 'care_manager' && callerProfile.role !== 'org_admin' && callerProfile.role !== 'super_admin') {
    throw new Error('Only Care Managers, Org Admins, and Super Admins can assign patients');
  }

  const caretaker = await Profile.findById(caretakerId).populate('organizationId');

  // Try Profile first, then fall back to Patient collection
  let patient = await Profile.findById(patientId).populate('organizationId');
  let patientIsFromPatientCollection = false;
  if (!patient) {
    const patientDoc = await Patient.findById(patientId).populate('organization_id');
    if (patientDoc) {
      patientIsFromPatientCollection = true;
      // Build a compatible object for validation
      patient = {
        _id: patientDoc._id,
        role: 'patient',
        fullName: patientDoc.name,
        organizationId: patientDoc.organization_id,
        email: patientDoc.email,
        phone: patientDoc.phone,
      };
    }
  }

  if (!caretaker || !patient) {
    throw new Error('Caretaker and Patient must exist');
  }

  if (!['caretaker', 'caller', 'care_manager'].includes(caretaker.role)) {
    throw new Error('Assigned user must have a caretaking role (caretaker, caller, care_manager)');
  }

  if (patient.role !== 'patient') {
    throw new Error('Assigned patient must have patient role');
  }

  // Check organization access permissions (safe string comparison)
  const caretakerOrgId = (caretaker.organizationId?._id || caretaker.organizationId || '').toString();
  const patientOrgId = (patient.organizationId?._id || patient.organizationId || '').toString();
  
  if (callerProfile.role !== 'super_admin') {
    const callerOrgId = (callerProfile.organizationId?._id || callerProfile.organizationId || '').toString();
    if (caretakerOrgId !== callerOrgId || patientOrgId !== callerOrgId) {
      throw new Error('Caretaker and Patient must be in the same organization as the caller');
    }
  } else {
    if (caretakerOrgId !== patientOrgId) {
      throw new Error('Caretaker and Patient must be in the same organization');
    }
  }

  // Check if organization can accept more patients
  const organization = await Organization.findById(caretaker.organizationId);
  if (organization && !organization.canAddUser('patient')) {
    throw new Error('Organization has reached patient capacity');
  }

  // Create or update assignment
  // Resolve the care manager: if assigning a caller, look up their managedBy field
  let resolvedManagerId = null;
  if (caretaker.role === 'care_manager') {
    resolvedManagerId = caretakerId;
  } else if (['caller', 'caretaker'].includes(caretaker.role)) {
    const callerWithManager = await Profile.findById(caretakerId).select('managedBy').lean();
    resolvedManagerId = callerWithManager?.managedBy || callerProfile._id;
  }

  const assignment = await CaretakerPatient.findOneAndUpdate(
    { caretakerId, patientId },
    { 
      caretakerId, 
      patientId, 
      careManagerId: resolvedManagerId,
      assignedBy: callerProfile._id,
      status: 'active',
      ...assignmentData
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate([
    { path: 'caretakerId', select: 'fullName email phone' },
    { path: 'patientId', select: 'fullName email phone' },
    { path: 'assignedBy', select: 'fullName' }
  ]);

  // Sync with Patient model for users app visibility
  const patientModel = await Patient.findOne({ profile_id: patientId }) || await Patient.findById(patientId);
  if (patientModel) {
    if (caretaker.role === 'care_manager') {
      patientModel.assigned_manager_id = caretakerId;
      patientModel.care_manager_id = caretakerId;
      patientModel.assigned_manager = caretakerId;
    } else if (['caller', 'caretaker'].includes(caretaker.role)) {
      patientModel.assigned_caller_id = caretakerId;
      patientModel.caller_id = caretakerId;
      // Also set the manager for the patient app
      if (resolvedManagerId) {
        patientModel.assigned_manager_id = resolvedManagerId;
        patientModel.care_manager_id = resolvedManagerId;
      }
    }
    await patientModel.save();
  }

  // Log the assignment
  await AuditLog.createLog({
    supabaseUid: callerProfile.supabaseUid,
    action: 'patient_assigned',
    resourceType: 'caretaker_patient',
    resourceId: assignment._id,
    ipAddress: assignmentData.ipAddress,
    userAgent: assignmentData.userAgent,
    outcome: 'success',
    details: {
      caretakerId,
      patientId,
      caretakerName: caretaker.fullName,
      patientName: patient.fullName,
      organizationId: caretaker.organizationId
    }
  });

  return assignment;
};

/**
 * Unassign a patient from a caretaker
 * @param {Object} callerProfile - Profile of the user making the unassignment
 * @param {string} caretakerId - ID of the caretaker
 * @param {string} patientId - ID of the patient
 * @param {string} reason - Reason for unassignment
 * @param {Object} options - Additional options
 * @returns {Object} The updated assignment
 */
const unassignPatientFromCaretaker = async (callerProfile, caretakerId, patientId, reason = '', options = {}) => {
  // Validate caller permissions
  if (callerProfile.role !== 'care_manager' && callerProfile.role !== 'org_admin' && callerProfile.role !== 'super_admin') {
    throw new Error('Only Care Managers, Org Admins, and Super Admins can unassign patients');
  }

  const assignment = await CaretakerPatient.findOne({ caretakerId, patientId })
    .populate([
      { path: 'caretakerId', select: 'fullName email phone organizationId role' },
      { path: 'patientId', select: 'fullName email phone organizationId' }
    ]);

  if (!assignment) {
    throw new Error('Assignment not found');
  }

  // Check organization access permissions
  if (callerProfile.role !== 'super_admin') {
    if (!assignment.caretakerId.organizationId.equals(callerProfile.organizationId)) {
      throw new Error('Cannot modify assignment outside your organization');
    }
  }

  // Update assignment status
  assignment.status = 'inactive';
  assignment.notes.push({
    content: `Unassigned: ${reason}`,
    addedBy: callerProfile._id,
    addedAt: new Date(),
    isPrivate: false
  });

  await assignment.save();

  // Sync removal with Patient model
  const patientModel = await Patient.findOne({ profile_id: patientId }) || await Patient.findById(patientId);
  if (patientModel && assignment.caretakerId) {
    if (assignment.caretakerId.role === 'care_manager') {
      patientModel.assigned_manager_id = null;
      patientModel.care_manager_id = null;
      patientModel.assigned_manager = null;
    } else {
      patientModel.assigned_caller_id = null;
      patientModel.caller_id = null;
    }
    await patientModel.save();
  }

  // Log the unassignment
  await AuditLog.createLog({
    supabaseUid: callerProfile.supabaseUid,
    action: 'patient_unassigned',
    resourceType: 'caretaker_patient',
    resourceId: assignment._id,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    outcome: 'success',
    details: {
      caretakerId,
      patientId,
      caretakerName: assignment.caretakerId.fullName,
      patientName: assignment.patientId.fullName,
      reason,
      organizationId: assignment.caretakerId.organizationId
    }
  });

  return assignment;
};

/**
 * Get all patients assigned to a caretaker
 * @param {Object} callerProfile - Profile of the user making the request
 * @param {string} caretakerId - ID of the caretaker
 * @param {Object} options - Query options
 * @returns {Array} List of assigned patients
 */
const getCaretakerPatients = async (callerProfile, caretakerId, options = {}) => {
  const { includeInactive = false, limit = 50, offset = 0 } = options;

  // Validate caller permissions
  if (callerProfile.role === 'caretaker' && callerProfile._id.toString() !== caretakerId) {
    throw new Error('Caretakers can only view their own assigned patients');
  }

  if (callerProfile.role === 'patient_mentor' || callerProfile.role === 'patient') {
    throw new Error('Patients and Mentors cannot view caretaker assignments');
  }

  const caretaker = await Profile.findById(caretakerId);
  if (!caretaker || !['caretaker', 'caller', 'care_manager'].includes(caretaker.role)) {
    throw new Error('Caretaker not found');
  }

  // Check organization access
  if (callerProfile.role !== 'super_admin') {
    if (!caretaker.organizationId.equals(callerProfile.organizationId)) {
      throw new Error('Cannot view assignments outside your organization');
    }
  }

  const statusFilter = includeInactive ? {} : { status: 'active' };
  
  const assignments = await CaretakerPatient.find({
    caretakerId,
    ...statusFilter
  })
  .populate({
    path: 'assignedBy',
    select: 'fullName'
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(offset)
  .lean();

  const Patient = require('../models/Patient');
  
  const populatedAssignments = [];
  
  for (let assignment of assignments) {
      // First try to populate from Profile
      let patientDoc = await Profile.findOne({ _id: assignment.patientId, isActive: { $ne: false } }).select('fullName email phone avatarUrl metadata').lean();
      
      // If not in Profile, it MUST be in the actual Patient collection!
      if (!patientDoc) {
          const pt = await Patient.findOne({ _id: assignment.patientId, is_active: { $ne: false } }).lean();
          if (pt) {
              patientDoc = {
                  _id: pt._id,
                  fullName: pt.name || pt.first_name + ' ' + pt.last_name,
                  email: pt.email,
                  phone: pt.phone,
              };
          }
      }
      
      if (patientDoc) {
          assignment.patientId = patientDoc;
          populatedAssignments.push(assignment);
      }
  }

  return populatedAssignments;
};

/**
 * Get all caretakers assigned to a patient
 * @param {Object} callerProfile - Profile of the user making the request
 * @param {string} patientId - ID of the patient
 * @param {Object} options - Query options
 * @returns {Array} List of assigned caretakers
 */
const getPatientCaretakers = async (callerProfile, patientId, options = {}) => {
  const { includeInactive = false, limit = 50, offset = 0 } = options;

  // Validate caller permissions
  if (callerProfile.role === 'patient' && callerProfile._id.toString() !== patientId) {
    throw new Error('Patients can only view their own assigned caretakers');
  }

  const patient = await Profile.findById(patientId);
  if (!patient || patient.role !== 'patient') {
    throw new Error('Patient not found');
  }

  // Check organization access
  if (callerProfile.role !== 'super_admin') {
    if (!patient.organizationId.equals(callerProfile.organizationId)) {
      throw new Error('Cannot view assignments outside your organization');
    }
  }

  const statusFilter = includeInactive ? {} : { status: 'active' };
  
  const assignments = await CaretakerPatient.find({
    patientId,
    ...statusFilter
  })
  .populate({
    path: 'caretakerId',
    select: 'fullName email phone avatarUrl metadata',
    match: { isActive: true }
  })
  .populate({
    path: 'assignedBy',
    select: 'fullName'
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(offset);

  // Filter out null caretakerIds (due to populate match)
  const validAssignments = assignments.filter(assignment => assignment.caretakerId);

  return validAssignments;
};

/**
 * Update caretaker assignment metrics
 * @param {string} caretakerId - ID of the caretaker
 * @param {string} patientId - ID of the patient
 * @param {Object} callData - Call data to update metrics
 * @returns {Object} Updated assignment
 */
const updateAssignmentMetrics = async (caretakerId, patientId, callData) => {
  const assignment = await CaretakerPatient.findOne({ caretakerId, patientId });
  
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  assignment.updateMetrics(callData);
  return assignment;
};

/**
 * Add note to caretaker-patient assignment
 * @param {Object} callerProfile - Profile of the user adding the note
 * @param {string} caretakerId - ID of the caretaker
 * @param {string} patientId - ID of the patient
 * @param {string} content - Note content
 * @param {boolean} isPrivate - Whether note is private
 * @returns {Object} Updated assignment
 */
const addAssignmentNote = async (callerProfile, caretakerId, patientId, content, isPrivate = false) => {
  const assignment = await CaretakerPatient.findOne({ caretakerId, patientId });
  
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  // Check permissions
  if (callerProfile.role === 'caretaker' && callerProfile._id.toString() !== caretakerId) {
    throw new Error('Caretakers can only add notes to their own assignments');
  }

  if (callerProfile.role === 'patient' && callerProfile._id.toString() !== patientId) {
    throw new Error('Patients can only add notes to their own assignments');
  }

  assignment.addNote(content, callerProfile._id, isPrivate);
  
  // Log note addition
  await AuditLog.createLog({
    supabaseUid: callerProfile.supabaseUid,
    action: 'assignment_note_added',
    resourceType: 'caretaker_patient',
    resourceId: assignment._id,
    outcome: 'success',
    details: {
      caretakerId,
      patientId,
      isPrivate,
      noteLength: content.length
    }
  });

  return assignment;
};

module.exports = {
  assignPatientToCaretaker,
  unassignPatientFromCaretaker,
  getCaretakerPatients,
  getPatientCaretakers,
  updateAssignmentMetrics,
  addAssignmentNote
};
