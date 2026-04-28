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

    // Step 2: phone collection (always needed for Google users who skip Step 1)
    const hasPhone = !!(patient?.phone || profile?.phoneNumber);
    if (!hasPhone) return 2;

    if (!profile?.city && !patient?.city) return 3; // locality
    if (!patient?.subscription?.plan) return 4; // pick plan

    const status = patient?.subscription?.status;
    if (status === 'pending_payment') return 4;
    const norm = normaliseStatus(status);
    if (norm === 'none') return 4;
    if (norm === 'expired') return 4;

    // Step 6 is final details (step 5 is payment-success, a transient screen)
    if (!patient?.profile_complete) return 6;

    return null; // Complete
};

export const isRecoveryExpired = (recoverySessionAt) => {
    return !recoverySessionAt || (Date.now() - recoverySessionAt > 10 * 60 * 1000);
};
