const CaretakerPatient = require('../models/CaretakerPatient');
const Profile = require('../models/Profile');
const AuditLog = require('../models/AuditLog');
const Organization = require('../models/Organization');

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

  const [caretaker, patient] = await Promise.all([
    Profile.findById(caretakerId).populate('organizationId'),
    Profile.findById(patientId).populate('organizationId')
  ]);

  if (!caretaker || !patient) {
    throw new Error('Caretaker and Patient must exist');
  }

  if (caretaker.role !== 'caretaker') {
    throw new Error('Assigned caretaker must have caretaker role');
  }

  if (patient.role !== 'patient') {
    throw new Error('Assigned patient must have patient role');
  }

  // Check organization access permissions
  if (callerProfile.role !== 'super_admin') {
    if (!caretaker.organizationId.equals(callerProfile.organizationId) ||
        !patient.organizationId.equals(callerProfile.organizationId)) {
      throw new Error('Caretaker and Patient must be in the same organization as the caller');
    }
  } else {
    // Super admin can assign across organizations, but caretaker and patient must be in same org
    if (!caretaker.organizationId.equals(patient.organizationId)) {
      throw new Error('Caretaker and Patient must be in the same organization');
    }
  }

  // Check if organization can accept more patients
  const organization = await Organization.findById(caretaker.organizationId);
  if (organization && !organization.canAddUser('patient')) {
    throw new Error('Organization has reached patient capacity');
  }

  // Create or update assignment
  const assignment = await CaretakerPatient.findOneAndUpdate(
    { caretakerId, patientId },
    { 
      caretakerId, 
      patientId, 
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
      { path: 'caretakerId', select: 'fullName email phone organizationId' },
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
  if (!caretaker || caretaker.role !== 'caretaker') {
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
    path: 'patientId',
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

  // Filter out null patientIds (due to populate match)
  const validAssignments = assignments.filter(assignment => assignment.patientId);

  return validAssignments;
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
