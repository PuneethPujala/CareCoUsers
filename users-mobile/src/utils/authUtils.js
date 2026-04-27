/**
 * authUtils.js
 * Pure utility functions for authenticating state logic.
 * Extracted for isolated unit testing.
 */

export const normaliseStatus = (raw) => {
    if (raw === 'active') return 'active';
    if (raw === 'expired' || raw === 'past_due' || raw === 'cancelled') return 'expired';
    return 'none';
};

export const resolveOnboardingStep = (patient, profile) => {
    if (!profile && !patient) return 1;
    if (!profile?.city && !patient?.city) return 2; // locality
    if (!patient?.subscription?.plan) return 3; // pick plan
    if (normaliseStatus(patient?.subscription?.status) === 'none') return 3; // Stay on selection until paid

    // If they have a plan but aren't active yet, they should be on the payment success/processing screen (Step 4)
    if (normaliseStatus(patient?.subscription?.status) === 'pending_payment') return 4;

    // Step 5 is the final details collection
    if (!patient?.profile_complete) return 5;

    return null; // Complete
};

export const isRecoveryExpired = (recoverySessionAt) => {
    return !recoverySessionAt || (Date.now() - recoverySessionAt > 10 * 60 * 1000);
};
