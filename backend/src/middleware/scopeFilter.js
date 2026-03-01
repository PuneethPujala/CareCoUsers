const CaretakerPatient = require('../models/CaretakerPatient');
const MentorAuthorization = require('../models/MentorAuthorization');

/**
 * Scope filter middleware - attaches MongoDB query filter to req.scopeFilter
 * Replaces PostgreSQL RLS with server-side data access control
 *
 * Supported resourceTypes: 'patients', 'caretakers', 'mentors', 'profile'
 */
const scopeFilter = (resourceType) => {
  return async (req, res, next) => {
    const { role, _id: profileId, organizationId } = req.profile;

    try {
      switch (role) {
        case 'super_admin':
          req.scopeFilter = {};
          break;

        case 'org_admin':
        case 'care_manager':
          req.scopeFilter = { organizationId };
          break;

        case 'caretaker': {
          if (resourceType === 'patients') {
            const assignments = await CaretakerPatient.find(
              { caretakerId: profileId, status: 'active' },
              'patientId'
            );
            const patientIds = assignments.map((a) => a.patientId);
            req.scopeFilter = { _id: { $in: patientIds } };
          } else if (resourceType === 'caretakers') {
            // Caretakers can only see themselves
            req.scopeFilter = { _id: profileId };
          } else {
            req.scopeFilter = { _id: profileId };
          }
          break;
        }

        case 'patient_mentor': {
          if (resourceType === 'patients') {
            const auths = await MentorAuthorization.find(
              { mentorId: profileId, status: 'active' },
              'patientId'
            );
            const linkedPatientIds = auths.map((a) => a.patientId);
            req.scopeFilter = { _id: { $in: linkedPatientIds } };
          } else if (resourceType === 'mentors') {
            // Mentors can only see themselves
            req.scopeFilter = { _id: profileId };
          } else {
            req.scopeFilter = { _id: profileId };
          }
          break;
        }

        case 'patient':
          req.scopeFilter = { _id: profileId };
          break;

        default:
          return res.status(403).json({ error: 'Unknown role' });
      }

      next();
    } catch (err) {
      console.error('Scope filter error:', err);
      return res.status(500).json({ error: 'Scope filter error' });
    }
  };
};

module.exports = { scopeFilter };
