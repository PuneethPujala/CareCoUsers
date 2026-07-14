/**
 * assignment.test.js
 *
 * Tests for the AssignmentService manager assignment engine.
 * Verifies workload calculations, sorting, falls back to global managers,
 * and correct database updates/alert creations.
 */

const mongoose = require('mongoose');

jest.mock('../../src/models/Patient');
jest.mock('../../src/models/Profile');
jest.mock('../../src/models/Alert');

const Patient = require('../../src/models/Patient');
const Profile = require('../../src/models/Profile');
const Alert = require('../../src/models/Alert');
const AssignmentService = require('../../src/services/AssignmentService');

describe('Assignment Service (Manager Allocation)', () => {
  const patientId = new mongoose.Types.ObjectId();
  const orgId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should assign the least loaded manager to the patient and create an alert', async () => {
    // Arrange
    const patientMock = {
      _id: patientId,
      name: 'John Doe',
      email: 'john@example.com',
      organization_id: orgId,
    };

    const manager1 = {
      _id: new mongoose.Types.ObjectId(),
      fullName: 'Manager A',
      email: 'a@caremymed.in',
    };

    const manager2 = {
      _id: new mongoose.Types.ObjectId(),
      fullName: 'Manager B',
      email: 'b@caremymed.in',
    };

    Patient.findById.mockResolvedValue(patientMock);

    // Mock Profile query
    Profile.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([manager1, manager2]),
    });

    // Mock Patient aggregation workload returns
    // Manager A has 5 patients, Manager B has 2 patients
    const mockWorkloads = [
      { _id: manager1._id, count: 5 },
      { _id: manager2._id, count: 2 },
    ];
    Patient.aggregate.mockResolvedValue(mockWorkloads);

    // Mock Patient update and Alert creation
    Patient.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Alert.create.mockResolvedValue({});

    // Act
    const assignedManager = await AssignmentService.assignManager(patientId, orgId);

    // Assert
    expect(Patient.findById).toHaveBeenCalledWith(patientId);
    expect(Profile.find).toHaveBeenCalledWith({
      organizationId: orgId,
      role: { $in: ['org_admin', 'care_manager', 'super_admin'] },
      isActive: true,
    });

    // Verify workload grouping query logic matches the manager IDs
    expect(Patient.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          assigned_manager_id: { $in: [manager1._id, manager2._id] },
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

    // Expect Manager B (count 2) to be assigned instead of Manager A (count 5)
    expect(assignedManager).toEqual(manager2);
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: patientId },
      { $set: { assigned_manager_id: manager2._id } }
    );

    // Verify Alert creation params
    expect(Alert.create).toHaveBeenCalledWith({
      type: 'team_lead_recommended',
      patient_id: patientId,
      manager_id: manager2._id,
      organization_id: orgId,
      description: `New patient "John Doe" subscribed. Assigned to Care Manager "Manager B".`,
      auto_generated: true,
      status: 'open',
    });
  });

  it('should fall back to global managers if no managers are found in organization', async () => {
    // Arrange
    const patientMock = {
      _id: patientId,
      name: 'John Doe',
      email: 'john@example.com',
      organization_id: orgId,
    };

    const globalManager = {
      _id: new mongoose.Types.ObjectId(),
      fullName: 'Global Manager',
      email: 'global@caremymed.in',
    };

    Patient.findById.mockResolvedValue(patientMock);

    // Mock Profile find: first call (org scope) returns empty array, second call (global scope) returns manager
    Profile.find
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue([globalManager]),
      });

    // Workload aggregation returns empty (0 workload)
    Patient.aggregate.mockResolvedValue([]);
    Patient.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Alert.create.mockResolvedValue({});

    // Act
    const assignedManager = await AssignmentService.assignManager(patientId, orgId);

    // Assert
    expect(assignedManager).toEqual(globalManager);
    expect(Profile.find).toHaveBeenNthCalledWith(1, {
      organizationId: orgId,
      role: { $in: ['org_admin', 'care_manager', 'super_admin'] },
      isActive: true,
    });
    expect(Profile.find).toHaveBeenNthCalledWith(2, {
      role: { $in: ['org_admin', 'care_manager', 'super_admin'] },
      isActive: true,
    });
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: patientId },
      { $set: { assigned_manager_id: globalManager._id } }
    );
  });
});
