import * as Haptics from 'expo-haptics';

const delay = ms => new Promise(res => setTimeout(res, ms));

export const HapticPatterns = {
  log: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  
  allDone: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(120);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  milestone: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),

  caregiverConnected: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(100);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  attention: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),

  premiumUnlocked: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(160);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(160);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  
  stepComplete: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};
