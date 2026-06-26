/**
 * aiContext.test.js
 *
 * Regression test for the aiContextService schema mismatch bug.
 * Verifies that buildPatientContext queries CallLog using correct schema fields (patientId, scheduledTime, duration)
 * and correctly maps recent call metadata into the context.
 */

const mongoose = require("mongoose");
const moment = require("moment-timezone");

jest.mock("../../src/models/Patient");
jest.mock("../../src/models/Profile");
jest.mock("../../src/models/Medication");
jest.mock("../../src/models/MedicineLog");
jest.mock("../../src/models/VitalLog");
jest.mock("../../src/models/CallLog");
jest.mock("../../src/services/patientHealthStateService", () => ({
  getCachedHealthState: jest.fn().mockResolvedValue({ status: "stable" }),
}));

const Patient = require("../../src/models/Patient");
const Profile = require("../../src/models/Profile");
const Medication = require("../../src/models/Medication");
const MedicineLog = require("../../src/models/MedicineLog");
const VitalLog = require("../../src/models/VitalLog");
const CallLog = require("../../src/models/CallLog");
const { buildPatientContext } = require("../../src/services/aiContextService");

describe("AI Context Service (Regression & Schema Check)", () => {
  const patientId = new mongoose.Types.ObjectId();
  const managerId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();

    // Standard patient mock
    Patient.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: patientId,
        name: "Test Patient",
        timezone: "Asia/Kolkata",
        assigned_manager_id: managerId,
        gamification: { current_streak: 5, longest_streak: 10 },
        medications: [],
      }),
    });

    // Manager Profile mock
    Profile.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: managerId,
        fullName: "Care Manager Alice",
        role: "care_manager",
      }),
    });

    // Other empty mocks for queries in buildPatientContext
    Medication.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });
    MedicineLog.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
    MedicineLog.findOne.mockResolvedValue(null);
    VitalLog.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });
  });

  it("should query CallLog using correct fields and return recent call details in payload", async () => {
    // Arrange: Create a mock call log with correct schema fields
    const mockCallLog = {
      patientId: patientId,
      status: "completed",
      scheduledTime: new Date("2026-06-25T10:00:00.000Z"),
      duration: 360,
    };

    // Chainable Mongoose findOne mock: CallLog.findOne().sort().select()
    const selectMock = jest.fn().mockResolvedValue(mockCallLog);
    const sortMock = jest.fn().mockReturnValue({ select: selectMock });
    CallLog.findOne.mockReturnValue({ sort: sortMock });

    // Act
    const context = await buildPatientContext(patientId);

    // Assert: Check CallLog query syntax
    expect(CallLog.findOne).toHaveBeenCalledWith({ patientId: patientId });
    expect(sortMock).toHaveBeenCalledWith({ scheduledTime: -1 });
    expect(selectMock).toHaveBeenCalledWith("status scheduledTime duration");

    // Assert: Check structure & mapping in returned payload
    expect(context).not.toBeNull();
    expect(context.care_team).toEqual({
      assigned_caller: "Care Manager Alice",
      role: "care_manager",
    });
    expect(context.latest_interaction).toEqual({
      date: "Jun 25, 3:30 PM", // 10:00 AM UTC converted to Asia/Kolkata
      status: "completed",
      duration_seconds: 360,
    });
  });
});
