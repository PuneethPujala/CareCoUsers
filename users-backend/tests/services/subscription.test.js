/**
 * subscription.test.js
 *
 * Tests for the SubscriptionService.
 * Verifies subscription updates are committed to the Patient model, and
 * the appropriate subscription_activated job is enqueued to BullMQ.
 */

const mongoose = require('mongoose');

jest.mock('../../src/models/Patient');
jest.mock('../../src/jobs/jobQueues', () => ({
  patientLifecycleQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job_123' }),
  },
}));

const Patient = require('../../src/models/Patient');
const { patientLifecycleQueue } = require('../../src/jobs/jobQueues');
const SubscriptionService = require('../../src/services/SubscriptionService');

describe('Subscription Service', () => {
  const patientId = new mongoose.Types.ObjectId();
  const orgId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully update subscription details and enqueue BullMQ job', async () => {
    // Arrange
    const mockPatient = {
      _id: patientId,
      name: 'Jane Doe',
      organization_id: orgId,
      subscription: {
        status: 'pending_payment',
        plan: 'basic',
      },
    };

    const mockUpdatedPatient = {
      _id: patientId,
      name: 'Jane Doe',
      organization_id: orgId,
      subscription: {
        status: 'active',
        plan: 'premium_monthly',
      },
    };

    Patient.findById.mockResolvedValue(mockUpdatedPatient);
    Patient.updateOne.mockResolvedValue({ modifiedCount: 1 });

    // Act
    const result = await SubscriptionService.activateSubscription(mockPatient, 'premium_monthly');

    // Assert
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: patientId },
      expect.objectContaining({
        $set: expect.objectContaining({
          'subscription.status': 'active',
          'subscription.plan': 'premium_monthly',
          paid: 1,
        }),
      }),
      expect.any(Object) // session opts
    );

    expect(patientLifecycleQueue.add).toHaveBeenCalledWith(
      'subscription_activated',
      {
        patientId: patientId,
        planId: 'premium_monthly',
        orgId: orgId,
      }
    );

    expect(result).toEqual(mockUpdatedPatient);
  });
});
