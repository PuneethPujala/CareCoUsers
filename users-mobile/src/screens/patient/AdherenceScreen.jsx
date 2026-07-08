import React, {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  ScrollView,
  SafeAreaView,
  Platform,
  Dimensions,
  Easing,
  RefreshControl,
  Modal,
  Alert,
  Image,
} from "react-native";
import { getStreakState } from "../../utils/streakHelper";
import StreakCompanion from "../../components/ui/StreakCompanion";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-chart-kit";
import Svg, { Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import * as Icons from "lucide-react-native";
import {
  Check,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  Target,
  Calendar as CalIcon,
  CheckCircle2,
  Zap,
  ChevronLeft,
  Activity,
  Trophy,
  Clock,
  Sunrise,
  Medal,
  Crown,
  Pill,
  HeartPulse,
  ChevronRight,
  Sparkles,
  Heart,
  Star,
  Share2,
  Flame,
  Lock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  ACHIEVEMENTS,
  TIER_CONFIG,
  CATEGORY_CONFIG,
} from "../../constants/achievements";
import { useFocusEffect } from "@react-navigation/native";
import usePatientStore from "../../store/usePatientStore";
import TabScreenTransition from "../../components/ui/TabScreenTransition";
import RecapStoryModal from "../../components/adherence/RecapStoryModal";
import { layout } from "../../theme";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isToday,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";

const FONT = {
  regular: { fontFamily: "Inter_400Regular" },
  medium: { fontFamily: "Inter_500Medium" },
  semibold: { fontFamily: "Inter_600SemiBold" },
  bold: { fontFamily: "Inter_700Bold" },
  heavy: { fontFamily: "Inter_800ExtraBold" },
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const GRID_COLUMNS = 3;
const GRID_GAP = 12;
const AVAILABLE_WIDTH = SCREEN_WIDTH - 88; // 20*2 ScrollView padding + 20*2 card padding + borders/safety margin
const badgeWidth =
  (AVAILABLE_WIDTH - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

const TIER_ORDER = ["bronze", "silver", "gold", "legendary"];

const getRemainingLabel = (achievement, meta) => {
  if (!achievement) return "";
  const progressVal = achievement.progress || 0;
  const target = meta.target || 1;
  const current = progressVal >= 1 ? target : Math.floor(progressVal * target);
  const remaining = Math.max(0, target - current);

  if (meta.isPercentage) {
    const currentPct = Math.round(progressVal * 100);
    const targetPct = target;
    const remainingPct = Math.max(0, targetPct - currentPct);
    return `${remainingPct}% more to unlock`;
  }

  const category = meta.category;
  if (category === "streaks") {
    return `${remaining} more day${remaining > 1 ? "s" : ""} to unlock`;
  }
  if (category === "perfect_days") {
    return `${remaining} more perfect day${remaining > 1 ? "s" : ""} to unlock`;
  }
  if (category === "doses") {
    return `${remaining} more log${remaining > 1 ? "s" : ""} to unlock`;
  }
  if (category === "routine") {
    if (achievement.key === "score_plus_20") {
      return `${remaining} more point${remaining > 1 ? "s" : ""} to unlock`;
    }
    return `${remaining} more day${remaining > 1 ? "s" : ""} to unlock`;
  }
  return `${remaining} more to unlock`;
};

const getHeroTheme = (scoreValue) => {
  if (scoreValue >= 90) {
    return {
      gradient: [
        "#10B981", // Premium Emerald
        "#059669", 
        "#047857",
        "#065F46",
      ],
      accentGlow: "#34D399",
      textOnHero: "#FFFFFF",
      barBg: "rgba(255, 255, 255, 0.25)",
      barFill: "#34D399",
      ringColor: "#34D399",
    };
  } else {
    return {
      gradient: [
        "#4F46E5", // Midnight Indigo
        "#6366F1", // Electric Purple
        "#7C3AED", // Vibrant Purple
        "#8B5CF6", // Light Violet
      ],
      accentGlow: "#C084FC", // Lavender AI highlight
      textOnHero: "#FFFFFF",
      barBg: "rgba(255, 255, 255, 0.15)",
      barFill: "#C084FC",
      ringColor: "#C084FC",
    };
  }
};

// ── Color System ──────────────────────────────────────────────
const C = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  primary: "#7C3AED", // Unified Purple Theme
  primarySoft: "#FAF5FF", // Lavender Accent Background
  success: "#10B981",
  successBg: "#ECFDF5",
  warning: "#F59E0B",
  warningBg: "#FFFBEB",
  danger: "#F43F5E",
  dangerBg: "#FFF1F2",
  purple: "#7C3AED",
  purpleBg: "#F5F3FF",
  dark: "#0F172A",
  mid: "#334155",
  muted: "#64748B",
  light: "#94A3B8",
  border: "#E2E8F0",
  ring90: "#10B981",
  ring70: "#F59E0B",
  ringLow: "#F43F5E",
};

const LEVEL_COLORS = {
  optimal: "#10B981",
  consistent: "#7C3AED", // Unified Purple Theme
  improving: "#F59E0B",
  beginner: "#94A3B8",
};

const STATUS_COLORS = {
  complete: "#10B981",
  partial: "#F59E0B",
  missed: "#F43F5E",
  none: "#E2E8F0",
  no_medications: "#E2E8F0",
};

const getLevelConfig = (levelKey) => {
  switch (levelKey) {
    case "optimal":
      return { Icon: Sparkles, color: "#34D399" };
    case "consistent":
      return { Icon: Zap, color: "#60A5FA" };
    case "improving":
      return { Icon: Icons.Sprout || Sparkles, color: "#34D399" };
    default:
      return { Icon: Icons.Sprout || Sparkles, color: "#A5F3FC" };
  }
};

const findUnlockDates = (dailyLog) => {
  if (!dailyLog || dailyLog.length === 0) return {};
  const logs = [...dailyLog].sort((a, b) => a.date.localeCompare(b.date));
  const dates = {};

  // 1. first_dose
  const firstDoseLog = logs.find((l) => l.taken > 0);
  if (firstDoseLog) dates["first_dose"] = firstDoseLog.date;

  // 2. first_vital
  const firstVitalLog = logs.find((l) => l.vitals);
  if (firstVitalLog) dates["first_vital"] = firstVitalLog.date;

  // 3. first_perfect_day
  const firstPerfectLog = logs.find((l) => l.total > 0 && l.rate === 100);
  if (firstPerfectLog) dates["first_perfect_day"] = firstPerfectLog.date;

  // Consecutive run tracker for 80%+ (covers 3_day, streak_7, streak_14, streak_30)
  let consecutiveRun = 0;
  for (const l of logs) {
    if (l.rate >= 80) {
      consecutiveRun++;
      if (consecutiveRun >= 3 && !dates["3_day_consistent"])
        dates["3_day_consistent"] = l.date;
      if (consecutiveRun >= 7 && !dates["streak_7"]) dates["streak_7"] = l.date;
      if (consecutiveRun >= 14 && !dates["streak_14"])
        dates["streak_14"] = l.date;
      if (consecutiveRun >= 30 && !dates["streak_30"])
        dates["streak_30"] = l.date;
    } else {
      consecutiveRun = 0;
    }
  }

  // never_missed_morning
  let morningStreak = 0;
  for (const l of logs) {
    const morningMeds = l.medicines || [];
    const hasMorning = morningMeds.some((m) => m.time === "morning");
    const allMorningTaken =
      hasMorning &&
      morningMeds.filter((m) => m.time === "morning").every((m) => m.taken);
    if (allMorningTaken) {
      morningStreak++;
      if (morningStreak >= 3 && !dates["never_missed_morning"])
        dates["never_missed_morning"] = l.date;
    } else if (hasMorning) {
      morningStreak = 0;
    }
  }

  // weekly_90
  for (let i = 6; i < logs.length; i++) {
    const window = logs.slice(i - 6, i + 1);
    const total = window.reduce((s, l) => s + l.total, 0);
    const taken = window.reduce((s, l) => s + l.taken, 0);
    const rate = total > 0 ? (taken / total) * 100 : 0;
    if (rate >= 90 && !dates["weekly_90"]) dates["weekly_90"] = logs[i].date;
  }

  // Perfect days counter (covers first_perfect_day, 7_perfect_days, 30_perfect_days)
  let perfectDaysCount = 0;
  for (const l of logs) {
    if (l.total > 0 && l.rate === 100) {
      perfectDaysCount++;
      if (perfectDaysCount === 7 && !dates["7_perfect_days"])
        dates["7_perfect_days"] = l.date;
      if (perfectDaysCount === 30 && !dates["30_perfect_days"])
        dates["30_perfect_days"] = l.date;
    }
  }

  // night_owl
  let nightStreak = 0;
  for (const l of logs) {
    const nightMeds = l.medicines || [];
    const hasNight = nightMeds.some((m) => m.time === "night");
    const allNightTaken =
      hasNight &&
      nightMeds.filter((m) => m.time === "night").every((m) => m.taken);
    if (allNightTaken) {
      nightStreak++;
      if (nightStreak >= 5 && !dates["night_owl"]) dates["night_owl"] = l.date;
    } else if (hasNight) {
      nightStreak = 0;
    }
  }

  // vitals_tracker
  let vitalsCount = 0;
  for (const l of logs) {
    if (l.vitals) {
      vitalsCount++;
      if (vitalsCount === 10 && !dates["vitals_tracker"])
        dates["vitals_tracker"] = l.date;
    }
  }

  // monthly_consistent (80%+ over 30 days) and adherence_30d_90 (90%+ over 30 days)
  for (let i = 29; i < logs.length; i++) {
    const window = logs.slice(i - 29, i + 1);
    const total = window.reduce((s, l) => s + l.total, 0);
    const taken = window.reduce((s, l) => s + l.taken, 0);
    const rate = total > 0 ? (taken / total) * 100 : 0;
    if (rate >= 80 && window.length >= 25 && !dates["monthly_consistent"])
      dates["monthly_consistent"] = logs[i].date;
    if (rate >= 90 && window.length >= 25 && !dates["adherence_30d_90"])
      dates["adherence_30d_90"] = logs[i].date;
  }

  // 100_doses
  let cumulativeDoses = 0;
  for (const l of logs) {
    cumulativeDoses += l.taken;
    if (cumulativeDoses >= 100 && !dates["100_doses"])
      dates["100_doses"] = l.date;
  }

  // bp_stabilized: 14 consecutive days with BP vitals
  let bpRun = 0;
  for (const l of logs) {
    if (l.vitals && (l.vitals.systolic || l.vitals.blood_pressure_systolic)) {
      bpRun++;
      if (bpRun >= 14 && !dates["bp_stabilized"])
        dates["bp_stabilized"] = l.date;
    } else {
      bpRun = 0;
    }
  }

  // hydration_hero: 5 days logging hydration
  let hydrationCount = 0;
  for (const l of logs) {
    if (l.vitals && l.vitals.hydration != null) {
      hydrationCount++;
      if (hydrationCount === 5 && !dates["hydration_hero"])
        dates["hydration_hero"] = l.date;
    }
  }

  // comprehensive_care: HR, BP, SpO2 on the same day
  for (const l of logs) {
    if (
      l.vitals &&
      l.vitals.heart_rate != null &&
      (l.vitals.systolic != null || l.vitals.blood_pressure_systolic != null) &&
      l.vitals.oxygen_saturation != null
    ) {
      if (!dates["comprehensive_care"]) dates["comprehensive_care"] = l.date;
    }
  }

  // score_plus_20: compare earliest 7 days vs each rolling 7-day window
  if (logs.length >= 14) {
    const earliest7Total = logs.slice(0, 7).reduce((s, l) => s + l.total, 0);
    const earliest7Taken = logs.slice(0, 7).reduce((s, l) => s + l.taken, 0);
    const earliestRate =
      earliest7Total > 0 ? (earliest7Taken / earliest7Total) * 100 : 0;
    for (let i = 13; i < logs.length; i++) {
      const w = logs.slice(i - 6, i + 1);
      const wTotal = w.reduce((s, l) => s + l.total, 0);
      const wTaken = w.reduce((s, l) => s + l.taken, 0);
      const wRate = wTotal > 0 ? (wTaken / wTotal) * 100 : 0;
      if (wRate - earliestRate >= 20 && !dates["score_plus_20"])
        dates["score_plus_20"] = logs[i].date;
    }
  }

  // profile_complete and mood achievements: cannot be determined from dailyLog, omitted (shown without date)

  return dates;
};

const getRelativeTimeString = (dateStr, t) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);

    const diffMs = now - d;
    if (isNaN(diffMs) || diffMs < 0)
      return t("adherence.unlocked_recently", {
        defaultValue: "Unlocked recently",
      });

    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0)
      return t("adherence.unlocked_today", { defaultValue: "Unlocked today" });
    if (diffDays === 1)
      return t("adherence.unlocked_yesterday", {
        defaultValue: "Unlocked yesterday",
      });
    if (diffDays < 7)
      return t("adherence.unlocked_days_ago", {
        defaultValue: `Unlocked ${diffDays} days ago`,
        count: diffDays,
      });

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1)
      return t("adherence.unlocked_last_week", {
        defaultValue: "Unlocked last week",
      });
    if (diffWeeks < 4)
      return t("adherence.unlocked_weeks_ago", {
        defaultValue: `Unlocked ${diffWeeks} weeks ago`,
        count: diffWeeks,
      });

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1)
      return t("adherence.unlocked_last_month", {
        defaultValue: "Unlocked last month",
      });
    return t("adherence.unlocked_months_ago", {
      defaultValue: `Unlocked ${diffMonths} months ago`,
      count: diffMonths,
    });
  } catch {
    return t("adherence.unlocked_recently", {
      defaultValue: "Unlocked recently",
    });
  }
};

