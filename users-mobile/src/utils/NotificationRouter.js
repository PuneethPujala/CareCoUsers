import usePatientStore from '../store/usePatientStore';
import { navigationRef, navigate } from '../lib/navigationRef';

let pendingNotification = null;

/**
 * Global router for handling notifications and deep links.
 * Maps incoming push payload types and parameters to specific React Navigation locations.
 * Includes queuing mechanisms for cold starts where navigation is not yet ready.
 */
export function routeNotification(data) {
  if (!data) return;

  const { type, screen, patientId, medicationId, activeMetricId, slot } = data;
  console.log('[NotificationRouter] Received notification data for routing:', data);

  // Check if navigator is mounted and ready
  const isNavReady =
    navigationRef.current &&
    navigationRef.current.isReady &&
    navigationRef.current.isReady();

  // Check if user/patient is logged in
  const patient = usePatientStore.getState().patient;

  if (!isNavReady || !patient) {
    console.log('[NotificationRouter] Navigator not ready or patient not logged in. Queueing notification.', {
      isNavReady,
      hasPatient: !!patient
    });
    pendingNotification = data;
    return;
  }

  // Clear pending if we're executing it now
  pendingNotification = null;

  // 1. Handle Companion / Caregiver destinations
  if (
    type === 'caller_critical_alert' ||
    type === 'companion_alert' ||
    type === 'companion_nudge'
  ) {
    if (patientId) {
      usePatientStore.setState({ companionSelectedPatientId: patientId });
    }
    navigate('CompanionTabs', {
      screen: 'CompanionDashboard',
      params: { patientId },
    });
    return;
  }

  // 2. Handle Patient destinations with nested tab parameter mapping
  let targetScreen = screen;
  let targetParams = {};

  switch (type) {
    case 'medication_reminder':
      targetScreen = 'PatientTabs';
      targetParams = {
        screen: 'Medications',
        params: { slot, focusMedicationId: medicationId },
      };
      break;

    case 'critical_vital_alert':
    case 'bp_request':
    case 'companion_request_bp':
      targetScreen = 'VitalsHistory';
      targetParams = { activeMetricId: activeMetricId || 'heart_rate' };
      break;

    case 'weekly_summary':
      targetScreen = 'PatientTabs';
      targetParams = {
        screen: 'Medications',
        params: { showSummary: true },
      };
      break;

    default:
      // Fallback screen maps if no specialized type logic exists
      if (screen === 'Dashboard' || screen === 'PatientHome') {
        targetScreen = 'PatientTabs';
        targetParams = { screen: 'PatientHome' };
      } else if (screen === 'Medications' || screen === 'MedicationDetails') {
        targetScreen = 'PatientTabs';
        targetParams = { screen: 'Medications' };
      } else if (screen === 'VitalsHistory' || screen === 'VitalsScreen') {
        targetScreen = 'VitalsHistory';
        targetParams = { activeMetricId: activeMetricId || 'heart_rate' };
      }
      break;
  }

  if (targetScreen) {
    console.log(`[NotificationRouter] Navigating to: ${targetScreen}`, targetParams);
    navigate(targetScreen, targetParams);
  }
}

/**
 * Flush any queued notifications. Called when navigation settles or auth succeeds.
 */
export function flushPendingNotifications() {
  if (pendingNotification) {
    console.log('[NotificationRouter] Flushing pending notification:', pendingNotification);
    routeNotification(pendingNotification);
  }
}
