const express = require("express");
const router = express.Router();
const {
  authenticate,
  authenticateSession,
} = require("../middleware/authenticate");
const Patient = require("../models/Patient");
const Profile = require("../models/Profile");
const Companion = require("../models/Companion");
const CompanionAccess = require("../models/CompanionAccess");
const authService = require("../services/authService");
const logger = require("../utils/logger");
const tokenService = require("../services/tokenService");
const { logEvent } = require("../services/auditService");
const Notification = require("../models/Notification");
const PushNotificationService = require("../utils/pushNotifications");
const { otpRateLimiter } = require("../middleware/rateLimiter");
const { createOTP, verifyOTP } = require("../services/otpService");
const { sendOTPEmail } = require("../services/emailService");

/**
 * POST /api/companion/join
 * Join as a family companion using an invite code.
 */
router.post("/join", async (req, res) => {
  try {
    const {
      invite_code,
      email,
      password,
      fullName,
      phone,
      acceptedTermsVersion,
      acceptedPrivacyVersion,
      acceptedAt,
    } = req.body;

    if (!email || !password || !fullName) {
      return res
        .status(400)
        .json({ error: "Email, password, and full name are required." });
    }

    // 1. Find patient by invite code (if provided)
    let patient = null;
    if (invite_code) {
      patient = await Patient.findOne({
        invite_code: invite_code.toUpperCase(),
        invite_code_expires_at: { $gt: new Date() },
      }).select("+invite_code");

      if (!patient) {
        return res
          .status(400)
          .json({ error: "Invalid or expired invite code." });
      }
    }

    // 2. Resolve or Create the Companion Profile
    const emailNorm = email.toLowerCase().trim();

    // NOTE: We intentionally do NOT block patient emails here.
    // A patient can also be a companion (e.g., caring for an elderly parent).

    let profile = await Companion.findOne({ email: emailNorm });
    let isExistingProfile = false;

    if (profile) {
      // SEC-FIX: CRITICAL VULNERABILITY PATCH
      // We MUST verify the provided password matches the existing account's password
      // before allowing them to link to a new care circle.
      const bcrypt = require("bcryptjs");
      const isMatch = await bcrypt.compare(password, profile.passwordHash);
      if (!isMatch) {
        // Generic error to prevent aggressive enumeration, though the email existence is implied by the flow
        return res.status(401).json({ error: "Incorrect email or password." });
      }

      // Check if they already have access to this specific patient
      if (patient) {
        const existingAccess = await CompanionAccess.findOne({
          companion_id: profile._id,
          patient_id: patient._id,
        });
        if (existingAccess) {
          if (
            existingAccess.is_active &&
            existingAccess.status === "accepted"
          ) {
            return res
              .status(400)
              .json({ error: "You are already linked to this patient." });
          } else {
            // Reactivate existing relationship
            existingAccess.is_active = true;
            existingAccess.status = "accepted";
            existingAccess.revoked_at = undefined;
            existingAccess.revoked_by = undefined;
            await existingAccess.save();
          }
        }
      }
      isExistingProfile = true;
    } else {
      // Create a new companion profile
      const supabaseUid = `cmp_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;

      const bcrypt = require("bcryptjs");
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      profile = await Companion.create({
        supabaseUid,
        email: emailNorm,
        passwordHash,
        fullName,
        phone,
        role: "companion",
        emailVerified: true, // Assume verified if they have the code, or require OTP later
        acceptedTermsVersion,
        acceptedPrivacyVersion,
        acceptedAt,
      });
    }

    // 3. Link Profile to Patient using CompanionAccess Relationship Model
    if (patient) {
      const existingAccess = await CompanionAccess.findOne({
        companion_id: profile._id,
        patient_id: patient._id,
      });
      if (!existingAccess) {
        await CompanionAccess.create({
          companion_id: profile._id,
          patient_id: patient._id,
          relationship_type: "Other",
          access_level: "caregiver",
          permissions: ["read_only", "alerts"],
          status: "accepted",
          is_active: true,
          joined_at: new Date(),
          created_by: profile._id,
        });
      }

      // Add to trusted_contacts for backward compatibility in notifications if not already present
      const hasContact = patient.trusted_contacts.some(
        (c) => c.email.toLowerCase() === emailNorm,
      );
      if (!hasContact) {
        patient.trusted_contacts.push({
          name: fullName || profile.fullName,
          phone: phone || profile.phone || "N/A",
          relation: "Family",
          email: emailNorm,
          can_view_data: true,
          is_primary: false,
          is_emergency: false,
          permissions: ["read_only"],
        });
      }

      // 4. Invalidate the invite code (Single Use)
      patient.invite_code = undefined;
      patient.invite_code_expires_at = undefined;
      await patient.save();
    }

    // 5. Issue Auth Session
    const tokens = await tokenService.issueTokenPair(
      {
        userId: profile._id,
        userType: "Companion",
        subject: profile.supabaseUid,
        role: "companion",
        email: profile.email,
        emailVerified: true,
      },
      req,
    );

    if (patient) {
      await logEvent(
        profile.supabaseUid,
        "companion_joined",
        "companion",
        profile._id,
        req,
        { patientId: patient._id },
      );
    }

    res.status(isExistingProfile ? 200 : 201).json({
      message: isExistingProfile
        ? patient
          ? "Successfully linked to new patient."
          : "Successfully logged in."
        : patient
          ? "Joined successfully as a family companion."
          : "Account created successfully.",
      session: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_at,
        user: { id: profile.supabaseUid, email: profile.email },
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
      },
    });
  } catch (err) {
    logger.error("Companion join error", { error: err.message });
    res.status(500).json({ error: "Failed to join as companion." });
  }
});

/**
 * POST /api/companion/check-email
 * Checks if a companion profile exists for the given email.
 * If it does, sends an OTP to verify identity (rate-limited).
 */
router.post("/check-email", otpRateLimiter, async (req, res) => {
  try {
    const { invite_code, email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    if (invite_code) {
      const patient = await Patient.findOne({
        invite_code: invite_code.toUpperCase(),
        invite_code_expires_at: { $gt: new Date() },
      });

      if (!patient) {
        return res
          .status(400)
          .json({ error: "Invalid or expired invite code." });
      }
    }

    const emailNorm = email.toLowerCase().trim();

    const profile = await Companion.findOne({ email: emailNorm });

    if (profile) {
      // Existing companion! Send an OTP.
      const otp = await createOTP(emailNorm);
      sendOTPEmail(emailNorm, otp).catch((err) =>
        logger.error("OTP email failed", { error: err.message }),
      );
      return res.json({
        exists: true,
        message: "If an account exists, a verification code has been sent.",
      });
    }

    res.json({ exists: false });
  } catch (err) {
    logger.error("Companion check-email error", { error: err.message });
    res
      .status(err.status || 500)
      .json({ error: err.message || "Failed to verify email." });
  }
});

/**
 * POST /api/companion/join-otp
 * Verify OTP for an existing companion and link them to the patient.
 */
router.post("/join-otp", otpRateLimiter, async (req, res) => {
  try {
    const { invite_code, email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required." });
    }

    let patient = null;
    if (invite_code) {
      patient = await Patient.findOne({
        invite_code: invite_code.toUpperCase(),
        invite_code_expires_at: { $gt: new Date() },
      });

      if (!patient) {
        return res
          .status(400)
          .json({ error: "Invalid or expired invite code." });
      }
    }

    const emailNorm = email.toLowerCase().trim();
    const profile = await Companion.findOne({ email: emailNorm });

    if (!profile) {
      return res.status(404).json({ error: "Account not found." });
    }

    // Verify the OTP
    const otpResult = await verifyOTP(emailNorm, otp);
    if (!otpResult.valid) {
      return res.status(400).json({ error: otpResult.reason });
    }

    // Link Profile to Patient using CompanionAccess Relationship Model
    if (patient) {
      const existingAccess = await CompanionAccess.findOne({
        companion_id: profile._id,
        patient_id: patient._id,
      });
      if (existingAccess) {
        if (existingAccess.is_active && existingAccess.status === "accepted") {
          // They are already linked but we verified their OTP. Just log them in.
        } else {
          // Reactivate existing relationship
          existingAccess.is_active = true;
          existingAccess.status = "accepted";
          existingAccess.revoked_at = undefined;
          existingAccess.revoked_by = undefined;
          await existingAccess.save();
        }
      } else {
        await CompanionAccess.create({
          companion_id: profile._id,
          patient_id: patient._id,
          relationship_type: "Other",
          access_level: "caregiver",
          permissions: ["read_only", "alerts"],
          status: "accepted",
          is_active: true,
          joined_at: new Date(),
          created_by: profile._id,
        });
      }

      // Add to trusted_contacts for backward compatibility
      const hasContact = patient.trusted_contacts.some(
        (c) => c.email.toLowerCase() === emailNorm,
      );
      if (!hasContact) {
        patient.trusted_contacts.push({
          name: profile.fullName,
          phone: profile.phone || "N/A",
          relation: "Family",
          email: emailNorm,
          can_view_data: true,
          is_primary: false,
          is_emergency: false,
          permissions: ["read_only"],
        });
      }

      // Invalidate the invite code (Single Use)
      patient.invite_code = undefined;
      patient.invite_code_expires_at = undefined;
      await patient.save();
    }

    // Issue Auth Session
    const tokens = await tokenService.issueTokenPair(
      {
        userId: profile._id,
        userType: "Companion",
        subject: profile.supabaseUid,
        role: "companion",
        email: profile.email,
        emailVerified: true,
      },
      req,
    );

    if (patient) {
      await logEvent(
        profile.supabaseUid,
        "companion_joined_otp",
        "companion",
        profile._id,
        req,
        { patientId: patient._id },
      );
    } else {
      await logEvent(
        profile.supabaseUid,
        "companion_login_otp",
        "companion",
        profile._id,
        req,
        {},
      );
    }

    res.status(200).json({
      message: patient
        ? "Successfully linked to new patient via OTP."
        : "Successfully logged in.",
      session: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expires_at: tokens.expires_at,
        user: { id: profile.supabaseUid, email: profile.email },
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
      },
    });
  } catch (err) {
    logger.error("Companion join-otp error", { error: err.message });
    res.status(500).json({ error: "Failed to join as companion." });
  }
});

/**
 * GET /api/companion/patient-status
 * Read-only dashboard for companion to view patient stats.
 */
router.get("/patient-status", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    // Find all active patient relationships linked to this companion using decoupled model
    const accesses = await CompanionAccess.find({
      companion_id: req.profile._id,
      is_active: true,
      status: "accepted",
    }).populate(
      "patient_id",
      "name email phone avatar_url healthScoreCache gamification",
    );

    if (accesses.length === 0) {
      return res.status(200).json({ linked_patients: [], patient: null });
    }

    // Default to the first linked patient, or a specific patientId if requested
    let selectedAccess = accesses[0];
    const requestedPatientId = req.query.patientId;
    if (requestedPatientId) {
      const found = accesses.find(
        (a) =>
          a.patient_id && a.patient_id._id.toString() === requestedPatientId,
      );
      if (found) {
        selectedAccess = found;
      }
    }

    const patient = await Patient.findById(selectedAccess.patient_id._id);
    if (!patient) {
      return res
        .status(404)
        .json({ error: "Selected linked patient not found." });
    }

    // Gather read-only data
    const MedicineLog = require("../models/MedicineLog");
    const VitalLog = require("../models/VitalLog");
    const Alert = require("../models/Alert");
    const Medication = require("../models/Medication");
    const { buildMergedMeds } = require("./users/medicines");

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [
      logs,
      latestVital,
      recentAlerts,
      medicationsRaw,
      vitalsHistory,
      todayMedicineLog,
      allAlerts,
      aiPrediction,
      companionInsights,
      riskTimeline,
    ] = await Promise.all([
      MedicineLog.find({
        patient_id: patient._id,
        date: { $gte: weekAgo },
      }).lean(),
      VitalLog.findOne({ patient_id: patient._id }).sort({ date: -1 }).lean(),
      Alert.find({ patient_id: patient._id, status: "open" })
        .sort({ created_at: -1 })
        .limit(5)
        .lean(),
      buildMergedMeds(patient),
      VitalLog.find({
        patient_id: patient._id,
        date: { $gte: fourteenDaysAgo },
      })
        .sort({ date: 1 })
        .lean(),
      MedicineLog.findOne({
        patient_id: patient._id,
        date: { $gte: startOfToday, $lte: endOfToday },
      }).lean(),
      Alert.find({ patient_id: patient._id })
        .populate("acknowledged_by")
        .sort({ created_at: -1 })
        .limit(10)
        .lean(),
      (async () => {
        const AIVitalPrediction = require("../models/AIVitalPrediction");
        return AIVitalPrediction.findOne({ patient_id: patient._id })
          .lean()
          .catch(() => null);
      })(),
      (async () => {
        const companionAiService = require("../services/companionAiService");
        return companionAiService
          .getOrGenerateInsights(patient._id)
          .catch(() => null);
      })(),
      (async () => {
        const RiskTransition = require("../models/RiskTransition");
        return RiskTransition.find({ patient_id: patient._id })
          .sort({ date: -1 })
          .lean();
      })(),
    ]);

    const medications = medicationsRaw.filter((m) => m.is_active !== false);

    // adherenceRate is now computed AFTER medication_schedule is built

    // 1. Medication Schedule Daily Timeline
    const medication_schedule = [];
    for (const med of medications) {
      const slots = med.times && med.times.length > 0 ? med.times : ["morning"];
      for (const slot of slots) {
        let taken = false;
        let taken_at = null;

        if (todayMedicineLog && todayMedicineLog.medicines) {
          const logEntry = todayMedicineLog.medicines.find(
            (m) =>
              m.medicine_name.toLowerCase() === med.name.toLowerCase() &&
              m.scheduled_time === slot,
          );
          if (logEntry) {
            taken = logEntry.taken;
            taken_at = logEntry.taken_at;
          }
        }

        medication_schedule.push({
          medication_id: med._id,
          name: med.name,
          dosage: med.dosage,
          route: med.route || "oral",
          scheduled_time: slot,
          taken,
          taken_at,
        });
      }
    }

    // Calculate accurate Adherence Rate for Today
    let adherenceRate = null;
    if (medication_schedule.length > 0) {
      const totalDoses = medication_schedule.length;
      const takenDoses = medication_schedule.filter((m) => m.taken).length;
      adherenceRate = Math.round((takenDoses / totalDoses) * 100);
    } else {
      adherenceRate = 0;
    }

    // 2. Refill & Low Stock alerts
    const refill_alerts = [];
    for (const med of medications) {
      if (med.refillInfo && med.refillInfo.remainingDoses !== undefined) {
        const remaining = med.refillInfo.remainingDoses;
        const threshold = med.refillInfo.alertThreshold || 5;
        if (remaining <= threshold) {
          refill_alerts.push({
            medication_id: med._id,
            name: med.name,
            remaining_doses: remaining,
            alert_threshold: threshold,
            pharmacy: med.refillInfo.pharmacy || "",
            pharmacy_phone: med.refillInfo.pharmacyPhone || "",
          });
        }
      }
    }

    // 3. Compute Weekly Adherence Trend (7 days)
    const weekly_adherence = [];
    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const start = new Date(d);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);

      const dayLogs = logs.filter((log) => {
        const logDate = new Date(log.date);
        return logDate >= start && logDate <= end;
      });

      let rate = 100;
      if (dayLogs.length > 0) {
        let totalMeds = 0;
        let takenMeds = 0;
        for (const log of dayLogs) {
          const active = (log.medicines || []).filter(
            (m) => m.is_active !== false,
          );
          totalMeds += active.length;
          takenMeds += active.filter((m) => m.taken).length;
        }
        if (totalMeds > 0) {
          rate = Math.round((takenMeds / totalMeds) * 100);
        }
      } else {
        const activeScheduled = medications.length > 0;
        rate = activeScheduled ? 0 : 100;
      }

      weekly_adherence.push({
        day: dayNames[d.getDay()],
        rate,
      });
    }

    // 4. Construct a rich, dynamic activity logs history timeline
    const activity_logs = [];

    // Add alerts (both open, acknowledged, and actioned/resolved)
    for (const alert of allAlerts) {
      let title = "Alert Triggered";
      if (alert.type === "missed_call") title = "Missed Call";
      else if (alert.type === "medicine_refusal") title = "Medicine Refused";
      else if (alert.type === "medication_modification")
        title = "Schedule Modified";
      else if (alert.type === "unresponsive_7days")
        title = "Unresponsive Alert";
      else if (alert.type === "medication_missed") title = "Schedule Missed";
      else if (alert.type === "team_lead_recommended")
        title = "Care Circle Alert";

      let statusText = "";
      let desc = alert.description || "System warning updated.";

      if (alert.status === "acknowledged") {
        const companionName = alert.acknowledged_by?.fullName || "Companion";
        statusText = " (Acknowledged)";
        desc = `${desc} - Dismissed by ${companionName}.`;
      } else if (alert.status === "resolved" || alert.status === "actioned") {
        statusText = ` (${alert.status.charAt(0).toUpperCase() + alert.status.slice(1)})`;
      }

      activity_logs.push({
        id: `alert-${alert._id}`,
        title: `${title}${statusText}`,
        desc: desc,
        date: alert.acknowledged_at || alert.created_at || new Date(),
        category: "alert",
        status: alert.status,
      });
    }

    // Add vital logs
    for (const vital of vitalsHistory) {
      let details = [];
      if (vital.blood_pressure)
        details.push(
          `BP: ${vital.blood_pressure.systolic}/${vital.blood_pressure.diastolic} mmHg`,
        );
      if (vital.heart_rate) details.push(`HR: ${vital.heart_rate} bpm`);
      if (vital.oxygen_saturation)
        details.push(`SpO2: ${vital.oxygen_saturation}%`);
      if (vital.hydration) details.push(`Hydration: ${vital.hydration} oz`);

      activity_logs.push({
        id: `vital-${vital._id}`,
        title: "Vitals Recorded",
        desc: details.join(", ") || "Vital stats logged.",
        date: vital.date || vital.created_at || new Date(),
        category: "vital",
      });
    }

    // Add medicine logs
    for (const medLog of logs) {
      if (medLog.medicines && medLog.medicines.length > 0) {
        const takenCount = medLog.medicines.filter((m) => m.taken).length;
        const totalCount = medLog.medicines.length;
        const percent =
          totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 100;

        let badge = "Success";
        let title = "Adherence Met";

        if (percent === 0) {
          badge = "Poor Adherence";
          title = "Adherence Missed";
        } else if (percent < 50) {
          badge = "Poor Adherence";
          title = "Adherence Poor";
        } else if (percent < 100) {
          badge = "Warning";
          title = "Adherence Partial";
        }

        activity_logs.push({
          id: `med-${medLog._id}`,
          title: title,
          desc: `${patient.name.split(" ")[0]} completed ${takenCount}/${totalCount} (${percent}%) of doses for the day.`,
          date: medLog.date || new Date(),
          category: "medicine",
          badge: badge,
        });
      }
    }

    // Sort descending by date and limit to top 8 items
    activity_logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    const final_activity_logs = activity_logs.slice(0, 8);

    // Log the activity
    await logEvent(
      req.user.id,
      "companion_viewed_dashboard",
      "profile",
      req.profile._id,
      req,
      { patientId: patient._id },
    );

    const {
      getCachedHealthState,
    } = require("../services/patientHealthStateService");
    let healthState = await getCachedHealthState(patient);

    // Fallback: if recomputation failed (returned null), build a minimal state
    // from legacy fields so the endpoint remains functional
    if (!healthState) {
      const medSchedule = medication_schedule || [];
      const totalMeds = medSchedule.length;
      const takenMeds = medSchedule.filter((m) => m.taken).length;
      healthState = {
        score: patient.healthScoreCache ?? 82,
        grade: "B",
        label: "Good",
        color: "#4CAF50",
        mood: { today: null, trend: "stable" },
        adherence: {
          today: totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) : 0,
          streak:
            patient.gamification?.current_streak ??
            patient.gamification?.streak ??
            0,
        },
        vitals: { status: "stable", bp: "normal", hr: "normal" },
        coach: {
          primary_focus: "adherence",
          insight: "Keep up with your daily medications.",
          suggested_question: "How can I improve medication consistency?",
          confidence: "low",
          generated_at: new Date().toISOString(),
        },
        goals: {
          current: "Reach Score 85",
          progress: patient.healthScoreCache ?? 82,
          target: 85,
        },
        achievements: {
          unlocked: [],
          next: {
            id: "streak_7",
            progress: 0,
            target: 7,
            label: "7 Day Streak",
          },
        },
      };
    }

    res.json({
      patient: {
        id: patient._id,
        name: patient.name,
        phone: patient.phone || "",
        avatar_url: patient.avatar_url,
        health_score: healthState.score,
        adherence_rate: healthState.adherence.today,
        current_streak: healthState.adherence.streak,
        trusted_contacts: patient.trusted_contacts || [],
        patient_health_state: healthState,
      },
      patient_health_state: healthState,
      latest_vital: latestVital,
      recent_alerts: recentAlerts,
      medication_schedule,
      vitals_history: vitalsHistory,
      refill_alerts,
      weekly_adherence,
      activity_logs: final_activity_logs,
      linked_patients: accesses
        .filter((a) => a.patient_id)
        .map((a) => {
          const linkedState = a.patient_id.patient_health_state || {};
          return {
            id: a.patient_id._id,
            name: a.patient_id.name,
            phone: a.patient_id.phone || "",
            avatar_url: a.patient_id.avatar_url,
            health_score:
              linkedState.score ?? a.patient_id.healthScoreCache ?? 82,
            current_streak:
              linkedState.adherence?.streak ??
              a.patient_id.gamification?.current_streak ??
              0,
          };
        }),
      ai_predictions: aiPrediction,
      companion_insights: companionInsights,
      risk_timeline: riskTimeline,
    });
  } catch (err) {
    logger.error("Companion patient status error", {
      error: err.message,
      profileId: req.user?.id,
    });
    res.status(500).json({ error: "Failed to load patient status." });
  }
});

/**
 * GET /api/companion/linked-patients
 * Lightweight endpoint to get basic details of linked patients.
 */
router.get("/linked-patients", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    const accesses = await CompanionAccess.find({
      companion_id: req.profile._id,
      is_active: true,
      status: "accepted",
    }).populate(
      "patient_id",
      "name email phone avatar_url healthScoreCache gamification risk_level patient_health_state",
    );

    const patientIds = accesses
      .filter((a) => a.patient_id)
      .map((a) => a.patient_id._id);
    const CompanionAiInsight = require("../models/CompanionAiInsight");
    const insights = await CompanionAiInsight.find({
      patient_id: { $in: patientIds },
    }).lean();
    const insightsByPatient = {};
    for (const ins of insights) {
      insightsByPatient[ins.patient_id.toString()] = ins;
    }

    const linked_patients = accesses
      .filter((a) => a.patient_id)
      .map((a) => {
        const patient = a.patient_id;
        const score =
          patient.patient_health_state?.score ?? patient.healthScoreCache ?? 82;
        const streak =
          patient.patient_health_state?.adherence?.streak ??
          patient.gamification?.current_streak ??
          patient.gamification?.streak ??
          0;
        const risk = patient.risk_level ?? "low";
        const ins = insightsByPatient[patient._id.toString()] || {};
        const visibilityLabel = ins.visibility_label ?? "Low";
        const visibilityScore = ins.visibility_score ?? 0;

        return {
          id: patient._id,
          name: patient.name,
          phone: patient.phone || "",
          avatar_url: patient.avatar_url,
          avatarUrl: patient.avatar_url,
          health_score: score,
          healthScore: score,
          current_streak: streak,
          streak: streak,
          risk_level: risk,
          riskLevel: risk,
          visibility_label: visibilityLabel,
          visibility_score: visibilityScore,
        };
      });

    res.json({ linked_patients });
  } catch (err) {
    logger.error("Companion linked patients error", {
      error: err.message,
      profileId: req.user?.id,
    });
    res.status(500).json({ error: "Failed to load linked patients." });
  }
});

/**
 * POST /api/companion/nudge
 * Nudge a patient to take their medication.
 */
router.post("/nudge", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    let patientId = req.body.patientId;

    // If no patientId provided, look up companion's first linked patient
    if (!patientId) {
      const firstAccess = await CompanionAccess.findOne({
        companion_id: req.profile._id,
        is_active: true,
        status: "accepted",
      });
      if (!firstAccess) {
        return res
          .status(400)
          .json({ error: "No linked patients found to nudge." });
      }
      patientId = firstAccess.patient_id;
    }

    // Validate access relationship
    const access = await CompanionAccess.findOne({
      companion_id: req.profile._id,
      patient_id: patientId,
      is_active: true,
      status: "accepted",
    });

    if (!access) {
      return res
        .status(403)
        .json({ error: "You do not have active access to this patient." });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }

    const companionName = req.profile.fullName || "Your family caregiver";

    // 1. Create in-app notification for patient
    await Notification.create({
      patient_id: patient._id,
      type: "reminders",
      title: "Reminded by family ❤️",
      message: `${companionName} sent you a gentle reminder to check your medications.`,
      target_screen: "Medicines",
    });

    // 2. Send push notification if token exists
    if (patient.expo_push_token) {
      await PushNotificationService.sendPush(
        patient.expo_push_token,
        "Reminded by family ❤️",
        `${companionName} sent you a gentle reminder to check your medications.`,
        { screen: "Medicines", type: "companion_nudge" },
      );
    }

    // 3. Log event
    await logEvent(
      req.user.id,
      "companion_sent_nudge",
      "profile",
      req.profile._id,
      req,
      { patientId: patient._id },
    );

    res.json({ success: true, message: "Nudge sent successfully." });
  } catch (err) {
    logger.error("Companion nudge error", { error: err.message });
    res.status(500).json({ error: "Failed to send nudge." });
  }
});

/**
 * POST /api/companion/request-bp
 * Request a blood pressure reading from a patient.
 */
router.post("/request-bp", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    let patientId = req.body.patientId;

    // If no patientId provided, look up companion's first linked patient
    if (!patientId) {
      const firstAccess = await CompanionAccess.findOne({
        companion_id: req.profile._id,
        is_active: true,
        status: "accepted",
      });
      if (!firstAccess) {
        return res.status(400).json({ error: "No linked patients found." });
      }
      patientId = firstAccess.patient_id;
    }

    // Validate access relationship
    const access = await CompanionAccess.findOne({
      companion_id: req.profile._id,
      patient_id: patientId,
      is_active: true,
      status: "accepted",
    });

    if (!access) {
      return res
        .status(403)
        .json({ error: "You do not have active access to this patient." });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }

    const companionName = req.profile.fullName || "Your family caregiver";

    // 1. Create in-app notification for patient
    await Notification.create({
      patient_id: patient._id,
      type: "reminders",
      title: "Blood Pressure Request 🩺",
      message: `${companionName} wants to know your latest Blood Pressure. Please take a reading and record it!`,
      target_screen: "HealthProfile",
    });

    // 2. Send push notification if token exists
    if (patient.expo_push_token) {
      await PushNotificationService.sendPush(
        patient.expo_push_token,
        "Blood Pressure Request 🩺",
        `${companionName} wants to know your latest Blood Pressure. Please take a reading and record it!`,
        { screen: "HealthProfile", type: "companion_request_bp" },
      );
    }

    // 3. Log event
    await logEvent(
      req.user.id,
      "companion_requested_bp",
      "profile",
      req.profile._id,
      req,
      { patientId: patient._id },
    );

    res.json({
      success: true,
      message: "Blood Pressure request sent successfully.",
    });
  } catch (err) {
    logger.error("Companion request BP error", { error: err.message });
    res.status(500).json({ error: "Failed to request Blood Pressure." });
  }
});

/**
 * POST /api/companion/alerts/:id/acknowledge
 * Acknowledge an alert to dismiss it from the dashboard.
 */
router.post("/alerts/:id/acknowledge", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    const Alert = require("../models/Alert");

    await Alert.updateOne(
      { _id: req.params.id },
      {
        $set: {
          status: "acknowledged",
          acknowledged_by: req.profile._id,
          acknowledged_at: new Date(),
        },
      },
    );

    await logEvent(
      req.user.id,
      "companion_acknowledged_alert",
      "profile",
      req.profile._id,
      req,
      { alertId: req.params.id },
    );

    res.json({ success: true });
  } catch (err) {
    logger.error("Companion acknowledge alert error", { error: err.message });
    res.status(500).json({ error: "Failed to acknowledge alert." });
  }
});

/**
 * POST /api/companion/patients/:patientId/invite-code
 * Allows an active Caregiver Companion to generate a 24-hour invite code for their patient.
 */
router.post(
  "/patients/:patientId/invite-code",
  authenticate,
  async (req, res) => {
    try {
      const { patientId } = req.params;

      if (req.auth?.userType !== "Companion") {
        return res.status(403).json({
          error: "Only caregiver companions can access this endpoint.",
        });
      }

      // Verify active CompanionAccess relation
      const CompanionAccess = require("../models/CompanionAccess");
      const access = await CompanionAccess.findOne({
        companion_id: req.auth.userId,
        patient_id: patientId,
        is_active: true,
        status: "accepted",
      });

      if (!access) {
        return res.status(403).json({
          error:
            "You do not have active care circle permission for this patient.",
        });
      }

      // Generate a clean 6-char alphanumeric code (excluding confusing chars like 0/O, 1/I)
      const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      let code = "";
      let isUnique = false;

      while (!isUnique) {
        code = "";
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await Patient.findOne({
          invite_code: code,
          invite_code_expires_at: { $gt: new Date() },
        });
        if (!existing) isUnique = true;
      }

      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

      await Patient.updateOne(
        { _id: patientId },
        { $set: { invite_code: code, invite_code_expires_at: expiresAt } },
      );

      res.json({ success: true, invite_code: code, expires_at: expiresAt });
    } catch (error) {
      logger.error("Companion generate invite code error", {
        error: error.message,
      });
      res
        .status(500)
        .json({ error: "Failed to generate invite code from caregiver." });
    }
  },
);

/**
 * GET /api/companion/interventions
 * Returns generated pending recommendations and a feed of completed interventions.
 */
router.get("/interventions", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    let patientId = req.query.patientId;
    if (!patientId) {
      const firstAccess = await CompanionAccess.findOne({
        companion_id: req.profile._id,
        is_active: true,
        status: "accepted",
      });
      if (!firstAccess) {
        return res.status(400).json({ error: "No linked patients found." });
      }
      patientId = firstAccess.patient_id;
    }

    // Validate access relationship
    const access = await CompanionAccess.findOne({
      companion_id: req.profile._id,
      patient_id: patientId,
      is_active: true,
      status: "accepted",
    });

    if (!access) {
      return res
        .status(403)
        .json({ error: "You do not have active access to this patient." });
    }

    const {
      generateInterventions,
    } = require("../services/interventionEngineService");
    const Intervention = require("../models/Intervention");

    const activeInterventions = await generateInterventions(patientId);
    const completedFeed = await Intervention.find({
      patient_id: patientId,
      status: "completed",
      source: "companion",
    })
      .sort({ completed_at: -1 })
      .limit(20)
      .lean();

    res.json({
      active_interventions: activeInterventions,
      completed_feed: completedFeed,
    });
  } catch (err) {
    logger.error("Companion get interventions error", { error: err.message });
    res.status(500).json({ error: "Failed to get interventions." });
  }
});

/**
 * POST /api/companion/interventions
 * Marks an intervention completed and triggers patient actions (push/notifications).
 */
router.post("/interventions", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    const { interventionId } = req.body;
    if (!interventionId) {
      return res.status(400).json({ error: "Intervention ID is required." });
    }

    const {
      completeIntervention,
    } = require("../services/interventionEngineService");
    const Intervention = require("../models/Intervention");

    const intervention = await Intervention.findById(interventionId);
    if (!intervention) {
      return res.status(404).json({ error: "Intervention not found." });
    }

    // Validate access relationship
    const access = await CompanionAccess.findOne({
      companion_id: req.profile._id,
      patient_id: intervention.patient_id,
      is_active: true,
      status: "accepted",
    });

    if (!access) {
      return res
        .status(403)
        .json({ error: "You do not have active access to this patient." });
    }

    const completed = await completeIntervention(
      interventionId,
      req.profile._id,
    );
    if (!completed) {
      return res
        .status(500)
        .json({ error: "Failed to complete intervention." });
    }

    // Trigger notifications/actions based on type
    const patient = await Patient.findById(intervention.patient_id);
    if (patient) {
      const companionName = req.profile.fullName || "Your family caregiver";
      if (intervention.type === "medication_reminder") {
        await Notification.create({
          patient_id: patient._id,
          type: "reminders",
          title: "Reminded by family ❤️",
          message: `${companionName} sent you a gentle reminder to check your medications.`,
          target_screen: "Medicines",
        });
        if (patient.expo_push_token) {
          await PushNotificationService.sendPush(
            patient.expo_push_token,
            "Reminded by family ❤️",
            `${companionName} sent you a gentle reminder to check your medications.`,
            { screen: "Medicines", type: "companion_nudge" },
          ).catch((err) => logger.error("Push failed", { error: err.message }));
        }
      } else if (intervention.type === "bp_request") {
        await Notification.create({
          patient_id: patient._id,
          type: "reminders",
          title: "Blood Pressure Request 🩺",
          message: `${companionName} wants to know your latest Blood Pressure. Please take a reading and record it!`,
          target_screen: "HealthProfile",
        });
        if (patient.expo_push_token) {
          await PushNotificationService.sendPush(
            patient.expo_push_token,
            "Blood Pressure Request 🩺",
            `${companionName} wants to know your latest Blood Pressure. Please take a reading and record it!`,
            { screen: "HealthProfile", type: "companion_request_bp" },
          ).catch((err) => logger.error("Push failed", { error: err.message }));
        }
      } else if (intervention.type === "checkin_call") {
        // Notify the caller (caretaker) about the completed wellness call to prevent double-calling
        if (patient.assigned_caller_id) {
          try {
            const Caller = require("../models/Caller");
            const caller = await Caller.findById(patient.assigned_caller_id);
            if (caller) {
              // Create Alert in DB for caller
              const Alert = require("../models/Alert");
              await Alert.create({
                type: "general",
                patient_id: patient._id,
                caller_id: caller._id,
                organization_id: patient.organization_id,
                description: `Companion ${companionName} completed a wellness check-in call with patient ${patient.name}.`,
                status: "open",
                auto_generated: false,
              });

              // Send push notification to caller
              const callerToken =
                caller.expo_push_token ||
                (await Patient.findOne({ supabase_uid: caller.supabase_uid }))
                  ?.expo_push_token;
              if (callerToken) {
                await PushNotificationService.sendPush(
                  callerToken,
                  "📞 Wellness Call Completed",
                  `Companion ${companionName} completed a check-in call with patient ${patient.name}.`,
                  {
                    screen: "PatientDetail",
                    type: "companion_checkin_call",
                    patient_id: patient._id.toString(),
                  },
                ).catch((err) =>
                  logger.error("Caller push failed", { error: err.message }),
                );
              }
            }
          } catch (err) {
            logger.error("Failed to notify caller of checkin call", {
              error: err.message,
            });
          }
        }
      } else if (intervention.type === "escalation_contact") {
        // 1. Notify the patient
        await Notification.create({
          patient_id: patient._id,
          type: "alert",
          title: "Emergency Coordinator Contacted 🚨",
          message: `Your family caregiver ${companionName} has contacted your emergency escalation coordinator. Please stay calm and check in.`,
          target_screen: "PatientHome",
        });
        if (patient.expo_push_token) {
          await PushNotificationService.sendPush(
            patient.expo_push_token,
            "Emergency Coordinator Contacted 🚨",
            `Your family caregiver ${companionName} has contacted your emergency escalation coordinator. Please stay calm and check in.`,
            { screen: "PatientHome", type: "companion_escalation_contact" },
          ).catch((err) =>
            logger.error("Patient escalation push failed", {
              error: err.message,
            }),
          );
        }

        // 2. Notify the caller (caretaker)
        if (patient.assigned_caller_id) {
          try {
            const Caller = require("../models/Caller");
            const caller = await Caller.findById(patient.assigned_caller_id);
            if (caller) {
              // Create Alert in DB for caller
              const Alert = require("../models/Alert");
              await Alert.create({
                type: "general",
                patient_id: patient._id,
                caller_id: caller._id,
                organization_id: patient.organization_id,
                description: `Critical: Companion ${companionName} contacted the emergency coordinator for patient ${patient.name}.`,
                status: "open",
                auto_generated: false,
              });

              // Send push notification to caller
              const callerToken =
                caller.expo_push_token ||
                (await Patient.findOne({ supabase_uid: caller.supabase_uid }))
                  ?.expo_push_token;
              if (callerToken) {
                await PushNotificationService.sendPush(
                  callerToken,
                  "🚨 Emergency Coordinator Contacted",
                  `Companion ${companionName} contacted the emergency coordinator for patient ${patient.name}. Follow up immediately.`,
                  {
                    screen: "PatientDetail",
                    type: "companion_escalation_contact",
                    patient_id: patient._id.toString(),
                  },
                ).catch((err) =>
                  logger.error("Caller escalation push failed", {
                    error: err.message,
                  }),
                );
              }
            }
          } catch (err) {
            logger.error("Failed to notify caller of escalation contact", {
              error: err.message,
            });
          }
        }
      }
    }

    res.json({ success: true, intervention: completed });
  } catch (err) {
    logger.error("Companion complete intervention error", {
      error: err.message,
    });
    res.status(500).json({ error: "Failed to complete intervention." });
  }
});

/**
 * GET /api/companion/analytics-extended
 * Returns extended predictive metrics and caregiver acceptance/engagement rates.
 */
router.get("/analytics-extended", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    let patientId = req.query.patientId;
    if (!patientId) {
      const firstAccess = await CompanionAccess.findOne({
        companion_id: req.profile._id,
        is_active: true,
        status: "accepted",
      });
      if (!firstAccess) {
        return res.status(400).json({ error: "No linked patients found." });
      }
      patientId = firstAccess.patient_id;
    }

    // Validate access relationship
    const access = await CompanionAccess.findOne({
      companion_id: req.profile._id,
      patient_id: patientId,
      is_active: true,
      status: "accepted",
    });

    if (!access) {
      return res
        .status(403)
        .json({ error: "You do not have active access to this patient." });
    }

    const { getOrGenerateInsights } = require("../services/companionAiService");
    const Intervention = require("../models/Intervention");

    const insights = await getOrGenerateInsights(patientId);

    // 1. Acceptance rate
    const totalSuggested = await Intervention.countDocuments({
      patient_id: patientId,
      status: { $in: ["generated", "completed"] },
      source: "system",
    });
    const totalCompleted = await Intervention.countDocuments({
      patient_id: patientId,
      status: "completed",
      source: "system",
    });
    const acceptanceRate =
      totalSuggested > 0
        ? Math.round((totalCompleted / totalSuggested) * 100)
        : 100;

    // 2. Engagement rate
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeInterventions = await Intervention.find({
      patient_id: patientId,
      status: "completed",
      completed_at: { $gte: sevenDaysAgo },
    })
      .select("completed_at")
      .lean();

    const uniqueDays = new Set(
      activeInterventions.map((item) =>
        new Date(item.completed_at).toDateString(),
      ),
    ).size;
    const engagementRate =
      uniqueDays > 0 ? Math.round((uniqueDays / 7) * 100) : 85;

    // 3. Predictive health metrics
    const consistency = insights?.predictive_health?.consistency?.score ?? 92;
    const momentum = insights?.predictive_health?.momentum?.score ?? 12;
    const confidence = insights?.predictive_health?.recovery?.confidence ?? 89;
    const reliability = insights?.confidence_score ?? 95;

    res.json({
      acceptance_rate: acceptanceRate,
      engagement_rate: engagementRate,
      consistency_score: consistency,
      momentum_score: momentum,
      recovery_confidence: confidence,
      forecast_reliability: reliability,
    });
  } catch (err) {
    logger.error("Companion analytics extended error", { error: err.message });
    res.status(500).json({ error: "Failed to load extended analytics." });
  }
});

module.exports = router;

/**
 * POST /api/companion/link-patient
 * Link an authenticated companion to a patient using an invite code.
 */
router.post("/link-patient", authenticate, async (req, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) {
      return res.status(400).json({ error: "Invite code is required." });
    }

    if (
      req.auth?.userType !== "Companion" &&
      req.profile?.role !== "companion"
    ) {
      return res
        .status(403)
        .json({ error: "Only companions can link patients." });
    }

    const patient = await Patient.findOne({
      invite_code: invite_code.toUpperCase(),
      invite_code_expires_at: { $gt: new Date() },
    }).select("+invite_code");

    if (!patient) {
      return res.status(400).json({ error: "Invalid or expired invite code." });
    }

    const profileId = req.profile?._id || req.auth?.userId;
    const profile = await Companion.findById(profileId);
    if (!profile) {
      return res.status(404).json({ error: "Companion profile not found." });
    }

    // Link Profile to Patient
    const existingAccess = await CompanionAccess.findOne({
      companion_id: profileId,
      patient_id: patient._id,
    });
    if (existingAccess) {
      if (existingAccess.is_active && existingAccess.status === "accepted") {
        return res
          .status(400)
          .json({ error: "You are already linked to this patient." });
      } else {
        existingAccess.is_active = true;
        existingAccess.status = "accepted";
        existingAccess.revoked_at = undefined;
        existingAccess.revoked_by = undefined;
        await existingAccess.save();
      }
    } else {
      await CompanionAccess.create({
        companion_id: profileId,
        patient_id: patient._id,
        relationship_type: "Other",
        access_level: "caregiver",
        permissions: ["read_only", "alerts"],
        status: "accepted",
        is_active: true,
        joined_at: new Date(),
        created_by: profileId,
      });
    }

    // Add to trusted contacts
    const hasContact = patient.trusted_contacts.some(
      (c) => c.email.toLowerCase() === profile.email.toLowerCase(),
    );
    if (!hasContact) {
      patient.trusted_contacts.push({
        name: profile.fullName,
        phone: profile.phone || "N/A",
        relation: "Family",
        email: profile.email,
        can_view_data: true,
        is_primary: false,
        is_emergency: false,
        permissions: ["read_only"],
      });
    }

    // Invalidate invite code
    patient.invite_code = undefined;
    patient.invite_code_expires_at = undefined;
    await patient.save();

    res.json({ message: "Successfully linked patient to your care circle." });
  } catch (err) {
    logger.error("Link patient error", { error: err.message });
    res.status(500).json({ error: "Failed to link patient." });
  }
});

/**
 * PUT /api/companion/profile
 * Update companion profile details, including compliance terms.
 */
router.put("/profile", authenticate, async (req, res) => {
  try {
    if (!req.profile || req.profile.role !== "companion") {
      return res.status(403).json({ error: "Access denied." });
    }

    const {
      fullName,
      phone,
      acceptedTermsVersion,
      acceptedPrivacyVersion,
      acceptedAt,
    } = req.body;
    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (phone !== undefined) updates.phone = phone;
    if (acceptedTermsVersion !== undefined)
      updates.acceptedTermsVersion = acceptedTermsVersion;
    if (acceptedPrivacyVersion !== undefined)
      updates.acceptedPrivacyVersion = acceptedPrivacyVersion;
    if (acceptedAt !== undefined) updates.acceptedAt = acceptedAt;

    await Companion.updateOne({ _id: req.profile._id }, { $set: updates });
    const updated = await Companion.findById(req.profile._id);

    res.json({ message: "Profile updated successfully", profile: updated });
  } catch (err) {
    logger.error("Update companion profile error", { error: err.message });
    res.status(500).json({ error: "Failed to update profile." });
  }
});

/**
 * POST /api/companion/patient-status/refresh-insights
 * Force regenerates companion insights for a patient.
 * Rate-limited (debounced) to once every 5 minutes using the cached generated_at timestamp.
 */
router.post(
  "/patient-status/refresh-insights",
  authenticate,
  async (req, res) => {
    try {
      if (!req.profile || req.profile.role !== "companion") {
        return res.status(403).json({ error: "Access denied." });
      }

      const patientId = req.body.patientId;
      if (!patientId) {
        return res.status(400).json({ error: "Patient ID is required." });
      }

      // Validate active care circle permission
      const CompanionAccess = require("../models/CompanionAccess");
      const access = await CompanionAccess.findOne({
        companion_id: req.profile._id,
        patient_id: patientId,
        is_active: true,
        status: "accepted",
      });

      if (!access) {
        return res
          .status(403)
          .json({ error: "You do not have active access to this patient." });
      }

      // Check 5-minute manual refresh rate limit
      const CompanionAiInsight = require("../models/CompanionAiInsight");
      const cached = await CompanionAiInsight.findOne({
        patient_id: patientId,
      });

      if (cached && cached.generated_at) {
        const ageMs = Date.now() - new Date(cached.generated_at).getTime();
        if (ageMs < 5 * 60 * 1000) {
          return res.status(429).json({
            error: "Insights can only be refreshed once every 5 minutes.",
            retryAfterSeconds: Math.ceil((5 * 60 * 1000 - ageMs) / 1000),
          });
        }
      }

      // Synchronously generate fresh insights
      const companionAiService = require("../services/companionAiService");
      const freshInsights = await companionAiService.generateAndCacheInsights(
        patientId,
        true,
      );

      if (!freshInsights) {
        return res
          .status(500)
          .json({ error: "Failed to regenerate insights." });
      }

      res.json({ success: true, companion_insights: freshInsights });
    } catch (err) {
      logger.error("Companion refresh-insights error", { error: err.message });
      res.status(500).json({ error: "Failed to refresh insights." });
    }
  },
);

module.exports = router;
