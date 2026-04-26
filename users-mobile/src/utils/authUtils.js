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
    if (normaliseStatus(patient?.subscription?.status) === 'none') return 3; // Stay on payment screen (Step 3) until status is active/expired

    // Step 4 is the payment success / processing state in PatientSignupScreen
    // Step 5 is the final age/gender collection
    // If onboardingComplete is false, we need to check if they have age/gender
    if (!patient?.date_of_birth || !patient?.gender) return 5;
    if (!patient?.onboardingComplete) return 5; // Fallback to 5 if not complete

    return null; // Complete
};

export const isRecoveryExpired = (recoverySessionAt) => {
    return !recoverySessionAt || (Date.now() - recoverySessionAt > 10 * 60 * 1000);
};
