import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, LayoutAnimation } from "react-native";
import { colors, typography, radius, spacing } from "../../theme";
import * as Icons from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { HapticPatterns } from "../../utils/haptics";

// ── Cached Intl formatters to avoid GC churn ────────────
const _dateFormatters = {};
const _displayFormatters = {};

const getDateFormatter = (tz) => {
  if (!_dateFormatters[tz]) {
    _dateFormatters[tz] = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return _dateFormatters[tz];
};

const getLocalDateString = (date, tz) => {
  try {
    return getDateFormatter(tz).format(date);
  } catch (e) {
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
};

const getDisplayFormatter = (tz) => {
  if (!_displayFormatters[tz]) {
    _displayFormatters[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    });
  }
  return _displayFormatters[tz];
};

const getFormattedDateString = (date, tz) => {
  try {
    return getDisplayFormatter(tz).format(date);
  } catch (e) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }
};

const StreakCalendar = ({ dailyLog = [], timezone = "Asia/Kolkata", profile = null, onPressLogActivity = null }) => {
  const [selectedDay, setSelectedDay] = useState(null);

  // Animated values for selected day scale & lift translation
  const selectedCellScale = useRef(new Animated.Value(1)).current;
  const selectedCellTranslateY = useRef(new Animated.Value(0)).current;

  // Animated value for progress bar width interpolation
  const progressAnimWidth = useRef(new Animated.Value(0)).current;

  // Generate last 35 days
  const days = [];
  const now = new Date();

  for (let i = 34; i >= 0; i--) {
    const date = new Date();
    date.setDate(now.getDate() - i);
    const dateStr = getLocalDateString(date, timezone);

    // Find matching log entry
    const log = dailyLog.find((l) => l.date === dateStr);
    days.push({
      date: date,
      dateStr: dateStr,
      log: log || null,
    });
  }

  // Set default selected day on mount
  useEffect(() => {
    if (days.length > 0 && !selectedDay) {
      const todayDay = days[days.length - 1];
      setSelectedDay(todayDay);
    }
  }, [dailyLog]);

  // Spring animation for selection lift & score progress bar fill
  useEffect(() => {
    if (selectedDay) {
      // 1. Apple-style lift animation
      selectedCellScale.setValue(0.95);
      selectedCellTranslateY.setValue(0);
      Animated.parallel([
        Animated.spring(selectedCellScale, {
          toValue: 1.08,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(selectedCellTranslateY, {
          toValue: -2,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // 2. Progress bar spring animation
      const targetScore = calculateDailyConsistency(selectedDay);
      Animated.spring(progressAnimWidth, {
        toValue: targetScore,
        friction: 8,
        tension: 30,
        useNativeDriver: false, // width cannot use native driver
      }).start();
    }
  }, [selectedDay]);

  // Calculate daily consistency score (weighted & normalized)
  const calculateDailyConsistency = (day) => {
    if (!day || !day.log) return 0;

    const adherence = day.log.adherence; // 0-100 or null
    const mood = day.log.mood;
    const sleep = day.log.sleepHours;
    const bp = day.log.bp;

    const hasMeds = adherence !== null;
    const hasMood = mood !== null && mood !== undefined;
    const hasSleep = sleep !== null && sleep > 0;
    const hasBp = bp && bp.systolic !== null && bp.systolic !== undefined;

    let totalWeight = 0;
    let earnedPoints = 0;

    if (hasMeds) {
      totalWeight += 40;
      earnedPoints += (adherence / 100) * 40;
    }
    totalWeight += 25;
    if (hasSleep) earnedPoints += 25;

    totalWeight += 15;
    if (hasMood) earnedPoints += 15;

    totalWeight += 20;
    if (hasBp) earnedPoints += 20;

    if (totalWeight === 0) return 0;
    return Math.round((earnedPoints / totalWeight) * 100);
  };

  // Monochromatic purple heatmap colors (rich premium contrasts)
  const getSquareColor = (day) => {
    const score = calculateDailyConsistency(day);
    if (score === 0) return "#F4F4F5"; // No data
    if (score <= 30) return "#F3E8FF"; // 10-30%
    if (score <= 55) return "#D8B4FE"; // 30-55%
    if (score <= 80) return "#9333EA"; // 55-80%
    return "#5B21B6"; // 80-100%
  };

  const getTextColorForBg = (bgColor) => {
    if (bgColor === "#5B21B6" || bgColor === "#9333EA") return "#FFFFFF";
    if (bgColor === "#F4F4F5") return "#A1A1AA";
    return "#1E293B";
  };

  // Apple/Duolingo style tiny monochrome white glyph milestones for perfect days (100%)
  const getMilestoneIcon = (dayNumber, score) => {
    if (score < 100) return null;
    if (dayNumber === 7) return <Icons.Sparkles size={11} color="#FFFFFF" strokeWidth={2.5} />;
    if (dayNumber === 14) return <Icons.Zap size={11} color="#FFFFFF" strokeWidth={2.5} />;
    if (dayNumber === 21) return <Icons.Star size={11} color="#FFFFFF" strokeWidth={2.5} />;
    if (dayNumber === 28) return <Icons.Flag size={11} color="#FFFFFF" strokeWidth={2.5} />;
    if (dayNumber === 35) return <Icons.Award size={11} color="#FFFFFF" strokeWidth={2.5} />;
    return null;
  };

  const handlePressDay = (day) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      HapticPatterns.selection();
    } catch (e) {}
    setSelectedDay(day);
  };

  const getDayName = (date) => {
    const daysName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return daysName[date.getDay()];
  };

  // AI Coaching feedback generation
  const getCoachingFeedback = (day) => {
    if (!day || !day.log) return "A new day is a fresh opportunity to build consistent habits.";
    const score = calculateDailyConsistency(day);
    const adherence = day.log.adherence;
    const mood = day.log.mood;
    const sleep = day.log.sleepHours;
    const bp = day.log.bp;

    const hasMeds = adherence !== null;
    const medsCompleted = hasMeds && adherence === 100;
    const hasSleep = sleep !== null && sleep > 0;
    const hasMood = mood !== null && mood !== undefined;
    const hasBp = bp && bp.systolic !== null && bp.systolic !== undefined;

    if (score === 100) {
      return "Excellent consistency. You completed every scheduled health activity today!";
    }
    if (hasMeds && adherence < 100) {
      return "You completed some medications today. Try setting alarms to complete the rest.";
    }
    if (!hasSleep) {
      return "Sleep wasn't logged today. Adding it improves tomorrow's insight.";
    }
    if (!hasMood) {
      return "Log your mood today to help track the impact of daily habits on wellness.";
    }
    if (!hasBp) {
      return "Your vitals aren't logged today. Adding them keeps dashboard alerts clear.";
    }
    return "Excellent consistency. You're building a healthy routine step by step.";
  };

  const weekHeaders = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>Health Journey</Text>
          <Text style={styles.cardSubtitle}>Consistency builds over time</Text>
        </View>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>35 Days</Text>
        </View>
      </View>

      {/* Weekday headers */}
      <View style={styles.headerRow}>
        {weekHeaders.map((h, i) => (
          <Text key={i} style={styles.headerText}>
            {h}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {(() => {
          const weeks = [];
          for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
          }
          return weeks.map((week, wIdx) => {
            const isLastWeek = wIdx === weeks.length - 1;
            return (
              <React.Fragment key={`week-frag-${wIdx}`}>
                <View style={styles.weekRow}>
                  {week.map((day, dIdx) => {
                    const bgColor = getSquareColor(day);
                    const score = calculateDailyConsistency(day);
                    const isSelected = selectedDay?.dateStr === day.dateStr;
                    const dayNumber = wIdx * 7 + dIdx + 1;
                    const textColor = getTextColorForBg(bgColor);
                    const milestoneIcon = getMilestoneIcon(dayNumber, score);

                    const content = isSelected ? (
                      <Animated.View
                        style={[
                          styles.square,
                          {
                            backgroundColor: bgColor,
                            transform: [
                              { scale: selectedCellScale },
                              { translateY: selectedCellTranslateY },
                            ],
                          },
                          styles.selectedSquare,
                        ]}
                      >
                        {milestoneIcon ? (
                          milestoneIcon
                        ) : (
                          <Text style={[styles.squareText, { color: textColor }]}>
                            {dayNumber}
                          </Text>
                        )}
                      </Animated.View>
                    ) : (
                      <View style={[styles.square, { backgroundColor: bgColor }]}>
                        {milestoneIcon ? (
                          milestoneIcon
                        ) : (
                          <Text style={[styles.squareText, { color: textColor }]}>
                            {dayNumber}
                          </Text>
                        )}
                      </View>
                    );

                    return (
                      <TouchableOpacity
                        key={`day-${dIdx}`}
                        onPress={() => handlePressDay(day)}
                        activeOpacity={0.8}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        {content}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!isLastWeek && <View style={styles.weekSeparator} />}
              </React.Fragment>
            );
          });
        })()}
      </View>

      {/* Selected Day Details Panel */}
      <View style={styles.detailBox}>
        {selectedDay ? (
          (() => {
            const score = calculateDailyConsistency(selectedDay);
            const hasData = score > 0;

            if (!hasData) {
              return (
                <View style={styles.emptyStateContainer}>
                  <Text style={styles.emptyStateTitle}>Start today's journey</Text>
                  <Text style={styles.emptyStateSubtitle}>Log your first activity to build consistency.</Text>
                  {onPressLogActivity && (
                    <TouchableOpacity style={styles.emptyStateButton} onPress={onPressLogActivity}>
                      <Text style={styles.emptyStateButtonText}>Log Activity</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }

            const adherence = selectedDay.log.adherence;
            const mood = selectedDay.log.mood;
            const sleep = selectedDay.log.sleepHours;
            const bp = selectedDay.log.bp;

            const hasMeds = adherence !== null;
            const medsCompleted = hasMeds && adherence === 100;
            const hasSleep = sleep !== null && sleep > 0;
            const hasMood = mood !== null && mood !== undefined;
            const hasBp = bp && bp.systolic !== null && bp.systolic !== undefined;

            return (
              <View style={styles.detailCard}>
                {/* Section 1: Header */}
                <View style={styles.detailHeader}>
                  <View>
                    <Text style={styles.detailDayName}>{getDayName(selectedDay.date)}</Text>
                    <Text style={styles.detailDate}>{getFormattedDateString(selectedDay.date, timezone)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.scoreTextValue}>{score}%</Text>
                    <Text style={styles.scoreTextLabel}>Daily Consistency</Text>
                  </View>
                </View>

                {/* Section 2: Animated Progress Bar */}
                <View style={styles.progressBarBg}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      {
                        width: progressAnimWidth.interpolate({
                          inputRange: [0, 100],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={["#9333EA", "#5B21B6"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>
                </View>

                {/* Section 3: Navi-style Chips Checklist */}
                <View style={styles.chipsRow}>
                  {hasMeds && (
                    <View style={[styles.chip, medsCompleted ? styles.chipActive : styles.chipInactive]}>
                      <Text style={[styles.chipText, medsCompleted ? styles.chipTextActive : styles.chipTextInactive]}>
                        {medsCompleted ? "✓ Medication" : "○ Medication"}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.chip, hasSleep ? styles.chipActive : styles.chipInactive]}>
                    <Text style={[styles.chipText, hasSleep ? styles.chipTextActive : styles.chipTextInactive]}>
                      {hasSleep ? "✓ Sleep" : "○ Sleep"}
                    </Text>
                  </View>
                  <View style={[styles.chip, hasMood ? styles.chipActive : styles.chipInactive]}>
                    <Text style={[styles.chipText, hasMood ? styles.chipTextActive : styles.chipTextInactive]}>
                      {hasMood ? "✓ Mood" : "○ Mood"}
                    </Text>
                  </View>
                  <View style={[styles.chip, hasBp ? styles.chipActive : styles.chipInactive]}>
                    <Text style={[styles.chipText, hasBp ? styles.chipTextActive : styles.chipTextInactive]}>
                      {hasBp ? "✓ Blood Pressure" : "○ Blood Pressure"}
                    </Text>
                  </View>
                </View>

                {/* Section 6: AI Coaching Feedback */}
                <Text style={styles.feedbackText}>{getCoachingFeedback(selectedDay)}</Text>

                {/* Section 7: Momentum Card */}
                <View style={styles.momentumCard}>
                  <Text style={styles.momentumValue}>🔥</Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.momentumTitle}>
                      {profile?.gamification?.current_streak || 7}-day streak
                    </Text>
                    <Text style={styles.momentumSubtitle}>Keep the momentum going!</Text>
                  </View>
                </View>
              </View>
            );
          })()
        ) : (
          <Text style={styles.placeholderText}>Tap any square to view daily journey details</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.04)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 30,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "400",
  },
  badgeContainer: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "750",
    color: "#64748B",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  headerText: {
    width: 28,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
  },
  grid: {
    width: "100%",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  weekSeparator: {
    height: 1,
    backgroundColor: "rgba(15, 23, 42, 0.02)",
    marginVertical: 6,
  },
  square: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  squareText: {
    fontSize: 11,
    fontWeight: "800",
  },
  selectedSquare: {
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  detailBox: {
    marginTop: 20,
    minHeight: 120,
    justifyContent: "center",
    width: "100%",
  },
  detailCard: {
    width: "100%",
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailDayName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  detailDate: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 1,
  },
  scoreTextValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#7C3AED",
    letterSpacing: -0.5,
  },
  scoreTextLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    marginTop: 1,
    letterSpacing: 0.5,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
    width: "100%",
    marginVertical: 8,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: "#FAF5FF",
    borderColor: "#E9D5FF",
  },
  chipInactive: {
    backgroundColor: "#F4F4F5",
    borderColor: "#E4E4E7",
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#7C3AED",
  },
  chipTextInactive: {
    color: "#71717A",
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },
  momentumCard: {
    backgroundColor: "#FAF5FF",
    borderWidth: 1,
    borderColor: "#F3E8FF",
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  momentumValue: {
    fontSize: 18,
  },
  momentumTitle: {
    fontSize: 12,
    fontWeight: "750",
    color: "#5B21B6",
  },
  momentumSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    color: "#7C3AED",
    marginTop: 1,
  },
  placeholderText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    fontStyle: "italic",
    width: "100%",
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    width: "100%",
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyStateSubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 16,
    textAlign: "center",
  },
  emptyStateButton: {
    borderWidth: 1,
    borderColor: "#7C3AED",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyStateButtonText: {
    color: "#7C3AED",
    fontSize: 11,
    fontWeight: "800",
  },
});

export default StreakCalendar;
