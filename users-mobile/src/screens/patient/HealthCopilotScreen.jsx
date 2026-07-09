import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  StatusBar,
  Image,
  ScrollView,
  AppState,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Send,
  Sparkles,
  Bot,
  User,
  Pill,
  Flame,
  TrendingUp,
  CheckCircle2,
  Activity,
  Heart,
  Wind,
  Calendar,
  Shield,
  Clock,
  Moon,
  CheckSquare,
  Square,
} from "lucide-react-native";
import { colors, radius, spacing, typography } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import usePatientStore from "../../store/usePatientStore";
import { apiService, handleApiError, getApiTokens } from "../../lib/api";
import AlertManager from "../../utils/AlertManager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TabScreenTransition from "../../components/ui/TabScreenTransition";

export default function HealthCopilotScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { displayName } = useAuth();
  const [copilotContext, setCopilotContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(true);

  // Checked states for Morning Brief and Care Plan items (stored locally)
  const [checkedBriefItems, setCheckedBriefItems] = useState({});
  const [checkedMedsTasks, setCheckedMedsTasks] = useState({});

  const firstName = displayName?.split(" ")[0] || "there";

  // Fetch Copilot Context (Morning Brief + Care Plan)
  const fetchContext = async () => {
    try {
      setLoadingContext(true);
      const res = await apiService.patients.getCopilotContext();
      setCopilotContext(res.data);
    } catch (err) {
      console.warn("[HealthCopilot] Failed to fetch context:", err.message);
    } finally {
      setLoadingContext(false);
    }
  };

  useEffect(() => {
    fetchContext();
  }, []);

  const toggleBriefItem = (idx) => {
    setCheckedBriefItems((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const toggleMedsTask = (idx) => {
    setCheckedMedsTasks((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#1E293B" />
        </Pressable>
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>Health Copilot</Text>
          <Text style={styles.headerSub}>
            Interactive Care & Action Workspace
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Sparkles size={22} color="#6366F1" />
        </View>
      </View>
    </View>
  );

  const renderBriefTab = () => {
    if (loadingContext) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>
            Fetching health plan context...
          </Text>
        </View>
      );
    }

    const brief = copilotContext?.morning_brief || {};
    const carePlan = copilotContext?.care_plan || {};
    const focusItems = brief.focus_items || [];
    const scoreChange = brief.score_change || "+0";
    const trajectory = brief.forecast || "Stable";
    const healthScore = brief.health_score || 80;

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.briefScroll}
      >
        {/* Morning Brief Overview Card */}
        <View style={styles.briefCard}>
          <LinearGradient
            colors={["#FAF5FF", "#F0F9FF", "#FFFFFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.briefGradient}
          >
            <View style={styles.briefHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.briefGreeting}>
                  Good Morning, {firstName}! 👋
                </Text>
                <Text style={styles.briefTime}>
                  Your health state is updated
                </Text>
              </View>
              <View style={styles.briefScoreBadge}>
                <Text style={styles.briefScoreValue}>{healthScore}</Text>
                <Text style={styles.briefScoreLabel}>SCORE</Text>
              </View>
            </View>

            <View style={styles.briefMetricsRow}>
              <View style={styles.briefMetricItem}>
                <View
                  style={[
                    styles.metricIconWrap,
                    { backgroundColor: "#EEF2FF" },
                  ]}
                >
                  <TrendingUp size={16} color="#6366F1" />
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text style={styles.briefMetricValue}>{scoreChange}</Text>
                  <Text style={styles.briefMetricLabel}>Weekly Change</Text>
                </View>
              </View>
              <View style={styles.briefDivider} />
              <View style={styles.briefMetricItem}>
                <View
                  style={[
                    styles.metricIconWrap,
                    {
                      backgroundColor:
                        trajectory === "Declining" ? "#FEF2F2" : "#ECFDF5",
                    },
                  ]}
                >
                  <Activity
                    size={16}
                    color={trajectory === "Declining" ? "#EF4444" : "#10B981"}
                  />
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={[
                      styles.briefMetricValue,
                      {
                        color:
                          trajectory === "Declining" ? "#EF4444" : "#10B981",
                      },
                    ]}
                  >
                    {trajectory}
                  </Text>
                  <Text style={styles.briefMetricLabel}>
                    Forecast Trajectory
                  </Text>
                </View>
              </View>
            </View>

            {/* Today's Checklist */}
            <Text style={styles.sectionHeading}>Today's Focus Items</Text>
            {focusItems.length === 0 ? (
              <Text style={styles.emptyText}>
                You are all caught up for today!
              </Text>
            ) : (
              <View style={styles.focusList}>
                {focusItems.map((item, idx) => {
                  const isChecked = !!checkedBriefItems[idx];

                  // Determine indicator color based on task content
                  const itemLower = item.toLowerCase();
                  let indicatorColor = "#64748B"; // slate
                  if (
                    itemLower.includes("medication") ||
                    itemLower.includes("meds")
                  ) {
                    indicatorColor = "#7C3AED"; // lavender/purple
                  } else if (
                    itemLower.includes("bp") ||
                    itemLower.includes("blood pressure") ||
                    itemLower.includes("vitals")
                  ) {
                    indicatorColor = "#0284C7"; // sky blue
                  } else if (itemLower.includes("streak")) {
                    indicatorColor = "#D97706"; // amber
                  }

                  return (
                    <Pressable
                      key={`brief-${idx}`}
                      style={({ pressed }) => [
                        styles.focusItemRow,
                        { borderLeftColor: indicatorColor },
                        isChecked && styles.focusItemRowChecked,
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => toggleBriefItem(idx)}
                    >
                      <View style={styles.checkboxContainer}>
                        {isChecked ? (
                          <View
                            style={[
                              styles.customCheckboxChecked,
                              { backgroundColor: indicatorColor },
                            ]}
                          >
                            <CheckSquare
                              size={14}
                              color="#FFFFFF"
                              strokeWidth={3}
                            />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.customCheckboxUnchecked,
                              { borderColor: indicatorColor },
                            ]}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.focusItemText,
                          isChecked && styles.focusItemTextChecked,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Weekly Care Plan Card */}
        <View style={styles.carePlanCard}>
          <Text style={styles.carePlanTitle}>
            Weekly Care Plan (v{carePlan.version || 1})
          </Text>
          <Text style={styles.carePlanSub}>
            Targets generated dynamically from your health insights
          </Text>

          <View style={styles.targetsGrid}>
            <View style={styles.targetGridItem}>
              <View style={styles.targetIconCircle}>
                <Activity size={16} color="#6366F1" />
              </View>
              <Text style={styles.targetGridValue}>
                {carePlan.target_health_score || 85}
              </Text>
              <Text style={styles.targetGridLabel}>Target Health Score</Text>
            </View>
            <View style={styles.targetGridItem}>
              <View style={styles.targetIconCircleBlue}>
                <Moon size={16} color="#0EA5E9" />
              </View>
              <Text style={styles.targetGridValue}>
                {carePlan.sleep_hours_goal || 7.5} hrs
              </Text>
              <Text style={styles.targetGridLabel}>Target Sleep/Night</Text>
            </View>
          </View>

          <View style={styles.vitalsTargetBox}>
            <View style={styles.vitalsTargetIconBox}>
              <Clock size={16} color="#475569" />
            </View>
            <Text style={styles.vitalsTargetText}>
              Vitals Target:{" "}
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>
                {carePlan.vitals_target || "BP check every 2 days"}
              </Text>
            </Text>
          </View>

          <Text style={styles.sectionHeading}>Medication Plan Checklist</Text>
          {!carePlan.medication_tasks ||
          carePlan.medication_tasks.length === 0 ? (
            <Text style={styles.emptyText}>
              No medications tasks configured.
            </Text>
          ) : (
            <View style={styles.medTaskList}>
              {carePlan.medication_tasks.map((task, idx) => {
                const isChecked = !!checkedMedsTasks[idx];
                return (
                  <Pressable
                    key={`med-${idx}`}
                    style={({ pressed }) => [
                      styles.medTaskRow,
                      isChecked && styles.medTaskRowChecked,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => toggleMedsTask(idx)}
                  >
                    {isChecked ? (
                      <View style={styles.checkedCircleWrap}>
                        <CheckCircle2
                          size={16}
                          color="#22C55E"
                          strokeWidth={3}
                        />
                      </View>
                    ) : (
                      <View style={styles.pendingDot} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.medTaskName,
                          isChecked && styles.medTaskChecked,
                        ]}
                      >
                        {task.name}
                      </Text>
                      <Text style={styles.medTaskSlot}>
                        {task.time_slot.toUpperCase()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <TabScreenTransition>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {renderHeader()}
        <View style={{ flex: 1 }}>{renderBriefTab()}</View>
      </View>
    </TabScreenTransition>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: Platform.OS === "ios" ? 44 : 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.screen,
    paddingVertical: 14,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1E293B",
  },
  headerSub: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  headerActions: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.screen,
    paddingBottom: 10,
    gap: 12,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: "#F1F5F9",
  },
  tabBtnActive: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  tabBtnTextActive: {
    color: "#6366F1",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  briefScroll: {
    padding: spacing.screen,
    gap: 16,
  },
  briefCard: {
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  briefGradient: {
    padding: 20,
  },
  briefHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  briefGreeting: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1E293B",
  },
  briefTime: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  briefScoreBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  briefScoreValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  briefScoreLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#C7D2FE",
  },
  briefMetricsRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    padding: 12,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  briefMetricItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  briefMetricValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E293B",
  },
  briefMetricLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 1,
  },
  briefDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 8,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 10,
  },
  focusList: {
    gap: 10,
  },
  focusItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 4,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  focusItemRowChecked: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    opacity: 0.75,
  },
  checkboxContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  customCheckboxChecked: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  customCheckboxUnchecked: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  focusItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    flex: 1,
    lineHeight: 18,
  },
  focusItemTextChecked: {
    textDecorationLine: "line-through",
    color: "#94A3B8",
  },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 10,
  },
  carePlanCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  carePlanTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#1E293B",
  },
  carePlanSub: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 2,
    marginBottom: 16,
  },
  targetsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  targetGridItem: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  targetIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  targetIconCircleBlue: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F0F9FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  targetGridValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1E293B",
  },
  targetGridLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
  },
  vitalsTargetBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  vitalsTargetIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  vitalsTargetText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
    flex: 1,
  },
  medTaskList: {
    gap: 8,
  },
  medTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  medTaskRowChecked: {
    backgroundColor: "#F8FAFC",
    opacity: 0.75,
  },
  checkedCircleWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#94A3B8",
    backgroundColor: "transparent",
  },
  medTaskName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  medTaskChecked: {
    textDecorationLine: "line-through",
    color: "#94A3B8",
  },
  medTaskSlot: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6366F1",
    marginTop: 2,
  },
  chatListContent: {
    paddingHorizontal: spacing.screen,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  bubbleRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
    maxWidth: "85%",
  },
  bubbleRowUser: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  bubbleRowBot: {
    alignSelf: "flex-start",
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "relative",
    overflow: "hidden",
  },
  bubbleBot: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: "#1E293B",
    lineHeight: 20,
    fontWeight: "500",
  },
  bubbleTextUser: {
    color: "#FFFFFF",
  },
  bubbleTime: {
    fontSize: 9,
    color: "#94A3B8",
    marginTop: 6,
    alignSelf: "flex-end",
  },
  bubbleTimeUser: {
    color: "#C7D2FE",
  },
  typingStageText: {
    fontSize: 13,
    color: "#64748B",
    marginRight: 6,
    fontWeight: "600",
  },
  suggestionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  suggestionChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  suggestionChipText: {
    fontSize: 13,
    color: "#4F46E5",
    fontWeight: "700",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: spacing.screen,
    paddingTop: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 16,
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "500",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
});
