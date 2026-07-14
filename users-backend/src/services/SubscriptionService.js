const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const logger = require('../utils/logger');

class SubscriptionService {
  /**
   * Activate a patient's subscription.
   * Modifies the subscription billing terms, updates the database, commits the transaction,
   * and emits a lifecycle event to trigger post-payment processes (like manager assignment).
   *
   * @param {object} patient - The patient document
   * @param {string} planId - Target plan ID (e.g. premium_monthly, premium_annual)
   * @returns {Promise<object>} The updated patient document
   */
  static async activateSubscription(patient, planId) {
    const isActive = patient.subscription?.status === 'active';
    const isExpired =
      patient.subscription?.expires_at &&
      new Date(patient.subscription.expires_at) < new Date();

    const isTest = process.env.NODE_ENV === 'test';
    const session = isTest ? null : await mongoose.startSession();
    if (session) session.startTransaction();

    try {
      const orgId =
        patient.organization_id ||
        new mongoose.Types.ObjectId('674f07e1525049b7348908f9');

      // Map plan pricing correctly
      const planAmounts = {
        premium_monthly: 800,
        premium_annual: 8000,
        basic: 800,
      };
      const resolvedPlan = planId || patient.pending_plan || 'basic';
      const amount = planAmounts[resolvedPlan] || 800;
      const durationDays = resolvedPlan === 'premium_annual' ? 365 : 30;

      let newExpiresAt;
      if (isActive && !isExpired && patient.subscription?.expires_at) {
        // Stack the days on top of the current remaining days
        newExpiresAt = new Date(
          new Date(patient.subscription.expires_at).getTime() +
            durationDays * 86400000
        );
      } else {
        // Start fresh from today
        newExpiresAt = new Date(Date.now() + durationDays * 86400000);
      }

      const subscriptionUpdates = {
        'subscription.status': 'active',
        'subscription.plan': resolvedPlan,
        'subscription.amount': amount,
        'subscription.payment_date': new Date(),
        'subscription.expires_at': newExpiresAt,
        'subscription.next_billing': newExpiresAt,
        paid: 1,
      };

      if (!isActive || isExpired) {
        subscriptionUpdates['subscription.started_at'] = new Date();
      }

      await Patient.updateOne(
        { _id: patient._id },
        { $set: subscriptionUpdates },
        { session }
      );

      if (session) await session.commitTransaction();

      logger.info('Subscription activated atomically', {
        patientId: patient._id,
        plan: resolvedPlan,
      });

      const updatedPatient = await Patient.findById(patient._id);

      // Enqueue lifecycle event to background queue after successful transaction commit
      const { patientLifecycleQueue } = require('../jobs/jobQueues');
      await patientLifecycleQueue.add('subscription_activated', {
        patientId: patient._id,
        planId: resolvedPlan,
        orgId,
      });

      return updatedPatient;
    } catch (error) {
      if (session) await session.abortTransaction();
      logger.error('Subscription transaction aborted', {
        error: error.message,
        patientId: patient._id,
      });
      throw error;
    } finally {
      if (session) session.endSession();
    }
  }
}

module.exports = SubscriptionService;
