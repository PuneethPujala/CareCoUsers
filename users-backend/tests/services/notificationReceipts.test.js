/**
 * Tests for Push Notification Receipt Polling & Token Pruning Job
 */

const axios = require('axios');
const mongoose = require('mongoose');

// Mock dependencies before requiring the jobs
jest.mock('axios');
jest.mock('../../src/models/Notification');
jest.mock('../../src/models/Patient');

const Notification = require('../../src/models/Notification');
const Patient = require('../../src/models/Patient');
const {
  pollPushReceipts,
  pruneDeadDevices,
} = require('../../src/jobs/receiptPollingJob');

describe('Notification Delivery Receipts & Token Pruning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pollPushReceipts', () => {
    it('should exit early if no pending notifications exist', async () => {
      Notification.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([]),
      });

      await pollPushReceipts();

      expect(Notification.find).toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should successfully update receipt status to ok and reset failures on ok status', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const mockNotification = {
        _id: new mongoose.Types.ObjectId(),
        patient_id: patientId,
        expo_ticket_id: 'ticket-ok-123',
        expo_push_token: 'ExponentPushToken[valid-123]',
      };

      Notification.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockNotification]),
      });

      // Mock Expo receipt endpoint response
      axios.post.mockResolvedValue({
        data: {
          data: {
            'ticket-ok-123': { status: 'ok' },
          },
        },
      });

      await pollPushReceipts();

      // Verify Notification was updated
      expect(Notification.updateMany).toHaveBeenCalledWith(
        { expo_ticket_id: 'ticket-ok-123' },
        expect.objectContaining({
          $set: expect.objectContaining({
            expo_receipt_status: 'ok',
            push_delivered: true,
          }),
        })
      );

      // Verify patient token failures were reset to 0
      expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(patientId, {
        $set: { expo_push_token_failures: 0 },
      });
    });

    it('should increment failure count on DeviceNotRegistered and prune token on 3rd failure', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const mockNotification = {
        _id: new mongoose.Types.ObjectId(),
        patient_id: patientId,
        expo_ticket_id: 'ticket-fail-456',
        expo_push_token: 'ExponentPushToken[fail-456]',
      };

      Notification.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockNotification]),
      });

      axios.post.mockResolvedValue({
        data: {
          data: {
            'ticket-fail-456': {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        },
      });

      // Case A: First failure (increment from 0 to 1)
      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: patientId,
          expo_push_token: 'ExponentPushToken[fail-456]',
          expo_push_token_failures: 0,
        }),
      });

      await pollPushReceipts();

      expect(Notification.updateMany).toHaveBeenCalledWith(
        { expo_ticket_id: 'ticket-fail-456' },
        expect.objectContaining({
          $set: expect.objectContaining({
            expo_receipt_status: 'error',
            expo_receipt_error: 'DeviceNotRegistered',
          }),
        })
      );

      expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(patientId, {
        $set: { expo_push_token_failures: 1 },
      });

      // Reset mocks for Case B
      jest.clearAllMocks();
      Notification.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockNotification]),
      });
      axios.post.mockResolvedValue({
        data: {
          data: {
            'ticket-fail-456': {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        },
      });

      // Case B: Third failure (prune token)
      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: patientId,
          expo_push_token: 'ExponentPushToken[fail-456]',
          expo_push_token_failures: 2,
        }),
      });

      await pollPushReceipts();

      expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(patientId, {
        $set: {
          expo_push_token: null,
          expo_push_token_failures: 0,
        },
      });
    });

    it('should NOT increment or prune token if current patient token has changed (prevents race condition)', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const mockNotification = {
        _id: new mongoose.Types.ObjectId(),
        patient_id: patientId,
        expo_ticket_id: 'ticket-fail-789',
        expo_push_token: 'ExponentPushToken[old-token]',
      };

      Notification.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([mockNotification]),
      });

      axios.post.mockResolvedValue({
        data: {
          data: {
            'ticket-fail-789': {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        },
      });

      // Simulate patient registered a new token in the meantime
      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: patientId,
          expo_push_token: 'ExponentPushToken[new-token]',
          expo_push_token_failures: 0,
        }),
      });

      await pollPushReceipts();

      expect(Notification.updateMany).toHaveBeenCalledWith(
        { expo_ticket_id: 'ticket-fail-789' },
        expect.objectContaining({
          $set: expect.objectContaining({
            expo_receipt_status: 'error',
          }),
        })
      );

      // Should NOT call findByIdAndUpdate on patient because token is mismatched
      expect(Patient.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should process partial batch failures correctly without crashing', async () => {
      const patientId1 = new mongoose.Types.ObjectId();
      const patientId2 = new mongoose.Types.ObjectId();
      const patientId3 = new mongoose.Types.ObjectId();

      const mockNotif1 = {
        patient_id: patientId1,
        expo_ticket_id: 'ticket-1',
        expo_push_token: 'token-1',
      };
      const mockNotif2 = {
        patient_id: patientId2,
        expo_ticket_id: 'ticket-2',
        expo_push_token: 'token-2',
      };
      const mockNotif3 = {
        patient_id: patientId3,
        expo_ticket_id: 'ticket-3',
        expo_push_token: 'token-3',
      };

      Notification.find.mockReturnValue({
        select: jest
          .fn()
          .mockResolvedValue([mockNotif1, mockNotif2, mockNotif3]),
      });

      axios.post.mockResolvedValue({
        data: {
          data: {
            'ticket-1': { status: 'ok' },
            'ticket-2': {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
            // ticket-3 is omitted (still pending)
          },
        },
      });

      Patient.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: patientId2,
          expo_push_token: 'token-2',
          expo_push_token_failures: 0,
        }),
      });

      await pollPushReceipts();

      // Verifies successful ticket-1 updates
      expect(Notification.updateMany).toHaveBeenCalledWith(
        { expo_ticket_id: 'ticket-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            expo_receipt_status: 'ok',
            push_delivered: true,
          }),
        })
      );
      expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(patientId1, {
        $set: { expo_push_token_failures: 0 },
      });

      // Verifies failing ticket-2 updates
      expect(Notification.updateMany).toHaveBeenCalledWith(
        { expo_ticket_id: 'ticket-2' },
        expect.objectContaining({
          $set: expect.objectContaining({
            expo_receipt_status: 'error',
            expo_receipt_error: 'DeviceNotRegistered',
          }),
        })
      );
      expect(Patient.findByIdAndUpdate).toHaveBeenCalledWith(patientId2, {
        $set: { expo_push_token_failures: 1 },
      });

      // Verifies ticket-3 (pending) was skipped / not updated
      expect(Notification.updateMany).not.toHaveBeenCalledWith(
        { expo_ticket_id: 'ticket-3' },
        expect.any(Object)
      );
    });
  });

  describe('pruneDeadDevices', () => {
    it('should sweep and set inactive devices tokens to null', async () => {
      Patient.updateMany.mockResolvedValue({ modifiedCount: 4 });

      await pruneDeadDevices();

      expect(Patient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          expo_push_token: { $exists: true, $nin: [null, ''] },
          $or: expect.any(Array),
        }),
        {
          $set: {
            expo_push_token: null,
            expo_push_token_failures: 0,
          },
        }
      );
    });
  });
});
