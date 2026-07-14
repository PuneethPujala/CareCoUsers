const Profile = require('../models/Profile');
const Patient = require('../models/Patient');
const Alert = require('../models/Alert');
const logger = require('../utils/logger');

class AssignmentService {
  /**
   * Automatically assign the best care manager to the patient based on workload.
   * Finds the least loaded care manager within the patient's organization, updates
   * the patient's assigned_manager_id, and creates a recommendation Alert.
   *
   * @param {string} patientId - MongoDB _id of the patient
   * @param {string} orgId - Organization ID
   * @returns {Promise<object|null>} The assigned manager profile, or null if none found
   */
  static async assignManager(patientId, orgId) {
    try {
      const patient = await Patient.findById(patientId);
      if (!patient) {
        logger.warn('[AssignmentService] Patient not found for manager assignment', { patientId });
        return null;
      }

      // Query active managers in the organization
      let managers = await Profile.find({
        organizationId: orgId,
        role: { $in: ['org_admin', 'care_manager', 'super_admin'] },
        isActive: true,
      }).select('_id fullName email');

      // Fallback: search across all organizations if none found locally
      if (managers.length === 0) {
        logger.info('[AssignmentService] No managers found in patient organization. Falling back to global managers.', { orgId });
        managers = await Profile.find({
          role: { $in: ['org_admin', 'care_manager', 'super_admin'] },
          isActive: true,
        }).select('_id fullName email');
      }

      if (managers.length === 0) {
        logger.warn('[AssignmentService] No managers found in the database. Manager assignment skipped.', { patientId });
        return null;
      }

      // Query workloads (active patients assigned per manager)
      const managerIds = managers.map((m) => m._id);
      const workloads = await Patient.aggregate([
        {
          $match: {
            assigned_manager_id: { $in: managerIds },
            is_active: true,
          },
        },
        {
          $group: {
            _id: '$assigned_manager_id',
            count: { $sum: 1 },
          },
        },
      ]);

      const workloadMap = {};
      workloads.forEach((w) => {
        workloadMap[String(w._id)] = w.count;
      });

      // Sort managers by ascending workload (least busy manager first)
      managers.sort((a, b) => {
        const countA = workloadMap[String(a._id)] || 0;
        const countB = workloadMap[String(b._id)] || 0;
        return countA - countB;
      });

      const bestManager = managers[0];

      // Assign the manager to the patient
      await Patient.updateOne(
        { _id: patientId },
        { $set: { assigned_manager_id: bestManager._id } }
      );

      // Create recommendation alert for the assigned manager
      await Alert.create({
        type: 'team_lead_recommended',
        patient_id: patientId,
        manager_id: bestManager._id,
        organization_id: orgId,
        description: `New patient "${patient.name || patient.email}" subscribed. Assigned to Care Manager "${bestManager.fullName}".`,
        auto_generated: true,
        status: 'open',
      });

      logger.info('[AssignmentService] Manager assigned successfully', {
        patientId,
        managerId: bestManager._id,
        managerName: bestManager.fullName,
        workload: workloadMap[String(bestManager._id)] || 0,
      });

      return bestManager;
    } catch (error) {
      logger.error('[AssignmentService] Failed to assign manager to patient', {
        error: error.message,
        patientId,
        orgId,
      });
      throw error;
    }
  }
}

module.exports = AssignmentService;
