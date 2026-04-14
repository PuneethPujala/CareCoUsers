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
    if (normaliseStatus(patient?.subscription?.status) === 'none') return 4; // payment
    return null; // Complete
};

export const isRecoveryExpired = (recoverySessionAt) => {
    return !recoverySessionAt || (Date.now() - recoverySessionAt > 10 * 60 * 1000);
};
