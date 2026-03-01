const MentorAuthorization = require('../models/MentorAuthorization');
const Profile = require('../models/Profile');
const AuditLog = require('../models/AuditLog');

/**
 * Authorize a mentor to access a patient's data
 * @param {Object} callerProfile - Profile of the user making the authorization
 * @param {string} mentorId - ID of the mentor
 * @param {string} patientId - ID of the patient
 * @param {Object} authData - Additional authorization data
 * @returns {Object} The created/updated authorization
 */
const authorizeMentor = async (callerProfile, mentorId, patientId, authData = {}) => {
  // Validate caller permissions
  const isPatientSelf = callerProfile._id.toString() === patientId;
  const isCareManager = callerProfile.role === 'care_manager';
  const isOrgAdmin = callerProfile.role === 'org_admin';
  const isSuperAdmin = callerProfile.role === 'super_admin';

  if (!isPatientSelf && !isCareManager && !isOrgAdmin && !isSuperAdmin) {
    throw new Error('Unauthorized: only the patient, Care Manager, Org Admin, or Super Admin can authorize a mentor');
  }

  const [mentor, patient] = await Promise.all([
    Profile.findById(mentorId).populate('organizationId'),
    Profile.findById(patientId).populate('organizationId')
  ]);

  if (!mentor || !patient) {
    throw new Error('Mentor and Patient must exist');
  }

  if (mentor.role !== 'patient_mentor') {
    throw new Error('Mentor must have patient_mentor role');
  }

  if (patient.role !== 'patient') {
    throw new Error('Patient must have patient role');
  }

  // Check organization access permissions for non-super admins
  if (!isSuperAdmin) {
    if (isCareManager || isOrgAdmin) {
      if (!mentor.organizationId.equals(callerProfile.organizationId) ||
          !patient.organizationId.equals(callerProfile.organizationId)) {
        throw new Error('Mentor and Patient must be in the same organization as the caller');
      }
    } else if (isPatientSelf) {
      // Patients can authorize mentors from any organization
      if (!mentor.organizationId.equals(patient.organizationId)) {
        // Cross-organization authorization requires additional validation
        authData.crossOrgAuth = true;
      }
    }
  }

  // Set default authorization data
  const defaultAuthData = {
    status: 'active',
    permissions: ['view_medical_info', 'view_medications', 'view_call_logs', 'view_health_journal'],
    relationship: 'other',
    consent: {
      givenAt: new Date(),
      givenBy: callerProfile._id,
      version: '1.0',
      ipAddress: authData.ipAddress
    },
    ...authData
  };

  // Create or update authorization
  const authorization = await MentorAuthorization.findOneAndUpdate(
    { mentorId, patientId },
    defaultAuthData,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate([
    { path: 'mentorId', select: 'fullName email phone' },
    { path: 'patientId', select: 'fullName email phone' },
    { path: 'authorizedBy', select: 'fullName' }
  ]);

  // Log the authorization
  await AuditLog.createLog({
    supabaseUid: callerProfile.supabaseUid,
    action: 'mentor_authorized',
    resourceType: 'mentor_authorization',
    resourceId: authorization._id,
    ipAddress: authData.ipAddress,
    userAgent: authData.userAgent,
    outcome: 'success',
    details: {
      mentorId,
      patientId,
      mentorName: mentor.fullName,
      patientName: patient.fullName,
      relationship: authorization.relationship,
      permissions: authorization.permissions,
      crossOrgAuth: authData.crossOrgAuth || false
    }
  });

  return authorization;
};

/**
 * Revoke mentor authorization
 * @param {Object} callerProfile - Profile of the user revoking the authorization
 * @param {string} mentorId - ID of the mentor
 * @param {string} patientId - ID of the patient
 * @param {string} reason - Reason for revocation
 * @param {Object} options - Additional options
 * @returns {Object} The updated authorization
 */
const revokeMentorAuthorization = async (callerProfile, mentorId, patientId, reason = '', options = {}) => {
  // Validate caller permissions
  const isPatientSelf = callerProfile._id.toString() === patientId;
  const isCareManager = callerProfile.role === 'care_manager';
  const isOrgAdmin = callerProfile.role === 'org_admin';
  const isSuperAdmin = callerProfile.role === 'super_admin';
  const isMentorSelf = callerProfile._id.toString() === mentorId;

  if (!isPatientSelf && !isCareManager && !isOrgAdmin && !isSuperAdmin && !isMentorSelf) {
    throw new Error('Unauthorized: only the patient, Care Manager, Org Admin, Super Admin, or the mentor themselves can revoke authorization');
  }

  const authorization = await MentorAuthorization.findOne({ mentorId, patientId })
    .populate([
      { path: 'mentorId', select: 'fullName email phone organizationId' },
      { path: 'patientId', select: 'fullName email phone organizationId' },
      { path: 'authorizedBy', select: 'fullName' }
    ]);

  if (!authorization) {
    throw new Error('Authorization not found');
  }

  // Check organization access permissions for non-super admins
  if (!isSuperAdmin && !isMentorSelf) {
    if (isCareManager || isOrgAdmin) {
      if (!authorization.mentorId.organizationId.equals(callerProfile.organizationId)) {
        throw new Error('Cannot modify authorization outside your organization');
      }
    }
  }

  // Revoke authorization
  authorization.revoke(callerProfile._id, reason);

  // Log the revocation
  await AuditLog.createLog({
    supabaseUid: callerProfile.supabaseUid,
    action: 'mentor_revoked',
    resourceType: 'mentor_authorization',
    resourceId: authorization._id,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    outcome: 'success',
    details: {
      mentorId,
      patientId,
      mentorName: authorization.mentorId.fullName,
      patientName: authorization.patientId.fullName,
      reason,
      revokedBy: callerProfile.fullName
    }
  });

  return authorization;
};

/**
 * Get all patients a mentor is authorized to access
 * @param {Object} callerProfile - Profile of the user making the request
 * @param {string} mentorId - ID of the mentor
 * @param {Object} options - Query options
 * @returns {Array} List of authorized patients
 */
const getMentorAuthorizedPatients = async (callerProfile, mentorId, options = {}) => {
  const { includeInactive = false, limit = 50, offset = 0 } = options;

  // Validate caller permissions
  if (callerProfile.role === 'patient_mentor' && callerProfile._id.toString() !== mentorId) {
    throw new Error('Mentors can only view their own authorizations');
  }

  if (callerProfile.role === 'patient') {
    throw new Error('Patients cannot view mentor authorizations');
  }

  const mentor = await Profile.findById(mentorId);
  if (!mentor || mentor.role !== 'patient_mentor') {
    throw new Error('Mentor not found');
  }

  const statusFilter = includeInactive ? {} : { status: 'active' };
  
  const authorizations = await MentorAuthorization.find({
    mentorId,
    ...statusFilter
  })
  .populate({
    path: 'patientId',
    select: 'fullName email phone avatarUrl metadata',
    match: { isActive: true }
  })
  .populate({
    path: 'authorizedBy',
    select: 'fullName'
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(offset);

  // Filter out null patientIds (due to populate match)
  const validAuthorizations = authorizations.filter(auth => auth.patientId);

  return validAuthorizations;
};

/**
 * Get all mentors authorized to access a patient
 * @param {Object} callerProfile - Profile of the user making the request
 * @param {string} patientId - ID of the patient
 * @param {Object} options - Query options
 * @returns {Array} List of authorized mentors
 */
const getPatientAuthorizedMentors = async (callerProfile, patientId, options = {}) => {
  const { includeInactive = false, limit = 50, offset = 0 } = options;

  // Validate caller permissions
  if (callerProfile.role === 'patient' && callerProfile._id.toString() !== patientId) {
    throw new Error('Patients can only view their own authorizations');
  }

  const patient = await Profile.findById(patientId);
  if (!patient || patient.role !== 'patient') {
    throw new Error('Patient not found');
  }

  const statusFilter = includeInactive ? {} : { status: 'active' };
  
  const authorizations = await MentorAuthorization.find({
    patientId,
    ...statusFilter
  })
  .populate({
    path: 'mentorId',
    select: 'fullName email phone avatarUrl metadata',
    match: { isActive: true }
  })
  .populate({
    path: 'authorizedBy',
    select: 'fullName'
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(offset);

  // Filter out null mentorIds (due to populate match)
  const validAuthorizations = authorizations.filter(auth => auth.mentorId);

  return validAuthorizations;
};

/**
 * Check if mentor has specific permission for patient
 * @param {string} mentorId - ID of the mentor
 * @param {string} patientId - ID of the patient
 * @param {string} permission - Permission to check
 * @returns {boolean} Whether mentor has the permission
 */
const checkMentorPermission = async (mentorId, patientId, permission) => {
  return await MentorAuthorization.hasPermission(mentorId, patientId, permission);
};

/**
 * Log mentor access to patient data
 * @param {string} mentorId - ID of the mentor
 * @param {string} patientId - ID of the patient
 * @param {string} action - Action performed
 * @param {Object} req - Express request object
 * @returns {Object} Updated authorization
 */
const logMentorAccess = async (mentorId, patientId, action, req = null) => {
  const authorization = await MentorAuthorization.findOne({ mentorId, patientId, status: 'active' });
  
  if (!authorization) {
    throw new Error('Active authorization not found');
  }

  const mentorProfile = await Profile.findById(mentorId);
  authorization.logAccess(action, mentorProfile._id, 'patient', patientId, req);

  return authorization;
};

/**
 * Update mentor authorization permissions
 * @param {Object} callerProfile - Profile of the user updating permissions
 * @param {string} mentorId - ID of the mentor
 * @param {string} patientId - ID of the patient
 * @param {Array} permissions - New permissions array
 * @param {Object} options - Additional options
 * @returns {Object} Updated authorization
 */
const updateMentorPermissions = async (callerProfile, mentorId, patientId, permissions, options = {}) => {
  // Validate caller permissions
  const isPatientSelf = callerProfile._id.toString() === patientId;
  const isCareManager = callerProfile.role === 'care_manager';
  const isOrgAdmin = callerProfile.role === 'org_admin';
  const isSuperAdmin = callerProfile.role === 'super_admin';

  if (!isPatientSelf && !isCareManager && !isOrgAdmin && !isSuperAdmin) {
    throw new Error('Unauthorized: only the patient, Care Manager, Org Admin, or Super Admin can update permissions');
  }

  const authorization = await MentorAuthorization.findOne({ mentorId, patientId });
  
  if (!authorization) {
    throw new Error('Authorization not found');
  }

  // Validate permissions
  const validPermissions = [
    'view_medical_info', 'view_medications', 'manage_medications',
    'view_call_logs', 'make_calls_on_behalf', 'view_health_journal',
    'manage_health_journal', 'receive_notifications', 'emergency_contact'
  ];

  const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
  if (invalidPermissions.length > 0) {
    throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
  }

  // Update permissions
  authorization.permissions = permissions;
  await authorization.save();

  // Log the permission update
  await AuditLog.createLog({
    supabaseUid: callerProfile.supabaseUid,
    action: 'mentor_permissions_updated',
    resourceType: 'mentor_authorization',
    resourceId: authorization._id,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    outcome: 'success',
    details: {
      mentorId,
      patientId,
      newPermissions: permissions,
      previousPermissions: authorization.previousValues?.permissions || []
    },
    previousValues: { permissions: authorization.previousValues?.permissions || [] },
    newValues: { permissions }
  });

  return authorization;
};

module.exports = {
  authorizeMentor,
  revokeMentorAuthorization,
  getMentorAuthorizedPatients,
  getPatientAuthorizedMentors,
  checkMentorPermission,
  logMentorAccess,
  updateMentorPermissions
};