// ── Animated Circular Progress ─────────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CircularProgress = ({
  progress,
  size = 160,
  strokeWidth = 14,
  color,
}) => {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: progress,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const ringColor =
    color ||
    (progress >= 90 ? C.ring90 : progress >= 70 ? C.ring70 : C.ringLow);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = animValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        {/* Background ring */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color ? "#F3E8FF" : "rgba(255,255,255,0.15)"}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      {/* Glow for high scores */}
      {progress >= 90 && (
        <Animated.View
          style={{
            position: "absolute",
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            backgroundColor: ringColor + "20",
            transform: [
              {
                scale: animValue.interpolate({
                  inputRange: [85, 100],
                  outputRange: [0.95, 1.06],
                  extrapolate: "clamp",
                }),
              },
            ],
            opacity: animValue.interpolate({
              inputRange: [88, 100],
              outputRange: [0, 1],
              extrapolate: "clamp",
            }),
          }}
        />
      )}
    </View>
  );
};

// ── Animated Number Counter ─────────────────────────────────────
const AnimatedNumber = ({ value, style, suffix = "%" }) => {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: value,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    const listener = animValue.addListener(({ value: v }) =>
      setDisplayValue(Math.round(v)),
    );
    return () => animValue.removeListener(listener);
  }, [value]);

  return (
    <Text style={style}>
      {displayValue}
      {suffix}
    </Text>
  );
};

// ── Feedback Message ────────────────────────────────────────────
const getFeedbackMessage = (score, momentum, t) => {
  if (score >= 95)
    return {
      text: t("adherence.feedback_outstanding", {
        defaultValue: "Outstanding! You're at peak consistency 🌟",
      }),
      color: C.success,
    };
  if (score >= 90)
    return {
      text: t("adherence.feedback_excellent", {
        defaultValue: "Excellent work! You're building great habits 💙",
      }),
      color: C.success,
    };
  if (score >= 80)
    return {
      text: t("adherence.feedback_wonderful", {
        defaultValue: "Wonderful consistency! Keep this rhythm going ✨",
      }),
      color: C.primary,
    };
  if (score >= 70)
    return {
      text: t("adherence.feedback_good", {
        defaultValue:
          "Good progress! Every dose counts toward better health 🌿",
      }),
      color: C.primary,
    };
  if (score >= 50)
    return {
      text: t("adherence.feedback_improving", {
        defaultValue: "You're improving! Small steps lead to big changes 🌱",
      }),
      color: C.warning,
    };
  if (momentum === "rising")
    return {
      text: t("adherence.feedback_rising", {
        defaultValue: "Your recent trend is looking up! 📈",
      }),
      color: C.primary,
    };
  return {
    text: t("adherence.feedback_start", {
      defaultValue: "Every new day is a fresh start. You've got this 💪",
    }),
    color: C.muted,
  };
};

// ── Calendar Day Cell ───────────────────────────────────────────
const CalendarDay = ({ date, status, isCurrentMonth, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const todayFlag = isToday(date);
  const bg = STATUS_COLORS[status] || "transparent";

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.2,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    if (onPress) onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2.5 }}
    >
      <Animated.View
        style={[
          styles.dayCell,
          {
            opacity: isCurrentMonth ? 1 : 0.25,
            backgroundColor:
              status && status !== "none" && status !== "no_medications"
                ? status === "complete"
                  ? "#ECFDF5"
                  : bg + "22"
                : todayFlag
                  ? C.primarySoft
                  : "transparent",
            borderWidth: todayFlag
              ? 2
              : status && status !== "none" && status !== "no_medications"
                ? 1.5
                : 0,
            borderColor: todayFlag
              ? C.primary
              : status && status !== "none" && status !== "no_medications"
                ? status === "complete"
                  ? "#A7F3D0"
                  : bg + "60"
                : "transparent",
            transform: [{ scale: scaleAnim }],
            position: "relative",
          },
        ]}
      >
        <Text
          style={[
            styles.dayText,
            todayFlag && { color: C.primary, fontWeight: "800" },
            status === "complete" && { color: "#065F46", fontWeight: "800" },
            status === "partial" && { color: C.warning, fontWeight: "750" },
            status === "missed" && { color: C.danger, fontWeight: "750" },
          ]}
        >
          {format(date, "d")}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// ── Skeleton Loader ─────────────────────────────────────────────
const Skeleton = ({ width, height, borderRadius = 10, style }) => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "#E2E8F0",
          opacity: anim,
        },
        style,
      ]}
    />
  );
};

// ══════════════════════════════════════════════════════════════
// ══ MAIN SCREEN ═══════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
const RECAP_TABS = ["weekly", "monthly", "yearly"];
const getRecapLabels = (t) => ({
  weekly: t("adherence.weekly", { defaultValue: "Weekly" }),
  monthly: t("adherence.monthly", { defaultValue: "Monthly" }),
  yearly: t("adherence.yearly", { defaultValue: "Yearly" }),
});

// ── GAMIFICATION COMPONENTS ────────────────────────────────────
const grad = (c) => c || ["#3B82F6", "#60A5FA"];

function ProgressRing({ percent, size = 84, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <View
      style={{ width: size, height: size, transform: [{ rotate: "-90deg" }] }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="white"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function CategoryHeaderUi({ category, unlockedCount, totalCount }) {
  const IconComponent = Icons[category.iconName] || Icons.Star;
  const accent = category.accent || ["#3B82F6", "#60A5FA"];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <LinearGradient
          colors={accent}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <IconComponent size={16} color="white" />
        </LinearGradient>
        <Text style={{ fontSize: 15, fontWeight: "800", color: "#0F172A" }}>
          {category.title}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: accent[0] + "14",
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "700", color: accent[0] }}>
          {unlockedCount}/{totalCount}
        </Text>
      </View>
    </View>
  );
}

const getUnlockedLabel = (data) => {
  const key = data.key;
  switch (key) {
    case "streak_14":
      return "2/2 weeks";
    case "bp_stabilized":
      return "14/14 days";
    case "hydration_hero":
      return "5/5 days";
    case "mindful_week":
      return "7/7 days";
    case "7_perfect_days":
      return "7/7 perfect days";
    case "night_owl":
      return "5/5 nights";
    case "vitals_tracker":
      return "10/10 days";
    case "100_doses":
      return "100/100 doses";
    case "profile_complete":
      return "100% complete";
    case "streak_30":
      return "30/30 days";
    case "30_perfect_days":
      return "30/30 perfect days";
    default:
      return "Achieved";
  }
};

