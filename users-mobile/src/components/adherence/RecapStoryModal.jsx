import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ScrollView,
  Share,
  Platform,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
  Share2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pill,
  Trophy,
  Heart,
  Sparkles,
  TrendingUp,
  Leaf,
  Sunrise,
  Sun,
  Moon,
  Check,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { HapticPatterns } from "../../utils/haptics";

const { width: SW, height: SH } = Dimensions.get("window");
const SLIDE_COUNT = 7;
const SLIDE_DURATION = 4000; // 4 seconds per slide (video-like)

const SLIDE_THEMES = [
  {
    colors: ["#05100E", "#020706"], // Unified Deep Dark Teal/Black background
    textColor: "#FFFFFF",
    accentBg: "rgba(236, 72, 153, 0.1)",
    accentText: "#EC4899",
    blobColor1: "rgba(236, 72, 153, 0.03)",
    blobColor2: "rgba(236, 72, 153, 0.015)",
  },
  {
    colors: ["#05100E", "#020706"],
    textColor: "#FFFFFF",
    accentBg: "rgba(16, 185, 129, 0.1)",
    accentText: "#10B981",
    blobColor1: "rgba(16, 185, 129, 0.03)",
    blobColor2: "rgba(16, 185, 129, 0.015)",
  },
  {
    colors: ["#05100E", "#020706"],
    textColor: "#FFFFFF",
    accentBg: "rgba(245, 158, 11, 0.1)",
    accentText: "#F59E0B",
    blobColor1: "rgba(245, 158, 11, 0.03)",
    blobColor2: "rgba(245, 158, 11, 0.015)",
  },
  {
    colors: ["#05100E", "#020706"],
    textColor: "#FFFFFF",
    accentBg: "rgba(139, 92, 246, 0.1)",
    accentText: "#8B5CF6",
    blobColor1: "rgba(139, 92, 246, 0.03)",
    blobColor2: "rgba(139, 92, 246, 0.015)",
  },
  {
    colors: ["#05100E", "#020706"],
    textColor: "#FFFFFF",
    accentBg: "rgba(16, 185, 129, 0.1)",
    accentText: "#10B981",
    blobColor1: "rgba(16, 185, 129, 0.03)",
    blobColor2: "rgba(16, 185, 129, 0.015)",
  },
  {
    colors: ["#05100E", "#020706"],
    textColor: "#FFFFFF",
    accentBg: "rgba(168, 85, 247, 0.1)",
    accentText: "#A855F7",
    blobColor1: "rgba(168, 85, 247, 0.03)",
    blobColor2: "rgba(168, 85, 247, 0.015)",
  },
  {
    colors: ["#05100E", "#020706"],
    textColor: "#FFFFFF",
    accentBg: "rgba(59, 130, 246, 0.1)",
    accentText: "#3B82F6",
    blobColor1: "rgba(59, 130, 246, 0.03)",
    blobColor2: "rgba(59, 130, 246, 0.015)",
  },
];

const AnimatedCounter = ({ value, suffix = "", style }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const listener = anim.addListener(({ value: v }) =>
      setDisplay(Math.round(v)),
    );
    Animated.timing(anim, {
      toValue: value || 0,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(listener);
  }, [value]);

  return (
    <Text style={style}>
      {display}
      {suffix}
    </Text>
  );
};

