import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  initializeHealthPlatform,
  checkPermissionStatus,
  fetchSleepSessions,
} from "./healthIntegration";

let ExpoAndroidUsagestats = null;
if (Platform.OS === "android") {
  try {
    ExpoAndroidUsagestats = require("expo-android-usagestats");
  } catch (e) {
    console.warn("Failed to require expo-android-usagestats:", e);
  }
}

export const hasUsageStatsPermission = async () => {
  if (Platform.OS !== "android" || !ExpoAndroidUsagestats) return false;
  try {
    return await ExpoAndroidUsagestats.hasUsageStatsPermission();
  } catch (e) {
    console.warn("Failed to check usage stats permission:", e);
    return false;
  }
};

export const requestUsageStatsPermission = async () => {
  if (Platform.OS !== "android" || !ExpoAndroidUsagestats) return;
  try {
    await ExpoAndroidUsagestats.requestUsageStatsPermission();
  } catch (e) {
    console.warn("Failed to request usage stats permission:", e);
  }
};

export const estimateSleep = async () => {
  try {
    const todayStr = new Date().toDateString();

    // Check if user already prompted/logged today
    const lastPrompted = await AsyncStorage.getItem("last_sleep_prompt_date");
    if (lastPrompted === todayStr) {
      return {
        estimate: null,
        source: "manual",
        confidenceLabel: "manual",
        needsPermission: null,
      };
    }

    // --- Tier 1: Health Connect (Android) or HealthKit (iOS) ---
    const isHealthInit = await initializeHealthPlatform();
    if (isHealthInit) {
      const permStatus = await checkPermissionStatus();
      if (permStatus === "granted") {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sessions = await fetchSleepSessions(since);

        if (sessions && sessions.length > 0) {
          // Sort by endTime descending to get the latest completed sleep session
          const sorted = [...sessions].sort(
            (a, b) => new Date(b.endTime) - new Date(a.endTime),
          );
          const latestSession = sorted[0];
          const start = new Date(latestSession.startTime);
          const end = new Date(latestSession.endTime);
          const durationHours =
            (end.getTime() - start.getTime()) / (1000 * 60 * 60);

          if (durationHours >= 3 && durationHours <= 16) {
            const formatTime = (date) => {
              let hrs = date.getHours();
              const minutes = date.getMinutes();
              const ampm = hrs >= 12 ? "PM" : "AM";
              hrs = hrs % 12;
              hrs = hrs ? hrs : 12;
              const minStr = minutes < 10 ? "0" + minutes : minutes;
              return `${hrs}:${minStr} ${ampm}`;
            };

            return {
              estimate: {
                hours: Math.round(durationHours * 10) / 10,
                rawHours: durationHours,
                startTime: formatTime(start),
                endTime: formatTime(end),
                dateStr: todayStr,
                lastActiveTime: start.getTime(),
                currentTime: end.getTime(),
                source: "native_health",
              },
              source: "health_connect",
              confidenceLabel: "verified",
              needsPermission: null,
              displayTitle: "🌙 Sleep Detected",
              displaySubtitle: "Based on Health Connect",
            };
          }
        }
      }
    }

    // --- Tier 2: UsageStats (Android only) ---
    if (Platform.OS === "android" && ExpoAndroidUsagestats) {
      const hasUsagePerm = await hasUsageStatsPermission();
      if (hasUsagePerm) {
        const now = Date.now();
        const eighteenHoursAgo = now - 18 * 60 * 60 * 1000;

        const events = await ExpoAndroidUsagestats.getUsageEvents(
          eighteenHoursAgo,
          now,
        );
        if (events && events.length > 0) {
          // Filter to only include interactive user events (screen interactive/non-interactive, app foreground/background, unlock, and power events)
          // This prevents background syncs, notifications, and standby bucket changes from splitting quiet periods.
          const interactiveEvents = events.filter(e => 
            e.eventType === 7 ||  // SCREEN_INTERACTIVE / USER_INTERACTION
            e.eventType === 8 ||  // SCREEN_NON_INTERACTIVE
            e.eventType === 10 || // KEYGUARD_HIDDEN (Device unlocked)
            e.eventType === 1 ||  // ACTIVITY_RESUMED
            e.eventType === 2 ||  // ACTIVITY_PAUSED
            e.eventType === 18 || // DEVICE_SHUTDOWN
            e.eventType === 19    // DEVICE_STARTUP
          );

          const sortedEvents = [...(interactiveEvents.length > 0 ? interactiveEvents : events)].sort(
            (a, b) => a.timeStamp - b.timeStamp,
          );

          let maxGapMs = 0;
          let sleepStart = null;
          let sleepEnd = null;

          for (let i = 0; i < sortedEvents.length - 1; i++) {
            const gap =
              sortedEvents[i + 1].timeStamp - sortedEvents[i].timeStamp;
            if (gap > maxGapMs) {
              maxGapMs = gap;
              sleepStart = sortedEvents[i].timeStamp;
              sleepEnd = sortedEvents[i + 1].timeStamp;
            }
          }

          const durationHours = maxGapMs / (1000 * 60 * 60);
          const currentDate = new Date(now);
          const currentHour = currentDate.getHours();

          // Only show if the overnight gap is between 3 and 14 hours and checked during morning/noon hours
          if (
            durationHours >= 3 &&
            durationHours <= 14 &&
            currentHour >= 4 &&
            currentHour < 13
          ) {
            const lastActiveDate = new Date(sleepStart);
            const wakeUpDate = new Date(sleepEnd);

            const formatTime = (date) => {
              let hrs = date.getHours();
              const minutes = date.getMinutes();
              const ampm = hrs >= 12 ? "PM" : "AM";
              hrs = hrs % 12;
              hrs = hrs ? hrs : 12;
              const minStr = minutes < 10 ? "0" + minutes : minutes;
              return `${hrs}:${minStr} ${ampm}`;
            };

            return {
              estimate: {
                hours: Math.round(durationHours * 10) / 10,
                rawHours: durationHours,
                startTime: formatTime(lastActiveDate),
                endTime: formatTime(wakeUpDate),
                dateStr: todayStr,
                lastActiveTime: sleepStart,
                currentTime: sleepEnd,
                source: "device_inactivity",
              },
              source: "usage_stats",
              confidenceLabel: "estimated",
              needsPermission: null,
              displayTitle: "🌙 Estimated Sleep",
              displaySubtitle: "Based on device activity",
            };
          }
        }
      } else {
        // UsageStats permission is not granted - needs permission
        return {
          estimate: null,
          source: "none",
          confidenceLabel: "unavailable",
          needsPermission: "usage_stats",
        };
      }
    }
    // --- Tier 4: No data / unavailable ---
    let needsPerm = "manual";
    if (Platform.OS === "android") {
      const hasUsagePerm = ExpoAndroidUsagestats
        ? await hasUsageStatsPermission()
        : false;
      if (!hasUsagePerm) {
        needsPerm = "usage_stats";
      }
    } else if (Platform.OS === "ios") {
      const isHealthInit = await initializeHealthPlatform();
      let hasHealthPerm = false;
      if (isHealthInit) {
        const permStatus = await checkPermissionStatus();
        hasHealthPerm = permStatus === "granted";
      }
      if (!hasHealthPerm) {
        needsPerm = "health_connect";
      }
    }

    return {
      estimate: null,
      source: "none",
      confidenceLabel: "unavailable",
      needsPermission: needsPerm,
    };
  } catch (e) {
    console.warn("Failed to check estimated sleep:", e.message);
    return {
      estimate: null,
      source: "none",
      confidenceLabel: "unavailable",
      needsPermission: "manual",
    };
  }
};