function PremiumBadge({ data, size = "normal", onPress, style }) {
  const isSmall = size === "small";
  const dim = isSmall ? 50 : 62;
  const IconComponent = Icons[data.meta.iconName] || Icons.Award;
  const colors = data.tierConfig.gradient;
  const itemWidth = style?.width || badgeWidth;

  const target = data.meta.target || 1;
  const current =
    data.progress >= 1 ? target : Math.floor((data.progress || 0) * target);
  const pct = Math.min(100, (data.progress || 0) * 100);
  const tierColor = data.tierConfig.color;

  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.93,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  };

  if (!data.unlocked) {
    const ringSize = dim;
    const strokeWidth = 3;
    const r = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const strokeDashoffset = circumference - (pct / 100) * circumference;

    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          !isSmall && {
            width: itemWidth,
            minHeight: 140,
            backgroundColor: "rgba(248, 250, 252, 0.65)",
            borderRadius: 22,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            paddingVertical: 14,
            paddingHorizontal: 6,
            alignItems: "center",
            justifyContent: "space-between",
          },
          isSmall && { width: itemWidth, alignItems: "center" },
          style,
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pressScale }], width: "100%", height: isSmall ? undefined : "100%", alignItems: "center", justifyContent: isSmall ? undefined : "space-between" }}>
          <View style={{ alignItems: "center", width: "100%" }}>
          {/* Ringed locked medal container */}
          <View
            style={{
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              ...(isSmall
                ? {
                    borderWidth: 1,
                    borderColor: "#CBD5E1",
                    backgroundColor: "#FFFFFF",
                  }
                : {}),
            }}
          >
            {/* SVG Progress Ring only for grid/large nodes */}
            {!isSmall && (
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, transform: [{ rotate: "-90deg" }] }}>
                <Svg width={dim} height={dim}>
                  <Circle
                    cx={dim / 2}
                    cy={dim / 2}
                    r={r}
                    stroke="#E2E8F0"
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  <Circle
                    cx={dim / 2}
                    cy={dim / 2}
                    r={r}
                    stroke={tierColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            )}

            <View
              style={{
                width: dim - 6,
                height: dim - 6,
                borderRadius: (dim - 6) / 2,
                backgroundColor: "rgba(148, 163, 184, 0.08)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {data.meta.iconName === "Shield" ? (
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <IconComponent
                    size={isSmall ? 20 : 26}
                    color="#64748B"
                    style={{ opacity: 0.65 }}
                  />
                  <Icons.Star
                    size={isSmall ? 8 : 10}
                    color="#64748B"
                    fill="#64748B"
                    style={{ position: "absolute", top: isSmall ? 5 : 7, opacity: 0.65 }}
                  />
                </View>
              ) : (
                <IconComponent
                  size={isSmall ? 20 : 26}
                  color="#64748B"
                  style={{ opacity: 0.65 }}
                />
              )}
            </View>

            <View
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                backgroundColor: "#94A3B8",
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#FFFFFF",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 1,
                elevation: 1,
                zIndex: 10,
              }}
            >
              <Lock size={8} color="white" />
            </View>
          </View>

          <Text
            style={{
              fontSize: 11,
              fontWeight: "750",
              color: "#64748B",
              marginTop: 10,
              textAlign: "center",
              lineHeight: 14,
              paddingHorizontal: 2,
            }}
            numberOfLines={2}
          >
            {data.meta.title || data.key}
          </Text>
        </View>

        {!isSmall && (
          <View style={{ alignItems: "center", width: "100%", marginTop: 8 }}>
            {target > 1 ? (
              <View style={{ width: "80%", alignItems: "center", marginTop: 2 }}>
                <Text style={{ fontSize: 10, ...FONT.heavy, color: "#64748B", marginBottom: 4 }}>
                  {current}/{target}
                </Text>
                <View style={{
                  width: "100%",
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#E2E8F0",
                  overflow: "hidden",
                }}>
                  <View style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 2,
                    backgroundColor: tierColor,
                  }} />
                </View>
              </View>
            ) : (
              <View style={{
                borderColor: '#E2E8F0',
                borderWidth: 1,
                backgroundColor: '#F8FAFC',
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                marginTop: 4,
              }}>
                <Text style={{ fontSize: 9, ...FONT.heavy, color: '#94A3B8' }}>LOCKED</Text>
              </View>
            )}
          </View>
        )}
        </Animated.View>
      </Pressable>
    );
  }

  // Unlocked State
  const label = getUnlockedLabel(data);
  const statusColor = (label === "Achieved" || label.endsWith("complete") || label.endsWith("perfect days")) ? "#10B981" : "#64748B";

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        !isSmall && {
          width: itemWidth,
          minHeight: 140,
          backgroundColor: "#FFFFFF",
          borderRadius: 22,
          borderWidth: 1,
          borderColor: tierColor + "25",
          paddingVertical: 14,
          paddingHorizontal: 6,
          alignItems: "center",
          justifyContent: "space-between",
          shadowColor: tierColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 2,
          position: "relative",
        },
        isSmall && { width: itemWidth, alignItems: "center" },
        style,
      ]}
    >
      <Animated.View style={{ transform: [{ scale: pressScale }], width: "100%", height: isSmall ? undefined : "100%", alignItems: "center", justifyContent: isSmall ? undefined : "space-between" }}>
        <View style={{ alignItems: "center", width: "100%" }}>
        {/* Metallic Ring - Outer Gradient Circle */}
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: dim,
            height: dim,
            borderRadius: dim / 2,
            padding: 3,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: tierColor,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 3,
            position: "relative",
          }}
        >
          {/* Inner Core Gradient */}
          <LinearGradient
            colors={colors.slice().reverse()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: (dim - 6) / 2,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.45)",
            }}
          >
            {/* Concentric Dotted Circle Inside Core */}
            <View
              style={{
                width: "85%",
                height: "85%",
                borderRadius: ((dim - 6) * 0.85) / 2,
                borderWidth: 0.8,
                borderColor: "rgba(255,255,255,0.25)",
                borderStyle: "dashed",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {data.meta.iconName === "Shield" ? (
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <IconComponent
                    size={isSmall ? 18 : 24}
                    color="white"
                    style={{
                      textShadowColor: "rgba(0,0,0,0.15)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 2,
                    }}
                  />
                  <Icons.Star
                    size={isSmall ? 8 : 10}
                    color="white"
                    fill="white"
                    style={{ position: "absolute", top: isSmall ? 4 : 6 }}
                  />
                </View>
              ) : (
                <IconComponent
                  size={isSmall ? 18 : 24}
                  color="white"
                  style={{
                    textShadowColor: "rgba(0,0,0,0.15)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }}
                />
              )}
            </View>
          </LinearGradient>

          {/* Checkmark icon for unlocked items */}
          {data.meta.tier !== "legendary" && (
            <View
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                backgroundColor: "#10B981",
                width: 18,
                height: 18,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#FFFFFF",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 1,
                elevation: 2,
                zIndex: 10,
              }}
            >
              <Check size={9} color="white" strokeWidth={4} />
            </View>
          )}

          {/* Crown badge for legendary */}
          {data.meta.tier === "legendary" && (
            <View
              style={{
                position: "absolute",
                top: -5,
                right: -5,
                backgroundColor: "#FBBF24",
                borderRadius: 10,
                width: 18,
                height: 18,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#FFFFFF",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.15,
                shadowRadius: 2,
                elevation: 2,
                zIndex: 10,
              }}
            >
              <Icons.Crown size={9} color="#7C3AED" fill="#7C3AED" />
            </View>
          )}
        </LinearGradient>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            color: "#0F172A",
            marginTop: 10,
            textAlign: "center",
            lineHeight: 14,
            paddingHorizontal: 2,
          }}
          numberOfLines={2}
        >
          {data.meta.title || data.key}
        </Text>
      </View>

      {!isSmall && (
        <View style={{
          marginTop: 8,
          alignItems: 'center',
        }}>
          <Text style={{ fontSize: 10, ...FONT.bold, color: statusColor }}>{label}</Text>
        </View>
      )}
      </Animated.View>
    </Pressable>
  );
}