const ProgressRing = ({
  progress = 0,
  size = 190,
  strokeWidth = 12,
  activeColor = "#10B981",
  trackColor = "rgba(255, 255, 255, 0.08)",
  textColor = "#FFFFFF",
  subtitle = "Keep It Up.",
}) => {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ transform: [{ rotate: "-90deg" }] }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={activeColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <View
        style={{
          position: "absolute",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AnimatedCounter
          value={progress}
          suffix="%"
          style={{
            fontSize: 54,
            fontWeight: "900",
            color: textColor,
            letterSpacing: -2,
          }}
        />
        {subtitle ? (
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: "rgba(255, 255, 255, 0.7)",
              marginTop: 4,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const TIME_LABELS = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};
const TIME_EMOJIS = { morning: "🌅", afternoon: "☀️", night: "🌙" };

export default function RecapStoryModal({
  visible,
  onClose,
  recap,
  period = "weekly",
}) {
  const scrollRef = useRef(null);
  const viewShotRefs = useRef(
    [...Array(SLIDE_COUNT)].map(() => React.createRef()),
  ).current;
  const shareCardRef = useRef(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const fadeAnims = useRef(
    [...Array(SLIDE_COUNT)].map(() => new Animated.Value(0)),
  ).current;
  const progressAnims = useRef(
    [...Array(SLIDE_COUNT)].map(() => new Animated.Value(0)),
  ).current;
  const autoPlayTimer = useRef(null);

  // Micro-animations state
  const floatAnim = useRef(new Animated.Value(0)).current;
  const blobAnim1 = useRef(new Animated.Value(0)).current;
  const blobAnim2 = useRef(new Animated.Value(0)).current;

  const periodLabel =
    period === "yearly" && recap?.is_all_time_fallback
      ? "All-Time"
      : period === "yearly"
        ? "Yearly"
        : period === "monthly"
          ? "Monthly"
          : "Weekly";

  // ── Auto-play logic (Instagram Stories style) ──
  useEffect(() => {
    if (visible) {
      setCurrentSlide(0);
      setIsAutoPlaying(true);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      progressAnims.forEach((a) => a.setValue(0));
      animateSlide(0);
      startAutoPlay(0);

      // Start ambient micro-animations
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
      Animated.loop(
        Animated.timing(blobAnim1, {
          toValue: 1,
          duration: 14000,
          useNativeDriver: true,
        }),
      ).start();
      Animated.loop(
        Animated.timing(blobAnim2, {
          toValue: 1,
          duration: 18000,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      stopAutoPlay();
      floatAnim.stopAnimation();
      blobAnim1.stopAnimation();
      blobAnim2.stopAnimation();
    }
    return () => {
      stopAutoPlay();
      floatAnim.stopAnimation();
      blobAnim1.stopAnimation();
      blobAnim2.stopAnimation();
    };
  }, [visible]);

  const startAutoPlay = (fromSlide) => {
    stopAutoPlay();
    // Animate progress bar for current slide
    progressAnims[fromSlide].setValue(0);
    Animated.timing(progressAnims[fromSlide], {
      toValue: 1,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && fromSlide < SLIDE_COUNT - 1) {
        const next = fromSlide + 1;
        goToSlide(next, true);
      } else if (finished) {
        setIsAutoPlaying(false);
      }
    });
  };

  const stopAutoPlay = () => {
    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    progressAnims.forEach((a) => a.stopAnimation());
  };

  const animateSlide = useCallback(
    (idx) => {
      fadeAnims.forEach((a) => a.setValue(0));
      Animated.spring(fadeAnims[idx], {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
    },
    [fadeAnims],
  );

  const goToSlide = (idx, fromAutoPlay = false) => {
    if (idx < 0 || idx >= SLIDE_COUNT) return;
    if (!fromAutoPlay) {
      stopAutoPlay();
      setIsAutoPlaying(false);
    }
    setCurrentSlide(idx);
    scrollRef.current?.scrollTo({ x: idx * SW, animated: true });
    if (idx === 2) {
      HapticPatterns.milestone();
    }
    animateSlide(idx);
    // Fill previous progress bars, reset future ones
    progressAnims.forEach((a, i) => {
      if (i < idx) a.setValue(1);
      else if (i > idx) a.setValue(0);
    });
    if (fromAutoPlay || isAutoPlaying) startAutoPlay(idx);
  };

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
    if (idx !== currentSlide && idx >= 0 && idx < SLIDE_COUNT) {
      stopAutoPlay();
      setIsAutoPlaying(false);
      setCurrentSlide(idx);
      if (idx === 2) {
        HapticPatterns.milestone();
      }
      animateSlide(idx);
      progressAnims.forEach((a, i) => {
        if (i < idx) a.setValue(1);
        else if (i > idx) a.setValue(0);
        else a.setValue(0);
      });
    }
  };

  const handleShare = async () => {
    try {
      setIsSharing(true);
      stopAutoPlay();

      if (shareCardRef.current) {
        await new Promise((r) => setTimeout(r, 100));
        const uri = await shareCardRef.current.capture();

        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            dialogTitle: `${periodLabel} Health Recap`,
            mimeType: "image/png",
          });
        } else {
          await Share.share({
            message: `My ${periodLabel} Health Recap 💙\n${recap?.adherence_rate || 0}% adherence | ${recap?.streak_current || 0} day streak\n#CareMyMed #HealthJourney`,
          });
        }
      }
    } catch (err) {
      console.warn("Share error:", err);
    } finally {
      setIsSharing(false);
    }
  };

  if (!visible || !recap) return null;

  const r = recap;
  const bestTime = r.most_consistent_time || "morning";

  const makeSlideAnim = (idx) => ({
    opacity: fadeAnims[idx],
    transform: [
      {
        translateY: fadeAnims[idx].interpolate({
          inputRange: [0, 1],
          outputRange: [40, 0],
        }),
      },
      {
        scale: fadeAnims[idx].interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1],
        }),
      },
    ],
  });

  const floatTransform = [
    {
      translateY: floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-10, 10],
      }),
    },
  ];
  const b1Transform = [
    {
      rotate: blobAnim1.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    },
    {
      scale: blobAnim1.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1.5, 1.8, 1.5],
      }),
    },
  ];
  const b2Transform = [
    {
      rotate: blobAnim2.interpolate({
        inputRange: [0, 1],
        outputRange: ["360deg", "0deg"],
      }),
    },
    {
      scale: blobAnim2.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1.5, 2.0, 1.5],
      }),
    },
  ];

  const BrandBadge = ({ theme }) => (
    <View style={[s.brandBadge, { backgroundColor: theme.accentBg, alignSelf: "center" }]}>
      <Heart size={14} color={theme.accentText} fill={theme.accentText} />
      <Text style={[s.brandText, { color: theme.accentText }]}>CareMyMed</Text>
    </View>
  );

  const renderSlide = (idx) => {
    const theme = { ...SLIDE_THEMES[idx] };
    if (idx === 4) {
      const isMorning = bestTime === "morning";
      const isAfternoon = bestTime === "afternoon";
      const isNight = bestTime === "night";
      if (isMorning) {
        theme.blobColor1 = "rgba(16, 185, 129, 0.03)";
        theme.blobColor2 = "rgba(16, 185, 129, 0.015)";
      } else if (isAfternoon) {
        theme.blobColor1 = "rgba(245, 158, 11, 0.03)";
        theme.blobColor2 = "rgba(245, 158, 11, 0.015)";
      } else if (isNight) {
        theme.blobColor1 = "rgba(139, 92, 246, 0.03)";
        theme.blobColor2 = "rgba(139, 92, 246, 0.015)";
      }
    }
    const grad = theme.colors;
    let content;

    switch (idx) {
      case 0:
        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(0)]}>
            <View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: "rgba(236, 72, 153, 0.08)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(236, 72, 153, 0.15)",
                marginBottom: 36,
                shadowColor: "#EC4899",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trophy size={64} color="#EC4899" strokeWidth={2} />
              </View>
            </View>

            <Text
              style={{
                fontSize: 48,
                fontWeight: "900",
                color: "#FFFFFF",
                textAlign: "center",
                lineHeight: 52,
                letterSpacing: -1,
              }}
            >
              YOUR HEALTH{"\n"}
              <Text style={{ color: "#EC4899" }}>WRAPPED</Text>
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: "rgba(255, 255, 255, 0.5)",
                fontWeight: "500",
                textAlign: "center",
                marginTop: 12,
              }}
            >
              {r.date_range?.start} — {r.date_range?.end}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.06)",
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginTop: 40,
              }}
            >
              <Sparkles size={14} color="#EC4899" />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                Tap or swipe to begin
              </Text>
            </View>
          </Animated.View>
        );
        break;
      case 1: {
        const subtitleText = r.adherence_rate >= 90
          ? "Outstanding."
          : r.adherence_rate >= 70
            ? "Great Work."
            : "Keep It Up.";
        
        const impVal = r.improvement_vs_previous || 0;
        const impLabel = impVal > 0 
          ? `+${impVal}% vs last period` 
          : impVal < 0 
            ? `${impVal}% vs last period` 
            : "Steady pace";

        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(1)]}>
            {/* Glowing Ring Spotlight */}
            <View
              style={{
                width: 220,
                height: 220,
                borderRadius: 110,
                backgroundColor: "rgba(16, 185, 129, 0.05)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(16, 185, 129, 0.12)",
                marginBottom: 36,
              }}
            >
              <ProgressRing
                progress={r.adherence_rate || 0}
                size={180}
                strokeWidth={12}
                activeColor="#10B981"
                trackColor="rgba(255, 255, 255, 0.08)"
                textColor="#FFFFFF"
                subtitle={subtitleText}
              />
            </View>

            <Text
              style={{
                fontSize: 48,
                fontWeight: "900",
                color: "#FFFFFF",
                textAlign: "center",
                lineHeight: 52,
                letterSpacing: -1,
              }}
            >
              Adherence{"\n"}
              <Text style={{ color: "#10B981" }}>Score</Text>
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: "rgba(255, 255, 255, 0.5)",
                fontWeight: "500",
                textAlign: "center",
                marginTop: 12,
              }}
            >
              Every logged dose builds consistency
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.06)",
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginTop: 40,
              }}
            >
              <TrendingUp size={14} color="#10B981" />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                {impLabel}
              </Text>
            </View>
          </Animated.View>
        );
        break;
      }
      case 2:
        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(2)]}>
            {/* Glowing Orange Flame Circle */}
            <View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(245, 158, 11, 0.15)",
                marginBottom: 36,
                shadowColor: "#F59E0B",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Flame size={64} color="#F59E0B" fill="#F59E0B" strokeWidth={2} />
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <AnimatedCounter
                value={r.streak_current || 0}
                style={{
                  fontSize: 84,
                  fontWeight: "900",
                  color: "#FFFFFF",
                  letterSpacing: -3,
                  lineHeight: 90,
                }}
              />
              <Text style={{ fontSize: 28, fontWeight: "950", color: "#F59E0B" }}> DAYS</Text>
            </View>

            <Text
              style={{
                fontSize: 48,
                fontWeight: "900",
                color: "#FFFFFF",
                textAlign: "center",
                lineHeight: 52,
                letterSpacing: -1,
                marginTop: 8,
              }}
            >
              Current{"\n"}
              <Text style={{ color: "#F59E0B" }}>Streak</Text>
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: "rgba(255, 255, 255, 0.5)",
                fontWeight: "500",
                textAlign: "center",
                marginTop: 12,
              }}
            >
              You're building exceptional momentum!
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.06)",
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginTop: 40,
              }}
            >
              <Trophy size={14} color="#F59E0B" />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                Best streak: {r.streak_best || 0} days
              </Text>
            </View>
          </Animated.View>
        );
        break;
      case 3:
        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(3)]}>
            {/* Glowing Violet Pill Circle */}
            <View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: "rgba(139, 92, 246, 0.08)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(139, 92, 246, 0.15)",
                marginBottom: 36,
                shadowColor: "#8B5CF6",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pill size={64} color="#8B5CF6" strokeWidth={2} />
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <AnimatedCounter
                value={r.total_doses_taken || 0}
                style={{
                  fontSize: 84,
                  fontWeight: "900",
                  color: "#FFFFFF",
                  letterSpacing: -3,
                  lineHeight: 90,
                }}
              />
              <Text style={{ fontSize: 28, fontWeight: "950", color: "#8B5CF6" }}> / {r.total_doses_scheduled || 0}</Text>
            </View>

            <Text
              style={{
                fontSize: 48,
                fontWeight: "900",
                color: "#FFFFFF",
                textAlign: "center",
                lineHeight: 52,
                letterSpacing: -1,
                marginTop: 8,
              }}
            >
              Doses{"\n"}
              <Text style={{ color: "#8B5CF6" }}>Completed</Text>
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: "rgba(255, 255, 255, 0.5)",
                fontWeight: "500",
                textAlign: "center",
                marginTop: 12,
              }}
            >
              Every completed dose contributes to wellness
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.06)",
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginTop: 40,
              }}
            >
              <Check size={14} color="#8B5CF6" strokeWidth={3} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                {r.perfect_days || 0} perfect days this {period}
              </Text>
            </View>
          </Animated.View>
        );
        break;
      case 4: {
        const isMorning = bestTime === "morning";
        const isAfternoon = bestTime === "afternoon";
        const isNight = bestTime === "night";

        let iconColor = "#10B981"; // Green
        let glowColor = "rgba(16, 185, 129, 0.08)";
        let highlightColor = "#10B981";
        let IconCmp = Sunrise;

        if (isAfternoon) {
          iconColor = "#F59E0B"; // Orange/Yellow
          glowColor = "rgba(245, 158, 11, 0.08)";
          highlightColor = "#F59E0B";
          IconCmp = Sun;
        } else if (isNight) {
          iconColor = "#8B5CF6"; // Purple
          glowColor = "rgba(139, 92, 246, 0.08)";
          highlightColor = "#8B5CF6";
          IconCmp = Moon;
        }

        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(4), { paddingHorizontal: 0, paddingBottom: 0 }]}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingBottom: 80, width: "100%" }}>
              <View
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: glowColor,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: iconColor + "15",
                  marginBottom: 36,
                  shadowColor: iconColor,
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.1,
                  shadowRadius: 20,
                  elevation: 4,
                }}
              >
                <View
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 70,
                    backgroundColor: "rgba(0,0,0,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconCmp size={64} color={iconColor} strokeWidth={2} />
                </View>
              </View>

              <Text
                style={{
                  fontSize: 48,
                  fontWeight: "900",
                  color: "#FFFFFF",
                  textAlign: "center",
                  lineHeight: 52,
                  letterSpacing: -1,
                }}
              >
                {TIME_LABELS[bestTime]}
                {"\n"}
                <Text style={{ color: highlightColor }}>Champion</Text>
              </Text>

              <Text
                style={{
                  fontSize: 16,
                  color: "rgba(255, 255, 255, 0.5)",
                  fontWeight: "500",
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                Your most consistent time slot
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.06)",
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginTop: 40,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: highlightColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={12} color="#000000" strokeWidth={3} />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: "rgba(255, 255, 255, 0.7)",
                  }}
                >
                  <Text style={{ color: highlightColor, fontWeight: "700" }}>
                    Consistency
                  </Text>{" "}
                  looks good on you.
                </Text>
              </View>
            </View>
          </Animated.View>
        );
        break;
      }
      case 5:
        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(5)]}>
            {/* Glowing Purple Growth Circle */}
            <View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: "rgba(168, 85, 247, 0.08)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(168, 85, 247, 0.15)",
                marginBottom: 36,
                shadowColor: "#A855F7",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 64 }}>{r.level?.emoji || "🌱"}</Text>
              </View>
            </View>

            <Text
              style={{
                fontSize: 48,
                fontWeight: "900",
                color: "#FFFFFF",
                textAlign: "center",
                lineHeight: 52,
                letterSpacing: -1,
              }}
            >
              Level:{"\n"}
              <Text style={{ color: "#A855F7" }}>{r.level?.label || "Growing"}</Text>
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: "rgba(255, 255, 255, 0.5)",
                fontWeight: "500",
                textAlign: "center",
                marginTop: 12,
              }}
            >
              You've unlocked {r.badges_earned || 0} consistency badges!
            </Text>

            {r.top_medication && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.06)",
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginTop: 40,
                }}
              >
                <Trophy size={14} color="#A855F7" />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: "rgba(255, 255, 255, 0.7)",
                  }}
                >
                  Top: {r.top_medication.name} ({r.top_medication.rate}%)
                </Text>
              </View>
            )}
          </Animated.View>
        );
        break;
      case 6:
        content = (
          <Animated.View style={[s.slideContent, makeSlideAnim(6)]}>
            {/* Glowing Indigo/Blue Circle */}
            <View
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(59, 130, 246, 0.15)",
                marginBottom: 36,
                shadowColor: "#3B82F6",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={64} color="#3B82F6" strokeWidth={2} />
              </View>
            </View>

            <Text
              style={{
                fontSize: 32,
                fontWeight: "900",
                color: "#FFFFFF",
                textAlign: "center",
                lineHeight: 38,
                letterSpacing: -1,
                paddingHorizontal: 12,
              }}
              adjustsFontSizeToFit
              numberOfLines={3}
            >
              "{r.motivational_message || "Keep going! 💙"}"
            </Text>

            <Text
              style={{
                fontSize: 15,
                color: "rgba(255, 255, 255, 0.4)",
                fontWeight: "600",
                textAlign: "center",
                marginTop: 16,
              }}
            >
              CareMyMed • Your Health Wrapped
            </Text>

            <Pressable
              style={[s.shareBtn, { backgroundColor: "#3B82F6" }]}
              onPress={handleShare}
              disabled={isSharing}
            >
              <Share2 size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={[s.shareBtnText, { color: "#FFFFFF" }]}>
                {isSharing ? "Capturing..." : "Share Story"}
              </Text>
            </Pressable>
          </Animated.View>
        );
        break;
    }

    return (
      <View key={idx} style={{ width: SW, height: "100%", overflow: "hidden" }}>
        <ViewShot
          ref={viewShotRefs[idx]}
          style={StyleSheet.absoluteFill}
          options={{ format: "png", quality: 1 }}
        >
          <LinearGradient colors={grad} style={StyleSheet.absoluteFill} />

          {/* Floating Background Blobs for Spotify Texture */}
          <Animated.View
            style={[
              s.bgBlob,
              {
                top: -100,
                left: -50,
                width: 300,
                height: 300,
                backgroundColor: theme.blobColor2,
                transform: b1Transform,
              },
            ]}
          />
          <Animated.View
            style={[
              s.bgBlob,
              {
                bottom: -50,
                right: -100,
                width: 400,
                height: 400,
                backgroundColor: theme.blobColor1,
                transform: b2Transform,
              },
            ]}
          />

          {content}
        </ViewShot>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={s.container}>
        {/* Progress bars (Instagram Stories style) */}
        <View style={s.progressRow}>
          {[...Array(SLIDE_COUNT)].map((_, i) => (
            <View key={i} style={s.progressBarBg}>
              <Animated.View
                style={[
                  s.progressBarFill,
                  {
                    width: progressAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          bounces={false}
        >
          {[...Array(SLIDE_COUNT)].map((_, i) => renderSlide(i))}
        </ScrollView>

        {/* Hidden Spotify-Wrapped style Share Graphic */}
        <View
          style={{
            position: "absolute",
            top: -10000,
            left: -10000,
            width: 1080,
            height: 1920,
          }}
        >
          <ViewShot
            ref={shareCardRef}
            style={{ flex: 1, backgroundColor: "#FF416C" }}
            options={{ format: "png", quality: 1 }}
          >
            <LinearGradient
              colors={["#FF416C", "#FF4B2B"]}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={{ flex: 1, padding: 80, justifyContent: "space-between" }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <Heart size={48} color="#000" fill="#000" />
                  <Text
                    style={{
                      fontSize: 40,
                      fontWeight: "900",
                      color: "#000",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    CareMyMed
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 32,
                    fontWeight: "900",
                    color: "rgba(0,0,0,0.7)",
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  {periodLabel} Wrapped
                </Text>
              </View>

              {/* Main Stat */}
              <View style={{ alignItems: "flex-start", marginTop: 120 }}>
                <Text
                  style={{
                    fontSize: 48,
                    fontWeight: "900",
                    color: "#000",
                    marginBottom: 20,
                    textTransform: "uppercase",
                  }}
                >
                  I achieved
                </Text>
                <Text
                  style={{
                    fontSize: 260,
                    fontWeight: "900",
                    color: "#FFF",
                    letterSpacing: -12,
                    lineHeight: 280,
                    marginLeft: -10,
                  }}
                >
                  {recap?.adherence_rate || 0}%
                </Text>
                <Text
                  style={{
                    fontSize: 64,
                    fontWeight: "900",
                    color: "#000",
                    marginTop: -10,
                    textTransform: "uppercase",
                    letterSpacing: -2,
                  }}
                >
                  Medication Adherence
                </Text>
              </View>

              {/* Sub Stats Row */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: "#000",
                  borderRadius: 50,
                  padding: 60,
                  marginTop: 120,
                }}
              >
                <View style={{ alignItems: "flex-start" }}>
                  <Flame
                    size={64}
                    color="#FF4B2B"
                    style={{ marginBottom: 20 }}
                  />
                  <Text
                    style={{
                      fontSize: 96,
                      fontWeight: "900",
                      color: "#FFF",
                      letterSpacing: -4,
                    }}
                  >
                    {recap?.streak_current || 0}
                  </Text>
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "900",
                      color: "rgba(255,255,255,0.7)",
                      marginTop: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    Day Streak
                  </Text>
                </View>
                <View
                  style={{ width: 4, backgroundColor: "rgba(255,255,255,0.1)" }}
                />
                <View style={{ alignItems: "flex-start" }}>
                  <Trophy
                    size={64}
                    color="#F2C94C"
                    style={{ marginBottom: 20 }}
                  />
                  <Text
                    style={{
                      fontSize: 96,
                      fontWeight: "900",
                      color: "#FFF",
                      letterSpacing: -4,
                    }}
                  >
                    {recap?.perfect_days || 0}
                  </Text>
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: "900",
                      color: "rgba(255,255,255,0.7)",
                      marginTop: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    Perfect Days
                  </Text>
                </View>
              </View>

              {/* Footer */}
              <View
                style={{
                  alignItems: "flex-start",
                  marginTop: 120,
                  marginBottom: 40,
                }}
              >
                <Text
                  style={{
                    fontSize: 40,
                    fontWeight: "900",
                    color: "#000",
                    letterSpacing: -1,
                  }}
                >
                  Your Health. Unwrapped.
                </Text>
                <Text
                  style={{
                    fontSize: 32,
                    fontWeight: "900",
                    color: "rgba(0,0,0,0.6)",
                    marginTop: 16,
                  }}
                >
                  caremymed.com
                </Text>
              </View>
            </View>
          </ViewShot>
        </View>

        {/* Close */}
        <Pressable style={s.closeBtn} onPress={onClose} hitSlop={12}>
          <X size={24} color="#FFF" />
        </Pressable>

        {/* Play/Pause indicator */}
        <Pressable
          style={s.playPauseBtn}
          onPress={() => {
            if (isAutoPlaying) {
              stopAutoPlay();
              setIsAutoPlaying(false);
            } else {
              setIsAutoPlaying(true);
              startAutoPlay(currentSlide);
            }
          }}
        >
          <Text style={s.playPauseText}>{isAutoPlaying ? "❚❚" : "▶"}</Text>
        </Pressable>

        {/* Dots */}
        <View style={s.dotsRow}>
          {[...Array(SLIDE_COUNT)].map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)}>
              <View style={[s.dot, currentSlide === i && s.dotActive]} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  playPauseBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 68,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  playPauseText: { color: "#FFF", fontSize: 14, fontWeight: "700" },

  // Progress bars (video-like)
  progressRow: {
    position: "absolute",
    top: Platform.OS === "ios" ? 48 : 28,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 4,
    zIndex: 20,
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FFF",
    borderRadius: 2,
  },

  dotsRow: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 50 : 30,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: { backgroundColor: "#FFF", width: 24, borderRadius: 4 },

  slideContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  slideLeftAlign: {
    alignItems: "flex-start",
    paddingHorizontal: 30,
  },
  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    marginBottom: 32,
    alignSelf: "flex-start",
  },
  brandText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  watermark: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 90 : 70,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    opacity: 0.6,
    zIndex: 5,
  },
  watermarkText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#000",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  introTitle: {
    fontSize: 52,
    fontWeight: "900",
    textAlign: "left",
    lineHeight: 56,
    letterSpacing: -2,
    textTransform: "uppercase",
  },
  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 24,
  },
  datePillText: { fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  introHint: { fontSize: 16, marginTop: 40, fontWeight: "800" },

  slideLabel: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: 16,
    textTransform: "uppercase",
  },
  slideTitle: {
    fontSize: 40,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 44,
    letterSpacing: -2,
    textTransform: "uppercase",
  },
  slideTitleAlt: {
    fontSize: 34,
    fontWeight: "900",
    textAlign: "left",
    marginTop: 10,
    letterSpacing: -1,
  },
  slideCaption: {
    fontSize: 18,
    marginTop: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  bigStat: {
    fontSize: 96,
    fontWeight: "900",
    letterSpacing: -4,
    marginTop: -10,
  },
  megaStat: {
    fontSize: 140,
    fontWeight: "900",
    letterSpacing: -8,
    marginTop: 0,
    marginLeft: -5,
  },
  bigStatSub: { fontSize: 32, fontWeight: "900" },
  bigEmoji: {
    fontSize: 80,
    marginBottom: 16,
    transform: [{ rotate: "-10deg" }],
  },
  ringText: { fontSize: 48, fontWeight: "900", letterSpacing: -2 },

  cardPanel: {
    padding: 30,
    borderRadius: 40,
    alignItems: "center",
    width: "100%",
  },

  changeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 24,
  },
  changeText: { fontSize: 15, fontWeight: "900", textTransform: "uppercase" },

  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  pillBadgeText: { fontSize: 15, fontWeight: "900" },

  topMedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 24,
  },
  topMedText: { fontSize: 15, fontWeight: "900" },

  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 50,
    marginTop: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  shareBtnText: { fontSize: 18, fontWeight: "900", textTransform: "uppercase" },

  bgBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.5,
    transform: [{ scale: 1.5 }],
    filter: "blur(40px)",
  },
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
});
