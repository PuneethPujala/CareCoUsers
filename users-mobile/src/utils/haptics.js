import * as Haptics from 'expo-haptics';

const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * CareMyMed — Semantic Haptic Patterns
 *
 * Every interaction type maps to a specific haptic feel.
 * This makes the app feel intentional — different actions
 * produce different physical feedback.
 *
 * | Action                | Pattern          | Feel          |
 * |-----------------------|------------------|---------------|
 * | Tap / selection       | selection()      | Lightest tick  |
 * | Log medication        | Light impact     | Soft confirm   |
 * | All meds done         | Light × 2        | Double tap     |
 * | Step complete         | Light impact     | Soft confirm   |
 * | Milestone / streak    | Medium impact    | Noticeable     |
 * | Error / attention     | Medium impact    | Alert feel     |
 * | SOS / urgent          | Heavy impact     | Strong warning |
 * | AI briefing ready     | Light impact     | Gentle nudge   |
 * | Premium unlocked      | Light × 3        | Celebration    |
 * | Companion connected   | Light × 2        | Warm confirm   |
 * | Success (generic)     | Notification     | iOS ding feel  |
 */
export const HapticPatterns = {
  // ── Lightest ──
  selection: () => Haptics.selectionAsync(),
  tap: () => Haptics.selectionAsync(),

  // ── Soft confirms ──
  log: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  aiBriefing: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  stepComplete: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),

  // ── Noticeable confirms ──
  milestone: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),

  // ── Alerts ──
  attention: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),

  // ── Heavy / urgent ──
  sos: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),

  // ── Multi-tap sequences ──
  allDone: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(120);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  caregiverConnected: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(100);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  premiumUnlocked: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(160);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(160);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  // ── Medication completion delight sequence ──
  // Ring fills → green pulse → checkmark → settle
  medicationComplete: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(200);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};