function TimelineLayout({ badges, onSelect }) {
  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const accentColors = CATEGORY_CONFIG.perfect_days?.accent || [
    "#3B82F6",
    "#60A5FA",
  ];

  return (
    <View
      style={{
        position: "relative",
        width: 240,
        alignSelf: "center",
        paddingTop: 6,
        paddingBottom: 6,
      }}
    >
      {/* Background line track */}
      <View
        style={{
          position: "absolute",
          top: 31,
          left: 35,
          right: 35,
          height: 4,
          borderRadius: 2,
          backgroundColor: "#E2E8F0",
        }}
      />

      {/* Colored progress line overlay */}
      {unlockedCount > 1 && (
        <View
          style={{
            position: "absolute",
            top: 31,
            left: 35,
            right: 35,
            height: 4,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: unlockedCount === 2 ? "50%" : "100%",
              height: "100%",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={accentColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          zIndex: 1,
        }}
      >
        {badges.map((b, i) => (
          <PremiumBadge
            key={i}
            data={b}
            size="small"
            onPress={() => onSelect(b)}
            style={{ width: 70, marginBottom: 0 }}
          />
        ))}
      </View>
    </View>
  );
}

export default function AdherenceScreen({ navigation }) {
  const { t } = useTranslation();
  const adherenceDetails = usePatientStore((s) => s.adherenceDetails);
  const adherenceRecap = usePatientStore((s) => s.adherenceRecap);
  const fetchAdherenceDetails = usePatientStore((s) => s.fetchAdherenceDetails);
  const fetchAdherenceRecap = usePatientStore((s) => s.fetchAdherenceRecap);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recapLoading, setRecapLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeRecapTab, setActiveRecapTab] = useState("weekly");
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const badgeScaleAnim = useRef(new Animated.Value(0)).current;
  const badgeRotateAnim = useRef(new Animated.Value(0)).current;

  const handleBadgePress = (badge) => {
    try {
      Haptics.selectionAsync();
    } catch (e) {}

    const meta = ACHIEVEMENTS.find((a) => a.key === badge.key) || {};

    // Retrieve unlock date & calculate relative unlocked time
    const unlockDates = findUnlockDates(dailyLog);
    const unlockDate = unlockDates[badge.key];
    const relativeTime = unlockDate
      ? getRelativeTimeString(unlockDate, t)
      : null;

    setSelectedBadge({
      ...badge,
      iconName: meta.iconName,
      target: meta.target,
      unlockedTime: relativeTime,
    });

    scaleAnim.setValue(0.3);
    badgeScaleAnim.setValue(0);
    badgeRotateAnim.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(badgeScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 35,
        useNativeDriver: true,
      }),
      Animated.spring(badgeRotateAnim, {
        toValue: 1,
        friction: 6,
        tension: 30,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCloseBadgeModal = () => {
    try {
      Haptics.selectionAsync();
    } catch (e) {}
    setSelectedBadge(null);
  };

  // Use ref to avoid double-fetch when tab changes while screen is focused
  const activeRecapTabRef = useRef("weekly");
  useEffect(() => {
    activeRecapTabRef.current = activeRecapTab;
  }, [activeRecapTab]);

  // Tab slide indicator
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const tabWidth = (SCREEN_WIDTH - 48) / 3;

  // Stagger animations — 7 unique slots
  const staggerAnims = useRef(
    [...Array(7)].map(() => new Animated.Value(0)),
  ).current;

  const runAnimations = useCallback(() => {
    staggerAnims.forEach((a) => a.setValue(0));
    Animated.stagger(
      100,
      staggerAnims.map((a) =>
        Animated.spring(a, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [staggerAnims]);

  const loadData = useCallback(async () => {
    await Promise.all([
      fetchAdherenceDetails(),
      fetchAdherenceRecap(activeRecapTabRef.current),
    ]);
    setLoading(false);
    runAnimations();
  }, [fetchAdherenceDetails, fetchAdherenceRecap, runAnimations]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const switchRecapTab = async (tab) => {
    const idx = RECAP_TABS.indexOf(tab);
    Animated.spring(tabSlideAnim, {
      toValue: idx * tabWidth,
      friction: 8,
      useNativeDriver: true,
    }).start();
    setActiveRecapTab(tab);

    const cached = usePatientStore.getState().adherenceRecaps?.[tab];
    if (!cached) {
      setRecapLoading(true);
      usePatientStore.setState({ adherenceRecap: null });
    }
    await fetchAdherenceRecap(tab);
    setRecapLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Clear cache on pull-to-refresh
    usePatientStore.setState({
      adherenceRecaps: { weekly: null, monthly: null, yearly: null },
    });
    await Promise.all([
      fetchAdherenceDetails(),
      fetchAdherenceRecap(activeRecapTabRef.current, true),
      usePatientStore
        .getState()
        .fetchDashboard(true)
        .catch(() => {}),
      usePatientStore
        .getState()
        .fetchMedications()
        .catch(() => {}),
    ]);
    setRefreshing(false);
  };

  // ── Derived data ──────────────────────────────────────────
  const data = adherenceDetails || {};
  const score = data.score || { weekly: 0, monthly: 0 };
  const level = data.level || {
    key: "beginner",
    label: "Beginner",
    emoji: "🌱",
  };
  const momentum = data.momentum || "steady";
  const today = data.today || { taken: 0, total: 0, completed: false };
  const dailyLog = data.daily_log || [];
  const achievements = data.achievements || [];
  const weeklySummary = data.weekly_summary || {
    taken: 0,
    missed: 0,
    improvement: 0,
  };
  const vitalsAdherence = data.vitals_adherence || 0;
  const insights = data.insights || [];
  const streak = data.streak || 0;
  const weeklyTrend = data.weekly_trend || [];

  const feedback = getFeedbackMessage(score.monthly, momentum, t);
  const levelColor = LEVEL_COLORS[level.key] || C.light;

  const MomentumIcon =
    momentum === "rising"
      ? TrendingUp
      : momentum === "falling"
        ? TrendingDown
        : Minus;
  const momentumColor =
    momentum === "rising"
      ? C.success
      : momentum === "falling"
        ? C.danger
        : C.warning;
  const momentumLabel =
    momentum === "rising"
      ? t("adherence.rising", { defaultValue: "Rising" })
      : momentum === "falling"
        ? t("adherence.falling", { defaultValue: "Falling" })
        : t("adherence.steady", { defaultValue: "Steady" });

  const heroScore =
    activeRecapTab === "weekly"
      ? score.weekly
      : activeRecapTab === "yearly"
        ? (adherenceRecap?.adherence_rate ?? score.monthly)
        : score.monthly;
  const heroTheme = getHeroTheme(heroScore);
  const ringColor = heroTheme.ringColor;

  // Calendar
  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentMonth)),
      end: endOfWeek(endOfMonth(currentMonth)),
    });
  }, [currentMonth]);

  const dailyLogMap = useMemo(() => {
    const map = {};
    dailyLog.forEach((d) => {
      map[d.date] = d;
    });
    return map;
  }, [dailyLog]);

  const achievementsByCategory = useMemo(() => {
    const groups = {};
    Object.keys(CATEGORY_CONFIG).forEach((cat) => {
      groups[cat] = [];
    });

    achievements.forEach((achievement) => {
      const meta = ACHIEVEMENTS.find((a) => a.key === achievement.key) || {};
      const cat = meta.category || "routine";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(achievement);
    });

    const tierOrder = { bronze: 1, silver: 2, gold: 3, legendary: 4 };
    Object.keys(groups).forEach((cat) => {
      groups[cat].sort((a, b) => {
        const metaA = ACHIEVEMENTS.find((m) => m.key === a.key) || {};
        const metaB = ACHIEVEMENTS.find((m) => m.key === b.key) || {};
        return (tierOrder[metaA.tier] || 1) - (tierOrder[metaB.tier] || 1);
      });
    });

    return groups;
  }, [achievements]);

  const totalAchievementsCount = achievements.length;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const completionPercentage =
    totalAchievementsCount > 0
      ? Math.round((unlockedCount / totalAchievementsCount) * 100)
      : 0;

  const nextGoal = useMemo(() => {
    const locked = achievements.filter((a) => !a.unlocked);
    if (locked.length === 0) return null;

    const sorted = [...locked].sort((a, b) => {
      const progressA = a.progress || 0;
      const progressB = b.progress || 0;
      return progressB - progressA;
    });

    const best = sorted[0];
    const meta = ACHIEVEMENTS.find((m) => m.key === best.key) || {};
    return { ...best, meta };
  }, [achievements]);

  const recentUnlocks = useMemo(() => {
    const unlocked = achievements.filter((a) => a.unlocked);
    if (unlocked.length === 0) return [];

    const tierOrder = { legendary: 1, gold: 2, silver: 3, bronze: 4 };
    const sorted = [...unlocked].sort((a, b) => {
      const metaA = ACHIEVEMENTS.find((m) => m.key === a.key) || {};
      const metaB = ACHIEVEMENTS.find((m) => m.key === b.key) || {};
      return (tierOrder[metaA.tier] || 4) - (tierOrder[metaB.tier] || 4);
    });

    const unlockDates = findUnlockDates(dailyLog);

    return sorted.slice(0, 3).map((badge) => {
      const meta = ACHIEVEMENTS.find((a) => a.key === badge.key) || {};
      const tierConfig = TIER_CONFIG[meta.tier] || TIER_CONFIG.bronze;
      const unlockDate = unlockDates[badge.key];
      // Show real date if available; otherwise show tier label — no fake timestamps
      const relativeTime = unlockDate
        ? getRelativeTimeString(unlockDate, t)
        : `${tierConfig.label} ${t("common.achievement", { defaultValue: "Achievement" })}`;
      return {
        ...badge,
        meta,
        unlockedTime: relativeTime,
      };
    });
  }, [achievements, dailyLog, t]);

  const anim = (i) => ({
    opacity: staggerAnims[i],
    transform: [
      {
        translateY: staggerAnims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  });

  // ── Loading Skeleton ────────────────────────────────────
  if (loading) {
    return (
      <TabScreenTransition>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={styles.header}>
          <Skeleton width={40} height={40} borderRadius={14} />
          <Skeleton width={160} height={22} style={{ marginLeft: 12 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Skeleton width="100%" height={220} borderRadius={28} />
          <Skeleton width="100%" height={80} borderRadius={20} />
          <Skeleton width="100%" height={130} borderRadius={20} />
          <Skeleton width="100%" height={200} borderRadius={20} />
        </ScrollView>
      </SafeAreaView>
      </TabScreenTransition>
    );
  }

  return (
    <TabScreenTransition>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {/* Ambient Background Decorations (Level 3: Light) */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg height="100%" width="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
            <Defs>
              <SvgLinearGradient id="adherenceTopBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.4" />
                <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            {/* Top right curvy gradient backdrop */}
            <Path d="M180 0 C260 120, 320 150, 400 120 L400 0 Z" fill="url(#adherenceTopBg)" />
          </Svg>
        </View>

        <SafeAreaView style={{ flex: 1 }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={22} color={C.dark} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>
              {t("common.adherence", { defaultValue: "Adherence" })}
            </Text>
            <Text style={styles.headerSub}>
              {t("adherence.header_sub", {
                defaultValue: "Track your medication journey",
              })}
            </Text>
          </View>
          <Pressable
            style={styles.shareBtn}
            onPress={() => setShowStoryModal(true)}
          >
            <Share2 size={15} color="#FFF" />
            <Text style={styles.shareBtnText}>
              {t("adherence.share", { defaultValue: "Share" })}
            </Text>
          </Pressable>
        </View>

        {/* ── Period Tabs ── */}
        <View style={styles.tabsContainer}>
          <View style={styles.tabsInner}>
            <Animated.View
              style={[
                styles.tabSlider,
                {
                  width: tabWidth - 4,
                  transform: [{ translateX: tabSlideAnim }],
                },
              ]}
            />
            {RECAP_TABS.map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tab, { width: tabWidth }]}
                onPress={() => switchRecapTab(tab)}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeRecapTab === tab && styles.tabTextActive,
                  ]}
                >
                  {getRecapLabels(t)[tab]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.primary}
            />
          }
        >
          {/* ── [0] Hero Gradient Card (Redesigned Light Theme Fitbit style) ── */}
          <Animated.View style={[anim(0), { position: "relative" }]}>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "rgba(15, 23, 42, 0.04)",
                  shadowColor: "#000000",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.04,
                  shadowRadius: 24,
                  elevation: 3,
                },
              ]}
            >
              {/* Sparkles decoration (Background layer) */}
              <View
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  opacity: 0.35,
                  zIndex: 1,
                }}
              >
                <Icons.Sparkles size={20} color="#7C3AED" />
              </View>

              {/* Foreground Content Layer */}
              <View style={{ zIndex: 2, position: "relative" }}>
                <View style={styles.heroTopRow}>
                  {/* Ring */}
                  <View style={styles.heroRingWrap}>
                    <CircularProgress
                      progress={heroScore}
                      size={148}
                      strokeWidth={13}
                      color="#7C3AED"
                    />
                    <View style={styles.heroRingCenter}>
                      <AnimatedNumber
                        value={heroScore}
                        style={styles.heroRingPercent}
                      />
                      <Text style={styles.heroRingLabel}>
                        {getRecapLabels(t)[activeRecapTab]}
                      </Text>
                    </View>
                  </View>

                  {/* Right stats */}
                  <View style={styles.heroRightCol}>
                    <View style={styles.heroStatBox}>
                      <Text style={styles.heroStatLabel}>
                        {t("adherence.score", { defaultValue: "Score" })}
                      </Text>
                      <AnimatedNumber
                        value={adherenceRecap?.adherence_rate ?? score.weekly}
                        style={styles.heroStatValue}
                      />
                    </View>
                    <View style={styles.heroStatDivider} />
                    <View style={styles.heroStatBox}>
                      <Text style={styles.heroStatLabel}>
                        {t("adherence.momentum", { defaultValue: "Momentum" })}
                      </Text>
                      <View style={styles.momentumPill}>
                        <View style={styles.momentumIconContainer}>
                          <MomentumIcon size={12} color="#7C3AED" />
                        </View>
                        <Text style={styles.momentumText}>{momentumLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.heroStatDivider} />
                    <View style={styles.heroStatBox}>
                      <Text style={styles.heroStatLabel}>
                        {t("adherence.level", { defaultValue: "Level" })}
                      </Text>
                      {(() => {
                        const lvlCfg = getLevelConfig(level.key);
                        const LvlIcon = lvlCfg.Icon;
                        return (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              marginTop: 4,
                            }}
                          >
                            <LvlIcon size={14} color="#7C3AED" />
                            <Text
                              style={[
                                styles.heroStatValue,
                                { color: "#7C3AED", fontSize: 13 },
                              ]}
                            >
                              {level.label}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                </View>

                {/* Today's progress bar */}
                <View style={styles.heroProgressSection}>
                  <View style={styles.heroProgressHeader}>
                    <Target size={13} color="#7C3AED" />
                    <Text style={styles.heroProgressTitle}>
                      {t("adherence.todays_goal", {
                        defaultValue: "Today's Goal",
                      })}
                    </Text>
                    <Text style={styles.heroProgressCount}>
                      {today.taken}
                      <Text style={{ fontSize: 13, opacity: 0.6 }}>
                        /{today.total || "—"}{" "}
                        {t("adherence.doses", { defaultValue: "doses" })}
                      </Text>
                    </Text>
                    {today.completed && (
                      <View style={styles.heroCompletedPill}>
                        <Sparkles size={10} color="#10B981" />
                        <Text style={styles.heroCompletedText}>
                          {t("adherence.done", { defaultValue: "Done!" })}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={[
                      styles.heroProgressBg,
                      { backgroundColor: "#F3E8FF" },
                    ]}
                  >
                    <Animated.View
                      style={[
                        styles.heroProgressFill,
                        {
                          width:
                            today.total > 0
                              ? `${Math.min(100, (today.taken / today.total) * 100)}%`
                              : "0%",
                          backgroundColor: today.completed
                            ? "#10B981"
                            : "#7C3AED",
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ── [1] Streak Banner with Companion ── */}
          <Animated.View style={anim(1)}>
            {(() => {
              const companion = getStreakState(streak, dailyLog);
              return (
                <View
                  style={[
                    styles.streakCard,
                    {
                      backgroundColor: "#FAF5FF",
                      borderWidth: 1,
                      borderColor: "#F3E8FF",
                      shadowColor: "#7C3AED",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.03,
                      shadowRadius: 10,
                      elevation: 2,
                    },
                  ]}
                >
                  <View style={styles.streakLeft}>
                    <View
                      style={[
                        styles.companionImageWrap,
                        {
                          backgroundColor: "#FFFFFF",
                          borderColor: "#F3E8FF",
                          borderWidth: 1.5,
                        },
                      ]}
                    >
                      <StreakCompanion
                        streak={streak}
                        dailyLog={dailyLog}
                        size={48}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.streakNum}>
                        {t("adherence.streak_days", {
                          defaultValue: "{{streak}} Day Streak",
                          streak,
                        })}
                      </Text>
                      <Text style={styles.companionLabel}>
                        {companion.label}
                      </Text>
                      <Text style={styles.streakSub}>{companion.subtitle}</Text>
                    </View>
                  </View>
                  {streak > 0 && (
                    <View style={styles.streakBadge}>
                      <Text style={styles.streakBadgeNum}>{streak}</Text>
                      <Text style={styles.streakBadgeLabel}>
                        {t("adherence.days", { defaultValue: "DAYS" })}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </Animated.View>

          {/* ── [2] Recap Stats ── */}
          {recapLoading || !adherenceRecap ? (
            <Animated.View style={anim(2)}>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Skeleton width={120} height={18} />
                  <Skeleton width={80} height={20} borderRadius={10} />
                </View>

                <View style={styles.recapStatsRow}>
                  {[1, 2, 3].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.recapStatCard,
                        { borderColor: "#E2E8F0", borderWidth: 1 },
                      ]}
                    >
                      <Skeleton
                        width={32}
                        height={32}
                        borderRadius={16}
                        style={{ marginBottom: 8 }}
                      />
                      <Skeleton
                        width={45}
                        height={20}
                        borderRadius={6}
                        style={{ marginBottom: 6 }}
                      />
                      <Skeleton width={60} height={10} borderRadius={3} />
                    </View>
                  ))}
                </View>
                <Skeleton width={180} height={12} style={{ marginTop: 12 }} />
              </View>
            </Animated.View>
          ) : (
            <Animated.View style={anim(2)}>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>
                    {activeRecapTab === "yearly" &&
                    adherenceRecap.is_all_time_fallback
                      ? t("adherence.all_time_recap", {
                          defaultValue: "ALL TIME RECAP",
                        })
                      : t("adherence.recap_title", {
                          defaultValue: "{{tab}} RECAP",
                          tab: getRecapLabels(t)[activeRecapTab].toUpperCase(),
                        })}
                  </Text>
                  <View
                    style={[
                      styles.levelPill,
                      {
                        backgroundColor:
                          (adherenceRecap.level?.key === "optimal"
                            ? C.success
                            : adherenceRecap.level?.key === "consistent"
                              ? C.primary
                              : C.warning) + "18",
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12 }}>
                      {adherenceRecap.level?.emoji || "🌱"}
                    </Text>
                    <Text
                      style={[
                        styles.levelPillText,
                        {
                          color:
                            adherenceRecap.level?.key === "optimal"
                              ? C.success
                              : adherenceRecap.level?.key === "consistent"
                                ? C.primary
                                : C.warning,
                        },
                      ]}
                    >
                      {adherenceRecap.level?.label
                        ? t(`adherence.level_${adherenceRecap.level.key}`, {
                            defaultValue: adherenceRecap.level.label,
                          })
                        : t("adherence.level_beginner", {
                            defaultValue: "Beginner",
                          })}
                    </Text>
                  </View>
                </View>

                <View style={styles.recapStatsRow}>
                  {(() => {
                    const RECAP_ITEMS = [
                      {
                        label: t("common.adherence", {
                          defaultValue: "Adherence",
                        }),
                        value: `${adherenceRecap.adherence_rate || 0}%`,
                        color: "#7C3AED",
                        bg: "#FAF5FF",
                        Icon: CheckCircle2,
                      },
                      {
                        label: t("adherence.perfect_days", {
                          defaultValue: "Perfect Days",
                        }),
                        value: adherenceRecap.perfect_days || 0,
                        color: "#7C3AED",
                        bg: "#FAF5FF",
                        Icon: CalIcon,
                      },
                      {
                        label: t("adherence.doses_taken", {
                          defaultValue: "Doses Taken",
                        }),
                        value: adherenceRecap.total_doses_taken || 0,
                        color: "#7C3AED",
                        bg: "#FAF5FF",
                        Icon: Icons.Pill || Sparkles,
                      },
                    ];
                    return RECAP_ITEMS.map((item, i) => {
                      const CardIcon = item.Icon;
                      return (
                        <View key={i} style={styles.recapStatCard}>
                          <View
                            style={[
                              styles.recapStatCardIconBg,
                              { backgroundColor: item.bg },
                            ]}
                          >
                            <CardIcon size={16} color={item.color} />
                          </View>
                          <Text
                            style={[
                              styles.recapStatCardValue,
                              { color: item.color },
                            ]}
                          >
                            {item.value}
                          </Text>
                          <Text style={styles.recapStatCardLabel}>
                            {item.label}
                          </Text>
                        </View>
                      );
                    });
                  })()}
                </View>

                {adherenceRecap.improvement_vs_previous !== 0 && (
                  <View style={styles.tipBanner}>
                    <Sparkles size={14} color="#7C3AED" />
                    <Text style={styles.tipText}>
                      {t("adherence.improvement_tip_prefix", {
                        defaultValue: "You're ",
                      })}
                      <Text style={styles.tipBoldText}>
                        {Math.abs(adherenceRecap.improvement_vs_previous)}%
                      </Text>
                      {adherenceRecap.improvement_vs_previous > 0
                        ? t("adherence.improvement_tip_more", {
                            defaultValue: " ahead of your previous ",
                          })
                        : t("adherence.improvement_tip_away", {
                            defaultValue: " away from your previous ",
                          })}
                      {activeRecapTab === "yearly"
                        ? t("adherence.year", { defaultValue: "year" })
                        : activeRecapTab === "monthly"
                          ? t("adherence.month", { defaultValue: "month" })
                          : t("adherence.week", { defaultValue: "week" })}
                      {t("adherence.improvement_tip_suffix", {
                        defaultValue:
                          ". Keep going! Consistency builds results.",
                      })}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* ── [3] Feedback + Insights ── */}
          <Animated.View style={anim(3)}>
            <View
              style={[
                styles.feedbackBanner,
                {
                  backgroundColor: feedback.color + "12",
                  borderColor: feedback.color + "30",
                },
              ]}
            >
              <Heart
                size={16}
                color={feedback.color}
                fill={feedback.color + "40"}
              />
              <Text style={[styles.feedbackText, { color: feedback.color }]}>
                {feedback.text}
              </Text>
            </View>

            {insights.length > 0 && (
              <View style={{ gap: 10, marginBottom: 20 }}>
                {insights.map((insight, idx) => (
                  <View key={idx} style={styles.insightCard}>
                    <View style={styles.insightLeft}>
                      <View style={styles.insightIconBox}>
                        <Sparkles size={14} color={C.purple} />
                      </View>
                      <Text style={styles.insightText}>{insight}</Text>
                    </View>
                    {insight.includes("afternoon") && (
                      <Pressable
                        style={styles.reminderBtn}
                        onPress={() =>
                          Alert.alert(
                            t("adherence.set_reminder", {
                              defaultValue: "Set Reminder",
                            }),
                            t("adherence.reminder_desc", {
                              defaultValue:
                                "Afternoon medication reminder will be added to your notifications.",
                            }),
                            [{ text: t("common.ok", { defaultValue: "OK" }) }],
                          )
                        }
                      >
                        <Text style={styles.reminderBtnText}>
                          {t("adherence.set_reminder", {
                            defaultValue: "Set Reminder",
                          })}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* ── [4] 7-Day Trend ── */}
          <Animated.View style={anim(4)}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {t("common.7_day_adherence_trend", {
                  defaultValue: "7-DAY ADHERENCE TREND",
                })}
              </Text>

              <View
                style={{
                  alignItems: "center",
                  marginHorizontal: -8,
                  marginTop: 4,
                  marginBottom: 16,
                }}
              >
                <LineChart
                  data={{
                    labels:
                      weeklyTrend.length > 0
                        ? weeklyTrend.map((d) => d.day)
                        : [
                            t("adherence.mon", { defaultValue: "Mon" }),
                            t("adherence.tue", { defaultValue: "Tue" }),
                            t("adherence.wed", { defaultValue: "Wed" }),
                            t("adherence.thu", { defaultValue: "Thu" }),
                            t("adherence.fri", { defaultValue: "Fri" }),
                            t("adherence.sat", { defaultValue: "Sat" }),
                            t("adherence.sun", { defaultValue: "Sun" }),
                          ],
                    datasets: [
                      {
                        data:
                          weeklyTrend.length > 0
                            ? weeklyTrend.map((d) => Math.max(d.rate, 1))
                            : [1, 1, 1, 1, 1, 1, 1],
                      },
                    ],
                  }}
                  width={SCREEN_WIDTH - 48}
                  height={170}
                  chartConfig={{
                    backgroundColor: "transparent",
                    backgroundGradientFrom: "#FFFFFF",
                    backgroundGradientFromOpacity: 0,
                    backgroundGradientTo: "#FFFFFF",
                    backgroundGradientToOpacity: 0,
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(67, 97, 238, ${opacity})`,
                    labelColor: (opacity = 1) =>
                      `rgba(100, 116, 139, ${opacity})`,
                    propsForDots: {
                      r: "5",
                      strokeWidth: "2",
                      stroke: "#4361EE",
                      fill: "#EEF2FF",
                    },
                    propsForBackgroundLines: {
                      strokeDasharray: "4",
                      strokeWidth: 1,
                      stroke: "rgba(226, 232, 240, 0.8)",
                    },
                  }}
                  bezier
                  style={{ borderRadius: 16 }}
                  withInnerLines
                  withOuterLines={false}
                  withVerticalLines={false}
                />
              </View>

              <View style={styles.trendStatsRow}>
                <View style={styles.trendStatItem}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={[styles.trendDot, { backgroundColor: C.success }]}
                    />
                    <Text style={styles.trendStatNum}>{weeklySummary.taken}</Text>
                  </View>
                  <Text style={styles.trendStatLabel}>
                    {t("common.taken", { defaultValue: "Taken" })}
                  </Text>
                </View>
                <View style={styles.trendDivider} />
                <View style={styles.trendStatItem}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={[styles.trendDot, { backgroundColor: C.danger }]}
                    />
                    <Text style={styles.trendStatNum}>
                      {weeklySummary.missed}
                    </Text>
                  </View>
                  <Text style={styles.trendStatLabel}>
                    {t("adherence.missed", { defaultValue: "Missed" })}
                  </Text>
                </View>
                <View style={styles.trendDivider} />
                <View style={styles.trendStatItem}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <MomentumIcon
                      size={14}
                      color={
                        weeklySummary.improvement >= 0 ? C.success : C.danger
                      }
                    />
                    <Text
                      style={[
                        styles.trendStatNum,
                        {
                          color:
                            weeklySummary.improvement >= 0 ? C.success : C.danger,
                        },
                      ]}
                    >
                      {weeklySummary.improvement >= 0 ? "+" : ""}
                      {weeklySummary.improvement}%
                    </Text>
                  </View>
                  <Text style={styles.trendStatLabel}>
                    {t("adherence.vs_last", { defaultValue: "vs Last" })}
                  </Text>
                </View>
              </View>

              {/* Vitals adherence row */}
              <View style={styles.vitalsRow}>
                <View style={styles.vitalsHeader}>
                  <Heart size={14} color={C.danger} />
                  <Text style={styles.vitalsLabel}>
                    {t("adherence.vitals_logging", {
                      defaultValue: "Vitals Logging",
                    })}
                  </Text>
                  <Text
                    style={[
                      styles.vitalsValue,
                      {
                        color:
                          vitalsAdherence >= 70
                            ? C.success
                            : vitalsAdherence >= 40
                              ? C.warning
                              : C.danger,
                      },
                    ]}
                  >
                    {vitalsAdherence}%
                  </Text>
                </View>
                <View style={styles.vitalsBarBg}>
                  <View
                    style={[
                      styles.vitalsBarFill,
                      {
                        width: `${vitalsAdherence}%`,
                        backgroundColor:
                          vitalsAdherence >= 70
                            ? C.success
                            : vitalsAdherence >= 40
                              ? C.warning
                              : C.danger,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ── [5] Calendar Heatmap ── */}
          <Animated.View style={anim(5)}>
            <View style={styles.card}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <View
                  style={[
                    styles.cardIconBox,
                    { backgroundColor: C.primarySoft },
                  ]}
                >
                  <CalIcon size={15} color={C.primary} />
                </View>
                <Text style={styles.cardTitle}>
                  {format(currentMonth, "MMMM yyyy").toUpperCase()}
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => setCurrentMonth((prev) => subMonths(prev, 1))}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={C.primary} />
                </Pressable>
                <Pressable
                  onPress={() => setCurrentMonth((prev) => addMonths(prev, 1))}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={C.primary} />
                </Pressable>
              </View>

              <View style={styles.weekDaysRow}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (d, i) => (
                    <Text key={i} style={styles.weekDayLabel}>
                      {t(`adherence.short_day_${i}`, {
                        defaultValue: d.charAt(0),
                      })}
                    </Text>
                  ),
                )}
              </View>

              <View style={styles.calendarGrid}>
                {calendarDays.map((date, idx) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const entry = dailyLogMap[dateStr];
                  return (
                    <CalendarDay
                      key={idx}
                      date={date}
                      status={entry?.status}
                      isCurrentMonth={isSameMonth(date, currentMonth)}
                      onPress={() => {
                        const isPast = new Date(dateStr) < new Date();
                        setSelectedDay(
                          entry || {
                            date: dateStr,
                            status: isPast ? "missed" : "none",
                            rate: 0,
                            medicines: [],
                            vitals: null,
                            _noEntry: true,
                            _isPast: isPast,
                          },
                        );
                      }}
                    />
                  );
                })}
              </View>

              <View style={styles.legendRow}>
                {[
                  {
                    label: t("adherence.complete", {
                      defaultValue: "Complete",
                    }),
                    color: C.success,
                  },
                  {
                    label: t("adherence.partial", { defaultValue: "Partial" }),
                    color: C.warning,
                  },
                  {
                    label: t("adherence.missed", { defaultValue: "Missed" }),
                    color: C.danger,
                  },
                  {
                    label: t("adherence.no_data", { defaultValue: "No Data" }),
                    color: "#CBD5E1",
                  },
                ].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: item.color },
                      ]}
                    />
                    <Text style={styles.legendText}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>

          {/* ── [6] Achievements (Liquid Glass style) ── */}
          <Animated.View style={[anim(6), { position: "relative" }]}>
            <View style={{ marginBottom: 16 }}>
              {/* Hero Achievement Journey card */}
              <View
                style={{
                  borderRadius: 24,
                  shadowColor: "#6A5AF9",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.08,
                  shadowRadius: 18,
                  elevation: 1,
                  backgroundColor: "transparent",
                  position: "relative",
                }}
              >
                <LinearGradient
                  colors={[
                    "rgba(79, 70, 229, 0.88)",
                    "rgba(99, 102, 241, 0.55)",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 24,
                    padding: 20,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.22)",
                  }}
                >
                  {/* Ambient Back-Glow Circles (Inside overflow: 'hidden' to prevent leakage) */}
                  <View
                    style={{
                      position: "absolute",
                      top: -10,
                      left: 14,
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      backgroundColor: "#8B5CF6",
                      opacity: 0.35,
                      transform: [{ scale: 1.2 }],
                    }}
                  />

                  {/* Glass reflection highlight overlay */}
                  <LinearGradient
                    colors={[
                      "rgba(255, 255, 255, 0.22)",
                      "rgba(255, 255, 255, 0)",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Trophy size={14} color="#FFF" />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "800",
                            color: "#E0E7FF",
                            letterSpacing: 0.8,
                            textTransform: "uppercase",
                          }}
                        >
                          Achievement Journey
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 22,
                          fontWeight: "900",
                          color: "white",
                          marginTop: 6,
                          letterSpacing: -0.5,
                        }}
                      >
                        {unlockedCount}/{totalAchievementsCount} Unlocked
                      </Text>

                      {nextGoal && (
                        <View
                          style={{
                            marginTop: 10,
                            backgroundColor: "rgba(255, 255, 255, 0.08)",
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#E0E7FF",
                              fontWeight: "700",
                            }}
                          >
                            Next:{" "}
                            <Text style={{ color: "white", fontWeight: "800" }}>
                              {nextGoal.meta.title || nextGoal.key}
                            </Text>
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#C7D2FE",
                              fontWeight: "600",
                              marginTop: 1,
                            }}
                          >
                            {getRemainingLabel(nextGoal, nextGoal.meta)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View
                      style={{
                        position: "relative",
                        width: 84,
                        height: 84,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ProgressRing percent={completionPercentage} />
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 0,
                          right: 0,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "900",
                            color: "white",
                            letterSpacing: -0.5,
                          }}
                        >
                          {completionPercentage}%
                        </Text>
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            </View>

            {/* Category Sections */}
            {Object.keys(CATEGORY_CONFIG).map((categoryKey, idx) => {
              const catConfig = CATEGORY_CONFIG[categoryKey];
              let catAchievements = achievementsByCategory[categoryKey] || [];
              if (catAchievements.length === 0) return null;

              // Enrich achievements with meta & tierConfig
              catAchievements = catAchievements.map((a) => {
                const meta =
                  ACHIEVEMENTS.find((ach) => ach.key === a.key) || {};
                return {
                  ...a,
                  meta,
                  tierConfig: TIER_CONFIG[meta.tier] || TIER_CONFIG.bronze,
                };
              });

              const unlockedCat = catAchievements.filter(
                (a) => a.unlocked,
              ).length;

              return (
                <View
                  key={categoryKey}
                  style={{
                    marginBottom: 20,
                    backgroundColor: "#FFFFFF",
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: catConfig.accent[0] + "1E",
                    shadowColor: "#0F172A",
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.04,
                    shadowRadius: 16,
                    elevation: 4,
                    overflow: "hidden",
                  }}
                >
                  <LinearGradient
                    colors={[
                      "#FFFFFF",
                      catConfig.accent[0] + "03",
                      catConfig.accent[0] + "0B",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ padding: 20 }}
                  >
                    {/* Outer Double-Line Frame */}
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 6,
                        bottom: 6,
                        left: 6,
                        right: 6,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: catConfig.accent[0] + "12",
                        borderStyle: "solid",
                      }}
                    />

                    {/* Inner Dashed Frame */}
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10,
                        borderRadius: 14,
                        borderWidth: 0.8,
                        borderColor: catConfig.accent[0] + "0C",
                        borderStyle: "dashed",
                      }}
                    />

                    {/* Watermark/Vector Decor in Corner */}
                    <Svg
                      pointerEvents="none"
                      style={{ position: "absolute", right: -30, top: -30 }}
                      width={160}
                      height={160}
                      viewBox="0 0 100 100"
                    >
                      <Circle
                        cx="100"
                        cy="0"
                        r="30"
                        stroke={catConfig.accent[0]}
                        strokeWidth="0.8"
                        strokeDasharray="3 3"
                        fill="none"
                        opacity={0.06}
                      />
                      <Circle
                        cx="100"
                        cy="0"
                        r="45"
                        stroke={catConfig.accent[0]}
                        strokeWidth="0.8"
                        fill="none"
                        opacity={0.04}
                      />
                      <Circle
                        cx="100"
                        cy="0"
                        r="60"
                        stroke={catConfig.accent[0]}
                        strokeWidth="0.8"
                        strokeDasharray="4 2"
                        fill="none"
                        opacity={0.05}
                      />
                      <Circle
                        cx="100"
                        cy="0"
                        r="75"
                        stroke={catConfig.accent[0]}
                        strokeWidth="0.8"
                        fill="none"
                        opacity={0.03}
                      />
                      <Circle
                        cx="100"
                        cy="0"
                        r="90"
                        stroke={catConfig.accent[0]}
                        strokeWidth="0.8"
                        fill="none"
                        opacity={0.02}
                      />
                    </Svg>

                    <CategoryHeaderUi
                      category={catConfig}
                      unlockedCount={unlockedCat}
                      totalCount={catAchievements.length}
                    />
                    {catConfig.layout === "timeline" ? (
                      <TimelineLayout
                        badges={catAchievements}
                        onSelect={handleBadgePress}
                      />
                    ) : (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: GRID_GAP,
                        }}
                      >
                        {catAchievements.map((b, i) => (
                          <PremiumBadge
                            key={i}
                            data={b}
                            onPress={() => handleBadgePress(b)}
                          />
                        ))}
                      </View>
                    )}
                  </LinearGradient>
                </View>
              );
            })}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* ── Recap Story Modal ── */}
      <RecapStoryModal
        visible={showStoryModal}
        onClose={() => setShowStoryModal(false)}
        recap={adherenceRecap}
        period={activeRecapTab}
      />

      {/* ── Day Detail Bottom Sheet ── */}
      <Modal
        visible={!!selectedDay}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setSelectedDay(null)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            {selectedDay && (
              <>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetDate}>
                      {format(parseISO(selectedDay.date), "EEEE, MMMM do")}
                    </Text>
                    <Text style={styles.sheetYear}>
                      {format(parseISO(selectedDay.date), "yyyy")}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.sheetBadge,
                      {
                        backgroundColor:
                          STATUS_COLORS[selectedDay.status] + "22",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sheetBadgeText,
                        { color: STATUS_COLORS[selectedDay.status] },
                      ]}
                    >
                      {selectedDay.rate}% adherence
                    </Text>
                  </View>
                </View>

                {selectedDay.medicines && selectedDay.medicines.length > 0 ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.sheetSectionLabel}>
                      {t("adherence.medications_label", {
                        defaultValue: "MEDICATIONS",
                      })}
                    </Text>
                    {selectedDay.medicines.map((med, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: med.taken ? "#FAF5FF" : "#F8FAFC",
                          borderRadius: 16,
                          padding: 12,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: med.taken ? "#F3E8FF" : "#E2E8F0",
                          shadowColor: "#7C3AED",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: med.taken ? 0.03 : 0,
                          shadowRadius: 6,
                          elevation: 1,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              backgroundColor: med.taken ? "#ECFDF5" : "#FEF2F2",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {med.taken ? (
                              <CheckCircle2 size={16} color="#10B981" />
                            ) : (
                              <X size={16} color="#EF4444" />
                            )}
                          </View>
                          <View style={{ flex: 1, marginHorizontal: 12 }}>
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: "700",
                                color: med.taken ? "#0F172A" : "#64748B",
                                textDecorationLine: med.taken ? "none" : "line-through",
                              }}
                            >
                              {med.name}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={{
                            backgroundColor: med.taken ? "#F5F3FF" : "#F1F5F9",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "800",
                              color: med.taken ? "#7C3AED" : "#64748B",
                              textTransform: "uppercase",
                            }}
                          >
                            {med.time}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.sheetEmptyBox}>
                    <Text style={styles.sheetEmptyIcon}>
                      {selectedDay._noEntry && selectedDay._isPast
                        ? "😴"
                        : selectedDay._noEntry
                          ? "📅"
                          : "💊"}
                    </Text>
                    <Text style={styles.sheetEmptyTitle}>
                      {selectedDay._noEntry && selectedDay._isPast
                        ? t("adherence.no_log_past", {
                            defaultValue: "No records for this day",
                          })
                        : selectedDay._noEntry
                          ? t("adherence.no_log_future", {
                              defaultValue: "No medications scheduled",
                            })
                          : t("adherence.no_meds_scheduled_day", {
                              defaultValue:
                                "No medications scheduled for this day.",
                            })}
                    </Text>
                    <Text style={styles.sheetEmptyDesc}>
                      {selectedDay._noEntry && selectedDay._isPast
                        ? t("adherence.no_log_past_desc", {
                            defaultValue:
                              "Medication data wasn't recorded for this day.",
                          })
                        : t("adherence.no_log_future_desc", {
                            defaultValue:
                              "This day has no scheduled medications.",
                          })}
                    </Text>
                  </View>
                )}

                {selectedDay.vitals && (
                  <View style={styles.sheetVitals}>
                    <Text style={styles.sheetSectionLabel}>
                      {t("adherence.vitals_logged_label", {
                        defaultValue: "VITALS LOGGED",
                      })}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 10,
                        marginTop: 8,
                      }}
                    >
                      {selectedDay.vitals.heart_rate && (
                        <View style={styles.sheetVitalChip}>
                          <Text style={styles.sheetVitalText}>
                            💓 {selectedDay.vitals.heart_rate} bpm
                          </Text>
                        </View>
                      )}
                      {selectedDay.vitals.systolic && (
                        <View style={styles.sheetVitalChip}>
                          <Text style={styles.sheetVitalText}>
                            🩸 {selectedDay.vitals.systolic}/
                            {selectedDay.vitals.diastolic}
                          </Text>
                        </View>
                      )}
                      {selectedDay.vitals.oxygen_saturation && (
                        <View style={styles.sheetVitalChip}>
                          <Text style={styles.sheetVitalText}>
                            💨 {selectedDay.vitals.oxygen_saturation}%
                          </Text>
                        </View>
                      )}
                      {selectedDay.vitals.hydration && (
                        <View style={styles.sheetVitalChip}>
                          <Text style={styles.sheetVitalText}>
                            💧 {selectedDay.vitals.hydration}%
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Achievement Detail Modal ── */}
      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={handleCloseBadgeModal}
      >
        <View style={styles.badgeModalOverlay}>
          <Pressable
            style={styles.badgeModalBackdrop}
            onPress={handleCloseBadgeModal}
          />

          <Animated.View
            style={[
              styles.badgeModalContent,
              {
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {selectedBadge &&
              (() => {
                const meta =
                  ACHIEVEMENTS.find((a) => a.key === selectedBadge.key) || {};
                const tierInfo = TIER_CONFIG[meta.tier] || TIER_CONFIG.bronze;
                const IconComponent = Icons[meta.iconName] || Icons.Award;
                const isUnlocked = selectedBadge.unlocked;
                const badgeRotation = badgeRotateAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-15deg", "0deg"],
                });

                return (
                  <>
                    {/* Close Button */}
                    <Pressable
                      style={styles.badgeModalClose}
                      onPress={handleCloseBadgeModal}
                    >
                      <X size={18} color={C.muted} />
                    </Pressable>

                    {/* Large Glowing Collectible Trophy Container */}
                    <Pressable
                      onPress={() => {
                        badgeScaleAnim.setValue(0.85);
                        Animated.spring(badgeScaleAnim, {
                          toValue: 1,
                          friction: 4,
                          tension: 40,
                          useNativeDriver: true,
                        }).start();
                        try {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        } catch (e) {}
                      }}
                      style={{
                        position: "relative",
                        marginBottom: 24,
                        width: 170,
                        height: 170,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Animated.View
                        style={{
                          width: "100%",
                          height: "100%",
                          alignItems: "center",
                          justifyContent: "center",
                          transform: [
                            { scale: badgeScaleAnim },
                            { rotate: badgeRotation },
                          ],
                        }}
                      >
                      {/* Multi-layered Glowing Halos */}
                      <View
                        style={{
                          position: "absolute",
                          width: 156,
                          height: 156,
                          borderRadius: 78,
                          backgroundColor: isUnlocked
                            ? tierInfo.color + "0C"
                            : "#E2E8F015",
                          transform: [{ scale: 1.15 }],
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          width: 130,
                          height: 130,
                          borderRadius: 65,
                          backgroundColor: isUnlocked
                            ? tierInfo.color + "1C"
                            : "#E2E8F02C",
                          transform: [{ scale: 1.05 }],
                        }}
                      />

                      {isUnlocked ? (
                        /* Large Unlocked Ringed Medal */
                        <View
                          style={{
                            width: 96,
                            height: 96,
                            borderRadius: 48,
                            borderWidth: 3,
                            borderColor: tierInfo.color,
                            padding: 4,
                            alignItems: "center",
                            justifyContent: "center",
                            shadowColor: tierInfo.color,
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.35,
                            shadowRadius: 10,
                            elevation: 6,
                          }}
                        >
                          <LinearGradient
                            colors={tierInfo.gradient}
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: 40,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          >
                            <IconComponent size={40} color="#FFF" />
                          </LinearGradient>

                          {meta.tier === "legendary" && (
                            <View
                              style={{
                                position: "absolute",
                                top: -6,
                                right: -6,
                                backgroundColor: "#FBBF24",
                                borderRadius: 12,
                                width: 24,
                                height: 24,
                                alignItems: "center",
                                justifyContent: "center",
                                borderWidth: 2,
                                borderColor: "#FFFFFF",
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.2,
                                shadowRadius: 3,
                                elevation: 3,
                              }}
                            >
                              <Icons.Crown
                                size={12}
                                color="#7C3AED"
                                fill="#7C3AED"
                              />
                            </View>
                          )}
                        </View>
                      ) : (
                        /* Large Locked Ringed Medal */
                        <View
                          style={{
                            width: 96,
                            height: 96,
                            borderRadius: 48,
                            borderWidth: 2,
                            borderColor: "#CBD5E1",
                            borderStyle: "dashed",
                            padding: 4,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <View
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: 40,
                              backgroundColor: "rgba(148, 163, 184, 0.05)",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <IconComponent
                              size={40}
                              color="#94A3B8"
                              style={{ opacity: 0.35 }}
                            />
                          </View>
                          <View
                            style={{
                              position: "absolute",
                              bottom: -2,
                              right: -2,
                              backgroundColor: "#64748B",
                              width: 26,
                              height: 26,
                              borderRadius: 13,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 2.5,
                              borderColor: "#FFFFFF",
                              shadowColor: "#000",
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.15,
                              shadowRadius: 3,
                              elevation: 2,
                            }}
                          >
                            <Lock size={12} color="#FFF" />
                          </View>
                        </View>
                      )}
                      </Animated.View>
                    </Pressable>

                    {/* Ribbon label */}
                    <View
                      style={[
                        styles.badgeModalRibbon,
                        {
                          backgroundColor: tierInfo.bgColor,
                          borderWidth: 1,
                          borderColor: tierInfo.color + "25",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 12,
                        },
                      ]}
                    >
                      <IconComponent size={10} color={tierInfo.color} />
                      <Text
                        style={[
                          styles.badgeModalRibbonTxt,
                          { color: tierInfo.color, fontWeight: "850" },
                        ]}
                      >
                        {tierInfo.label.toUpperCase()} ACHIEVEMENT
                      </Text>
                    </View>

                    {/* Title */}
                    <Text style={styles.badgeModalTitle}>
                      {meta.title || selectedBadge.key}
                    </Text>

                    {/* Description */}
                    <Text style={styles.badgeModalDesc}>
                      {meta.description}
                    </Text>

                    <View style={styles.badgeModalDivider} />

                    {/* Progress & Locked status banner */}
                    {isUnlocked ? (
                      <View
                        style={[
                          styles.badgeModalStatusBox,
                          {
                            backgroundColor: tierInfo.bgColor,
                            borderColor: tierInfo.color + "20",
                            borderWidth: 1,
                            shadowColor: tierInfo.color,
                            shadowOpacity: 0.1,
                            shadowRadius: 8,
                            elevation: 2,
                          },
                        ]}
                      >
                        <Sparkles size={15} color={tierInfo.color} />
                        <Text
                          style={[
                            styles.badgeModalStatusTextUnlocked,
                            { color: tierInfo.color, fontWeight: "950" },
                          ]}
                        >
                          {selectedBadge.unlockedTime
                            ? selectedBadge.unlockedTime.toUpperCase()
                            : "UNLOCKED"}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.badgeModalProgressContainer}>
                        <View style={styles.badgeModalProgressHeader}>
                          <Text style={styles.badgeModalProgressTitle}>
                            Progress to Unlock
                          </Text>
                          <Text
                            style={[
                              styles.badgeModalProgressVal,
                              { color: tierInfo.color, fontWeight: "900" },
                            ]}
                          >
                            {selectedBadge.progressLabel || "0%"}
                          </Text>
                        </View>
                        <View style={styles.badgeModalProgressBg}>
                          <LinearGradient
                            colors={tierInfo.gradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[
                              styles.badgeModalProgressFill,
                              {
                                width: `${Math.min(100, (selectedBadge.progress || 0) * 100)}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </>
                );
              })()}
          </Animated.View>
        </View>
      </Modal>
    </View>
    </TabScreenTransition>
  );
}

// ══════════════════════════════════════════════════════════════
// ══ STYLES ════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 44 : 8,
    paddingBottom: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 24,
    ...FONT.heavy,
    color: C.dark,
    letterSpacing: -0.5,
  },
  headerSub: { fontSize: 13, color: C.muted, ...FONT.medium, marginTop: 2 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  shareBtnText: { fontSize: 13, ...FONT.bold, color: "#FFF" },

  // ── Tabs ──
  tabsContainer: { paddingHorizontal: 20, paddingBottom: 16 },
  tabsInner: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 4,
    position: "relative",
  },
  tabSlider: {
    position: "absolute",
    top: 4,
    left: 4,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tab: {
    paddingVertical: 10,
    alignItems: "center",
    zIndex: 1,
  },
  tabText: { fontSize: 14, ...FONT.bold, color: C.light },
  tabTextActive: { color: C.dark },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: layout.TAB_BAR_CLEARANCE,
  },

  // ── Hero Card ──
  heroCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 30,
    elevation: 4,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  heroRingWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  heroRingCenter: { position: "absolute", alignItems: "center" },
  heroRingPercent: {
    fontSize: 32,
    ...FONT.heavy,
    color: "#0F172A",
    letterSpacing: -1,
  },
  heroRingLabel: {
    fontSize: 11,
    ...FONT.semibold,
    color: "#64748B",
    marginTop: -2,
  },
  heroRightCol: {
    flex: 1,
    marginLeft: 20,
    minHeight: 148,
    justifyContent: "space-between",
  },
  heroStatBox: { paddingVertical: 10 },
  heroStatLabel: {
    fontSize: 11,
    ...FONT.heavy,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroStatValue: { fontSize: 18, ...FONT.heavy, color: "#0F172A" },
  heroStatDivider: { height: 1, backgroundColor: "#F3E8FF" },
  heroProgressSection: {
    borderTopWidth: 1,
    borderTopColor: "#F3E8FF",
    paddingTop: 16,
  },
  heroProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  heroProgressTitle: {
    flex: 1,
    fontSize: 12,
    ...FONT.bold,
    color: "#475569",
  },
  heroProgressCount: { fontSize: 15, ...FONT.heavy, color: "#0F172A" },
  heroCompletedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5", // Solid light mint green (opaque)
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  heroCompletedText: { fontSize: 11, ...FONT.bold, color: "#065F46" },
  heroProgressBg: {
    height: 7,
    backgroundColor: "#F3E8FF",
    borderRadius: 4,
    overflow: "hidden",
  },
  heroProgressFill: { height: "100%", borderRadius: 4 },
  momentumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FAF5FF",
    borderWidth: 1,
    borderColor: "#F3E8FF",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  momentumIconContainer: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  momentumText: {
    color: "#7C3AED",
    fontSize: 13,
    ...FONT.bold,
  },

  // ── Streak Card ──
  streakCard: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    overflow: "hidden",
  },
  streakLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  companionImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  companionImage: { width: 48, height: 48 },
  companionLabel: {
    fontSize: 11,
    ...FONT.heavy,
    color: "#7C3AED",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 1,
  },
  streakNum: {
    fontSize: 20,
    ...FONT.heavy,
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  streakSub: {
    fontSize: 12,
    ...FONT.semibold,
    color: "#475569",
    marginTop: 2,
  },
  streakBadge: {
    backgroundColor: C.primary, // Matches unified theme color
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  streakBadgeNum: { fontSize: 20, ...FONT.heavy, color: "#FFF" },
  streakBadgeLabel: {
    fontSize: 9,
    ...FONT.heavy,
    color: "#FFF",
    letterSpacing: 1,
    marginTop: 2,
  },

  // ── Generic Card ──
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.04)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 30,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 12,
    ...FONT.heavy,
    color: C.light,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  levelPillText: { fontSize: 12, ...FONT.bold },

  // ── Recap Stats ──
  recapStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  recapStatItem: { flex: 1, alignItems: "center", gap: 8 },
  recapStatIconBg: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recapStatLabel: {
    fontSize: 11,
    ...FONT.bold,
    color: C.muted,
    textAlign: "center",
  },
  recapStatCardIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  tipBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(30, 136, 229, 0.08)",
    borderColor: "rgba(30, 136, 229, 0.15)",
    borderWidth: 1,
    padding: 14,
    borderRadius: 16,
    marginTop: 16,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    ...FONT.semibold,
    color: "#1E3A8A",
    lineHeight: 18,
  },
  tipBoldText: {
    ...FONT.heavy,
    color: "#1E88E5",
  },

  // ── Feedback Banner ──
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  feedbackText: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },

  // ── Insight Card ──
  insightCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  insightLeft: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  insightIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: C.purpleBg,
    alignItems: "center",
    justifyContent: "center",
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: C.dark,
    lineHeight: 20,
  },
  reminderBtn: {
    marginTop: 10,
    backgroundColor: C.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    alignSelf: "flex-start",
  },
  reminderBtnText: { fontSize: 12, fontWeight: "700", color: C.primary },

  // ── Trend Stats ──
  trendStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  trendStatItem: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  trendDot: { width: 8, height: 8, borderRadius: 4 },
  trendStatNum: { fontSize: 20, fontWeight: "800", color: C.dark },
  trendStatLabel: { fontSize: 11, fontWeight: "600", color: C.muted },
  trendDivider: { width: 1, height: 32, backgroundColor: C.border },

  // ── Vitals Adherence ──
  vitalsRow: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  vitalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  vitalsLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: C.dark },
  vitalsValue: { fontSize: 14, fontWeight: "800" },
  vitalsBarBg: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  vitalsBarFill: { height: "100%", borderRadius: 4 },

  // ── Calendar ──
  weekDaysRow: { flexDirection: "row", marginBottom: 6 },
  weekDayLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: C.light,
    letterSpacing: 0.5,
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    flex: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontSize: 13, fontWeight: "600", color: C.mid },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: "600", color: C.light },

  // ── Achievements ──
  achievementsSection: { marginBottom: 8 },
  categoryContainer: { marginBottom: 22 },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 4,
  },
  categoryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  categoryEmoji: { fontSize: 20 },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: C.dark,
    letterSpacing: 0.3,
  },
  categoryDesc: {
    fontSize: 11,
    color: C.muted,
    fontWeight: "500",
    marginTop: 1,
  },
  achievementsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    marginRight: -GRID_GAP, // Offset the trailing margin of grid items
  },
  badgeItem: {
    width: badgeWidth,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginRight: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  badgeItemLocked: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    shadowOpacity: 0,
    elevation: 0,
  },
  badgeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  badgeCircleLocked: {
    backgroundColor: "#E2E8F0",
    shadowOpacity: 0,
    elevation: 0,
    position: "relative",
  },
  lockIconOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#64748B",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F8FAFC",
  },
  badgeItemTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.dark,
    textAlign: "center",
    marginTop: 2,
  },
  badgeProgressContainer: {
    width: "100%",
    marginTop: 6,
    alignItems: "center",
  },
  badgeProgressBg: {
    width: "80%",
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  badgeProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  badgeProgressText: {
    fontSize: 8,
    fontWeight: "600",
    color: C.muted,
    marginTop: 2,
  },

  // ── Achievement Detail Modal ──
  badgeModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  badgeModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  badgeModalContent: {
    width: SCREEN_WIDTH - 64,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    position: "relative",
  },
  badgeModalClose: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeModalRibbon: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  badgeModalRibbonTxt: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  badgeModalCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  badgeModalCircleLocked: {
    backgroundColor: "#E2E8F0",
    shadowOpacity: 0,
    elevation: 0,
    position: "relative",
  },
  badgeModalLockOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#64748B",
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  badgeModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: C.dark,
    textAlign: "center",
    marginBottom: 8,
  },
  badgeModalDesc: {
    fontSize: 13,
    fontWeight: "500",
    color: C.muted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  badgeModalDivider: {
    width: "100%",
    height: 1,
    backgroundColor: C.border,
    marginVertical: 18,
  },
  badgeModalStatusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.successBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  badgeModalStatusTextUnlocked: {
    fontSize: 13,
    fontWeight: "700",
    color: C.success,
  },
  badgeModalProgressContainer: {
    width: "100%",
  },
  badgeModalProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badgeModalProgressTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.dark,
  },
  badgeModalProgressVal: {
    fontSize: 12,
    fontWeight: "800",
    color: C.muted,
  },
  badgeModalProgressBg: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  badgeModalProgressFill: {
    height: "100%",
    borderRadius: 4,
  },

  // ── Modal / Bottom Sheet ──
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  bottomSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 14,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 16,
  },
  sheetDate: { fontSize: 17, fontWeight: "800", color: C.dark },
  sheetYear: { fontSize: 12, color: C.muted, fontWeight: "600", marginTop: 2 },
  sheetBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  sheetBadgeText: { fontSize: 12, fontWeight: "700" },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: C.light,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  sheetMedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  sheetMedIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetMedName: { fontSize: 14, fontWeight: "700", color: C.dark },
  sheetMedTime: {
    fontSize: 11,
    color: C.muted,
    fontWeight: "500",
    marginTop: 1,
  },
  sheetEmpty: {
    fontSize: 13,
    color: C.muted,
    fontStyle: "italic",
    marginBottom: 16,
  },
  sheetEmptyBox: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
  },
  sheetEmptyIcon: { fontSize: 36, marginBottom: 10 },
  sheetEmptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.mid,
    textAlign: "center",
  },
  sheetEmptyDesc: {
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  sheetVitals: { marginTop: 4 },
  sheetVitalChip: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  sheetVitalText: { fontSize: 13, fontWeight: "600", color: C.mid },

  // ── Completion Header ──
  completionContainer: {
    marginBottom: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  completionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  completionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.5,
  },
  completionStats: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4F46E5",
  },
  completionBarBg: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    overflow: "hidden",
  },
  completionBarFill: {
    height: "100%",
    borderRadius: 999,
  },

  // ── Recent Unlocks ──
  recentUnlocksContainer: {
    marginBottom: 20,
  },
  recentUnlocksHeader: {
    fontSize: 11,
    fontWeight: "850",
    color: "#64748B",
    letterSpacing: 1.0,
    textTransform: "uppercase",
    marginBottom: 10,
    marginLeft: 2,
  },
  recentUnlocksList: {
    flexDirection: "row",
  },
  recentUnlockItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  recentUnlockIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recentUnlockTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  recentUnlockTime: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 2,
  },

  // ── Next Goal Card ──
  nextGoalCard: {
    marginBottom: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 4,
  },
  nextGoalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  nextGoalHeaderText: {
    fontSize: 11,
    fontWeight: "850",
    color: "#D97706",
    letterSpacing: 1.2,
  },
  nextGoalBody: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextGoalBadgeCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  nextGoalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  nextGoalDesc: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
    marginBottom: 10,
  },
  nextGoalProgressText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4F46E5",
  },
  nextGoalProgressBarContainer: {
    width: "100%",
  },
  nextGoalProgressBarBg: {
    height: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    overflow: "hidden",
  },
  nextGoalProgressBarFill: {
    height: "100%",
    borderRadius: 999,
  },

  // ── Stats Section Capsule Cards ──
  recapStatCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  recapStatCardValue: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  recapStatCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },

  // ── Progression Counters ──
  categoryBadgeCount: {
    marginLeft: "auto",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  categoryBadgeCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
});
