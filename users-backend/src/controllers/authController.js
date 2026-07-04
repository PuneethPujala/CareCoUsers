const Caller = require("../models/Caller");
const Profile = require("../models/Profile");
const Patient = require("../models/Patient");
const authService = require("../services/authService");
const { logEvent } = require("../services/auditService");

function sendError(res, err) {
  const status = err.status || 500;
  const payload = {
    error: err.message || "Request failed",
    ...(err.code && { code: err.code }),
    ...(err.details && { details: err.details }),
    ...(err.hint && { hint: err.hint }),
    ...(err.lockedUntil && { lockedUntil: err.lockedUntil }),
  };
  if (status >= 500 && process.env.NODE_ENV !== "development") {
    payload.error = "An unexpected error occurred";
    delete payload.details;
  }
  return res.status(status).json(payload);
}

async function register(req, res) {
  try {
    const data = await authService.registerPatient(req.body, req);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Registration error:", err);
    // Surface a more specific message for common infra errors
    if (
      err.name === "MongooseServerSelectionError" ||
      err.name === "MongoServerError"
    ) {
      return res.status(503).json({
        error:
          "Our servers are temporarily busy. Please try again in a moment.",
        code: "SERVICE_UNAVAILABLE",
      });
    }
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      return res.status(504).json({
        error: "The request timed out. Please try again.",
        code: "TIMEOUT",
      });
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res
        .status(400)
        .json({ error: messages.join(", "), code: "VALIDATION_ERROR" });
    }
    res.status(500).json({
      error: "Registration failed. Please try again or contact support.",
      code: "REGISTRATION_FAILED",
    });
  }
}

async function login(req, res) {
  try {
    const data = await authService.login(req.body, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Login error:", err);
    // Surface a more specific message for common infra errors
    if (
      err.name === "MongooseServerSelectionError" ||
      err.name === "MongoServerError" ||
      err.name === "MongooseError"
    ) {
      return res.status(503).json({
        error:
          "Our servers are temporarily busy. Please try again in a moment.",
        code: "SERVICE_UNAVAILABLE",
      });
    }
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      return res.status(504).json({
        error: "The request timed out. Please try again.",
        code: "TIMEOUT",
      });
    }
    console.error("CRITICAL LOGIN FAILURE:", err.stack);
    res.status(500).json({
      error: "Login failed. Please try again or contact support.",
      code: "LOGIN_FAILED",
    });
  }
}

async function logout(req, res) {
  try {
    const subject =
      req.auth?.subject ||
      req.profile?.supabaseUid ||
      req.profile?.supabase_uid;
    const userId = req.profile._id;
    const userType =
      req.profile.role === "patient"
        ? "Patient"
        : req.profile.role === "companion"
          ? "Companion"
          : "Profile";
    await authService.logout(subject, userId, userType, req);
    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
}

async function deleteMe(req, res) {
  try {
    const isPatient = req.profile.role === "patient";
    const userId = req.profile._id;
    const subject =
      req.auth?.subject ||
      req.profile?.supabaseUid ||
      req.profile?.supabase_uid;

    if (isPatient) {
      const CallLog = require("../models/CallLog");
      const MedicineLog = require("../models/MedicineLog");
      const VitalLog = require("../models/VitalLog");
      const Notification = require("../models/Notification");
      const RefreshToken = require("../models/RefreshToken");
      const AIVitalPrediction = require("../models/AIVitalPrediction");
      const Medication = require("../models/Medication");
      const Alert = require("../models/Alert");
      const SleepLog = require("../models/SleepLog");
      const PatientHealthStateHistory = require("../models/PatientHealthStateHistory");
      const AchievementEvent = require("../models/AchievementEvent");
      const AIChatLog = require("../models/AIChatLog");
      const AIChatSession = require("../models/AIChatSession");
      const CallSession = require("../models/CallSession");
      const CarePlanHistory = require("../models/CarePlanHistory");
      const CompanionAccess = require("../models/CompanionAccess");
      const CompanionAiInsight = require("../models/CompanionAiInsight");
      const CompanionAiInsightHistory = require("../models/CompanionAiInsightHistory");
      const Intervention = require("../models/Intervention");
      const TempMedication = require("../models/TempMedication");
      const WeeklySummary = require("../models/WeeklySummary");

      // ── Decre Organization Count ──
      if (req.profile.organization_id) {
        const Organization = require("../models/Organization");
        await Organization.findByIdAndUpdate(req.profile.organization_id, {
          $inc: { "counts.patients": -1 },
        }).catch((e) =>
          console.warn("Failed to decrement org count:", e.message),
        );
      }

      // ── Purge Linked Profile if exists ──
      if (req.profile.profile_id) {
        await Profile.findByIdAndDelete(req.profile.profile_id).catch((e) =>
          console.warn("Failed to delete linked profile:", e.message),
        );
      }

      // ── Purge all associated records ──
      await Promise.all([
        CallLog.deleteMany({ patient_id: userId }),
        MedicineLog.deleteMany({ patient_id: userId }),
        VitalLog.deleteMany({ patient_id: userId }),
        Notification.deleteMany({ patient_id: userId }),
        RefreshToken.deleteMany({ userId, userType: "Patient" }),
        AIVitalPrediction.deleteMany({ patient_id: userId }),
        Medication.deleteMany({ patientId: userId }),
        Alert.deleteMany({ patient_id: userId }),
        SleepLog.deleteMany({ patient_id: userId }),
        PatientHealthStateHistory.deleteMany({ patient_id: userId }),
        AchievementEvent.deleteMany({ patient_id: userId }),
        AIChatLog.deleteMany({ patient_id: userId }),
        AIChatSession.deleteMany({ patient_id: userId }),
        CallSession.deleteMany({ patientId: userId }),
        CarePlanHistory.deleteMany({ patient_id: userId }),
        CompanionAccess.deleteMany({ patient_id: userId }),
        CompanionAiInsight.deleteMany({ patient_id: userId }),
        CompanionAiInsightHistory.deleteMany({ patient_id: userId }),
        Intervention.deleteMany({ patient_id: userId }),
        TempMedication.deleteMany({ patientId: userId }),
        WeeklySummary.deleteMany({ patient_id: userId }),
        // Remove patient from any caller's assigned patient_ids list
        Caller.updateMany(
          { patient_ids: userId },
          { $pull: { patient_ids: userId } },
        ),
      ]);

      // Delete the patient record itself — frees email & phone for re-registration
      await Patient.findByIdAndDelete(userId);

      await logEvent(subject, "account_hard_deleted", "patient", userId, req, {
        permanent: true,
        purgedCollections: [
          "CallLog",
          "MedicineLog",
          "VitalLog",
          "Notification",
          "RefreshToken",
          "AIVitalPrediction",
          "Medication",
          "Alert",
          "Caller",
          "Patient",
          "SleepLog",
          "PatientHealthStateHistory",
          "AchievementEvent",
          "AIChatLog",
          "AIChatSession",
          "CallSession",
          "CarePlanHistory",
          "CompanionAccess",
          "CompanionAiInsight",
          "CompanionAiInsightHistory",
          "Intervention",
          "TempMedication",
          "WeeklySummary",
        ],
      });
    } else if (req.profile.role === "companion") {
      // For Family Companions
      const RefreshToken = require("../models/RefreshToken");
      const Companion = require("../models/Companion");

      await Companion.findByIdAndDelete(userId);
      await RefreshToken.deleteMany({ userId, userType: "Companion" });
      await logEvent(
        subject,
        "account_hard_deleted",
        "companion",
        userId,
        req,
        { permanent: true },
      );
    } else {
      // For Staff/Admin profiles
      const RefreshToken = require("../models/RefreshToken");

      // Decrement Org Count for Staff
      if (req.profile.organizationId) {
        const Organization = require("../models/Organization");
        const role = req.profile.role;
        const incField =
          role === "caller"
            ? "counts.callers"
            : role === "care_manager"
              ? "counts.managers"
              : null;
        if (incField) {
          await Organization.findByIdAndUpdate(req.profile.organizationId, {
            $inc: { [incField]: -1 },
          }).catch((e) =>
            console.warn("Failed to decrement staff org count:", e.message),
          );
        }
      }

      await Profile.findByIdAndDelete(userId);
      await RefreshToken.deleteMany({ userId, userType: "Profile" });
      await logEvent(subject, "account_hard_deleted", "profile", userId, req, {
        permanent: true,
      });
    }

    // Revoke all sessions LAST (so the auth validation for the above operations succeeds)
    const userType =
      req.profile.role === "patient"
        ? "Patient"
        : req.profile.role === "companion"
          ? "Companion"
          : "Profile";
    await authService.logout(subject, userId, userType, req);

    res.json({
      message:
        "Account permanently deleted. You may register again with the same email.",
    });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
}

async function deactivateMe(req, res) {
  try {
    const isPatient = req.profile.role === "patient";
    const userId = req.profile._id;
    const subject =
      req.auth?.subject ||
      req.profile?.supabaseUid ||
      req.profile?.supabase_uid;

    if (isPatient) {
      await Patient.findByIdAndUpdate(userId, {
        is_active: false,
        deactivated_at: new Date(),
        deactivated_reason: "user_requested",
      });
      await logEvent(subject, "account_deactivated", "patient", userId, req);
    } else if (req.profile.role === "companion") {
      const Companion = require("../models/Companion");
      await Companion.findByIdAndUpdate(userId, {
        isActive: false,
      });
      await logEvent(subject, "account_deactivated", "companion", userId, req);
    } else {
      await Profile.findByIdAndUpdate(userId, {
        isActive: false,
      });
      await logEvent(subject, "account_deactivated", "profile", userId, req);
    }

    // Revoke all sessions so user is logged out
    const userType =
      req.profile.role === "patient"
        ? "Patient"
        : req.profile.role === "companion"
          ? "Companion"
          : "Profile";
    await authService.logout(subject, userId, userType, req);

    res.json({
      message:
        "Account deactivated. Your data is preserved — log in anytime to reactivate.",
    });
  } catch (err) {
    console.error("Deactivate account error:", err);
    res.status(500).json({ error: "Failed to deactivate account" });
  }
}

// SEC-FIX-16: GDPR/DPDPA Data Portability
async function exportMyData(req, res) {
  try {
    const isPatient = req.profile.role === "patient";
    const exported = { exportedAt: new Date().toISOString(), format: "JSON" };

    if (isPatient) {
      const CallLog = require("../models/CallLog");
      const MedicineLog = require("../models/MedicineLog");
      const VitalLog = require("../models/VitalLog");

      const patient = await Patient.findById(req.profile._id).lean();
      if (!patient) {
        return res.status(404).json({ error: "Patient profile not found" });
      }

      // Strip internal fields
      delete patient.passwordHash;
      delete patient.__v;

      const calls = await CallLog.find({ patientId: patient._id })
        .select("-__v")
        .lean();
      const medicines = await MedicineLog.find({ patient_id: patient._id })
        .select("-__v")
        .lean();
      const vitals = await VitalLog.find({ patient_id: patient._id })
        .select("-__v")
        .lean();

      exported.profile = patient;
      exported.callLogs = calls;
      exported.medicineLogs = medicines;
      exported.vitalLogs = vitals;
    } else {
      const profile = await Profile.findById(req.profile._id)
        .select("-passwordHash -__v -passwordHistory")
        .lean();
      exported.profile = profile;
    }

    const subject =
      req.user?.id ||
      req.profile?.supabase_uid ||
      req.profile?.supabaseUid ||
      "unknown";
    await logEvent(
      subject,
      "data_exported",
      isPatient ? "patient" : "profile",
      req.profile._id,
      req,
    );

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="caremymed-export-${Date.now()}.json"`,
    );
    res.json(exported);
  } catch (err) {
    console.error("Export data error:", err);
    res
      .status(500)
      .json({ error: "Failed to export data", details: err.message });
  }
}

async function refresh(req, res) {
  try {
    const raw = req.body.refresh_token;
    const data = await authService.refreshSession(raw, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Token refresh error:", err);
    res.status(500).json({ error: "Token refresh failed" });
  }
}

async function resetPassword(req, res) {
  try {
    const data = await authService.requestPasswordReset(req.body.email, req);
    res.json(data);
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "Password reset failed" });
  }
}

async function resetPasswordVerify(req, res) {
  try {
    const data = await authService.verifyPasswordReset(req.body, req);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Reset password verify error:", err);
    res.status(500).json({ error: "Password reset failed" });
  }
}

async function me(req, res) {
  try {
    const isPatient = req.profile.role === "patient";
    const caps = await authService.getWorkspaceCapabilities(req.profile.email);

    if (isPatient) {
      const patient = req.profile;
      // BUG-6 FIX: Load passwordHash to expose hasPassword flag (never expose the hash itself)
      const patientWithHash = await Patient.findById(patient._id).select(
        "+passwordHash",
      );
      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          email_verified: !!req.user.email_confirmed_at,
          created_at: req.user.created_at || patient.created_at,
        },
        profile: {
          id: patient._id,
          email: patient.email,
          fullName: patient.name,
          role: "patient",
          organizationId: patient.organization_id,
          phone: patient.phone,
          avatarUrl: patient.avatar_url,
          isActive: patient.is_active,
          emailVerified: patient.emailVerified,
          lastLoginAt: patient.lastLoginAt,
          subscription_status:
            patient.subscription?.status || "pending_payment",
          hasPassword: !!patientWithHash?.passwordHash,
          currentWorkspace: "patient",
          workspaces: caps.workspaces,
        },
      });
      return;
    }

    let profile;
    if (req.profile.role === "companion") {
      const Companion = require("../models/Companion");
      profile = await Companion.findById(req.profile._id).select(
        "+passwordHash",
      );
    } else {
      profile = await Profile.findById(req.profile._id)
        .select("+passwordHash")
        .populate("organizationId", "name city subscriptionPlan");
    }

    let subscriptionStatus = null;
    if (profile.role === "caller") {
      let caller = await Caller.findOne({ supabase_uid: req.user.id });

      if (!caller && req.user.email) {
        caller = await Caller.findOne({
          email: req.user.email.toLowerCase().trim(),
        });
      }

      if (caller && caller.supabase_uid !== req.user.id) {
        caller.supabase_uid = req.user.id;
        await caller.save();
      }
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        email_verified: !!req.user.email_confirmed_at,
        created_at: req.user.created_at,
      },
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
        lastLoginAt: profile.lastLoginAt,
        metadata: profile.metadata,
        mustChangePassword: profile.mustChangePassword || false,
        subscription_status: subscriptionStatus,
        hasPassword: !!profile.passwordHash,
        currentWorkspace: profile.role,
        workspaces: caps.workspaces,
      },
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to get profile" });
  }
}

async function createUser(req, res) {
  try {
    const data = await authService.createStaffUser(req.body, req, req.profile);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.warn("Create user error:", err?.message);
    if (err.code === 11000 || err.message?.includes("E11000")) {
      return res
        .status(400)
        .json({ error: "A user with this email address already exists." });
    }
    res.status(500).json({ error: "Failed to create user. Please try again." });
  }
}

async function changePassword(req, res) {
  try {
    const subject =
      req.auth?.subject || req.profile.supabaseUid || req.profile.supabase_uid;
    const data = await authService.changePassword(
      req.body,
      req,
      req.profile,
      subject,
    );
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
}

async function patientCity(req, res) {
  try {
    const { city } = req.body;
    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    const Patient = require("../models/Patient");
    const Organization = require("../models/Organization");

    const patient = await Patient.findOneAndUpdate(
      { supabase_uid: req.user.id },
      { city },
      { new: true },
    );

    if (!patient) {
      return res.status(404).json({ error: "Patient record not found" });
    }

    const org = await Organization.findOne({ city, isActive: true });
    if (org && org._id.toString() !== patient.organization_id?.toString()) {
      patient.organization_id = org._id;
      await patient.save();
    }

    await logEvent(
      req.user.id,
      "patient_city_updated",
      "patient",
      patient._id,
      req,
      { city },
    );

    res.json({
      message: "City updated successfully",
      city: patient.city,
      organizationId: patient.organization_id,
    });
  } catch (err) {
    console.error("Update patient city error:", err);
    res.status(500).json({ error: "Failed to update city" });
  }
}

async function updateMe(req, res) {
  try {
    const { fullName, phone, avatarUrl } = req.body;
    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    if (req.auth?.userType === "Patient") {
      const patientUpdate = {};
      if (updateData.fullName !== undefined)
        patientUpdate.name = updateData.fullName;
      if (updateData.phone !== undefined)
        patientUpdate.phone = updateData.phone;
      await Patient.findByIdAndUpdate(req.profile._id, patientUpdate, {
        new: true,
        runValidators: true,
      });
      return res.json({ message: "Profile updated successfully" });
    }

    if (req.profile?.role === "companion") {
      const Companion = require("../models/Companion");
      const companion = await Companion.findByIdAndUpdate(
        req.profile._id,
        updateData,
        {
          new: true,
          runValidators: true,
        },
      );
      await logEvent(
        req.profile.supabaseUid,
        "profile_updated",
        "companion",
        companion._id,
        req,
        {
          updatedFields: Object.keys(updateData),
        },
      );
      return res.json({
        message: "Profile updated successfully",
        profile: {
          id: companion._id,
          email: companion.email,
          fullName: companion.fullName,
          role: companion.role,
          phone: companion.phone,
          avatarUrl: companion.avatarUrl,
          isActive: companion.isActive,
          emailVerified: companion.emailVerified,
        },
      });
    }

    const profile = await Profile.findByIdAndUpdate(
      req.profile._id,
      updateData,
      {
        new: true,
        runValidators: true,
      },
    ).populate("organizationId", "name city");

    await logEvent(
      req.profile.supabaseUid,
      "profile_updated",
      "profile",
      profile._id,
      req,
      {
        updatedFields: Object.keys(updateData),
      },
    );

    res.json({
      message: "Profile updated successfully",
      profile: {
        id: profile._id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        isActive: profile.isActive,
        emailVerified: profile.emailVerified,
      },
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
}

async function uploadAvatar(req, res) {
  try {
    const { file_base64, content_type } = req.body;
    if (!file_base64)
      return res.status(400).json({ error: "file_base64 is required" });

    let userModel;
    let resourceType;
    if (req.profile.role === "companion") {
      userModel = require("../models/Companion");
      resourceType = "companion";
    } else {
      userModel = Profile;
      resourceType = "profile";
    }

    const user = await userModel.findById(req.profile._id);
    if (!user) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const { createClient } = require("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return res
        .status(500)
        .json({ error: "Supabase configuration missing on server" });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const buffer = Buffer.from(file_base64, "base64");
    const ext = content_type === "image/png" ? "png" : "jpg";
    const randomHash =
      Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const fileName = `${user.supabaseUid || user._id}/${randomHash}.${ext}`;

    const { data, error } = await supabaseAdmin.storage
      .from("avatars")
      .upload(fileName, buffer, {
        contentType: content_type || "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("Supabase avatar upload error:", error.message);
      return res
        .status(500)
        .json({ error: "Failed to upload: " + error.message });
    }

    const publicUrl = supabaseAdmin.storage
      .from("avatars")
      .getPublicUrl(fileName).data.publicUrl;

    // Delete old avatar from Supabase Storage if it exists
    if (user.avatarUrl) {
      try {
        const marker = `/public/avatars/`;
        const idx = user.avatarUrl.indexOf(marker);
        if (idx !== -1) {
          const oldFilePath = decodeURIComponent(
            user.avatarUrl.substring(idx + marker.length),
          );
          await supabaseAdmin.storage.from("avatars").remove([oldFilePath]);
        }
      } catch (delErr) {
        console.warn("Failed to delete old avatar file:", delErr.message);
      }
    }

    user.avatarUrl = publicUrl;
    await user.save();

    await logEvent(
      user.supabaseUid,
      "avatar_uploaded",
      resourceType,
      user._id,
      req,
      {
        avatarUrl: publicUrl,
      },
    );

    res.json({
      message: "Avatar uploaded successfully",
      avatarUrl: publicUrl,
      user,
    });
  } catch (error) {
    console.error("Upload avatar error:", error);
    res
      .status(500)
      .json({ error: "Failed to upload avatar", details: error.message });
  }
}

async function sendOtp(req, res) {
  try {
    const { identifier, type } = req.body;
    if (!identifier || !type) {
      return res
        .status(400)
        .json({ error: "identifier and type (email/phone) are required" });
    }

    if (type === "email") {
      const emailNorm = identifier.toLowerCase().trim();
      // NOTE: We intentionally do NOT block "already registered" emails here.
      // The registerPatient() endpoint has its own robust duplicate handling
      // (OAuth linking, deactivation detection, E11000 dedup). Blocking here
      // was preventing users with partial/incomplete signups from retrying.

      const { createOTP } = require("../services/otpService");
      const { sendOTPEmail } = require("../services/emailService");
      const otp = await createOTP(emailNorm);
      const emailResult = await sendOTPEmail(identifier, otp);
      if (emailResult === null) {
        return res.status(500).json({
          error: "Failed to send OTP email. Please check server configuration.",
        });
      }
      res.json({ message: "Verification code sent to your email." });
    } else if (type === "phone") {
      const phoneNorm = identifier.trim();
      // Remove +91 or + if present for DB count just in case, but let's stick to strict match first
      // Assuming DB stores +91... format
      let searchPhone = phoneNorm;
      if (!searchPhone.startsWith("+"))
        searchPhone = `+91${searchPhone.replace(/^91/, "")}`;

      const phoneVariants = [phoneNorm, searchPhone];
      const phoneCount = await Patient.countDocuments({
        phone: { $in: phoneVariants },
        is_active: true,
      });
      if (phoneCount >= 5) {
        return res.status(400).json({
          error:
            "5 accounts already exist with this number. Please delete an old account to use this number.",
          code: "PHONE_LIMIT_REACHED",
        });
      }

      const smsService = require("../services/smsService");

      // Enforce SMS OTP cooldown of 60 seconds (1 minute)
      const { acquireCooldown } = require("../services/otpService");
      const cooldownKey = `phone:${phoneNorm}`;
      const acquired = await acquireCooldown(cooldownKey, 60);
      if (!acquired) {
        return res.status(429).json({
          error: "Please wait 1 minute before requesting a new code.",
          code: "COOLDOWN_ACTIVE",
        });
      }

      // Use Twilio Verify - no need to generate or store our own OTP
      await smsService.sendVerification(phoneNorm);

      res.json({
        message: "Verification code sent to your phone.",
        remainingSlots: 5 - phoneCount,
      });
    } else {
      return res.status(400).json({ error: 'type must be "email" or "phone"' });
    }
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Send OTP error:", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to send verification code" });
  }
}

async function verifyOtp(req, res) {
  try {
    const { identifier, otp, type } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ error: "identifier and otp are required" });
    }

    let result;
    if (type === "phone") {
      const smsService = require("../services/smsService");
      result = await smsService.checkVerification(identifier.trim(), otp);
    } else {
      const { verifyOTP } = require("../services/otpService");
      const key = identifier.toLowerCase().trim();
      result = await verifyOTP(key, otp);
    }

    if (!result.valid) {
      return res.status(400).json({ error: result.reason });
    }

    // For phone login: look up the patient and issue a session
    if (type === "phone") {
      const phoneNorm = identifier.trim();
      // Phone may be stored with or without +91 country code — support both
      const phoneVariants = [phoneNorm];
      if (phoneNorm.startsWith("+91")) phoneVariants.push(phoneNorm.slice(3));
      else phoneVariants.push(`+91${phoneNorm}`);

      const patient = await Patient.findOne({
        phone: { $in: phoneVariants },
        is_active: true,
      });

      // If deactivated by user request, reactivate on login
      let reactivated = false;
      let activePatient = patient;
      if (!patient) {
        const deactivated = await Patient.findOne({
          phone: { $in: phoneVariants },
          is_active: false,
          deactivated_reason: "user_requested",
        });
        if (deactivated) {
          deactivated.is_active = true;
          deactivated.deactivated_at = undefined;
          deactivated.deactivated_reason = undefined;
          await deactivated.save();
          activePatient = deactivated;
          reactivated = true;
        }
      }

      if (!activePatient) {
        // Phone not registered — OTP was valid but no account exists
        return res.json({ message: "Verification successful", verified: true });
      }

      const tokenService = require("../services/tokenService");
      const subject =
        activePatient.supabase_uid || activePatient._id.toString();
      const tokens = await tokenService.issueTokenPair(
        {
          userId: activePatient._id,
          userType: "Patient",
          subject,
          role: "patient",
          email: activePatient.email,
          emailVerified: activePatient.emailVerified,
        },
        req,
      );

      if (reactivated) {
        await logEvent(
          subject,
          "account_reactivated",
          "patient",
          activePatient._id,
          req,
          { method: "phone_otp" },
        );
      }
      await logEvent(subject, "login", "patient", activePatient._id, req, {
        method: "phone_otp",
      });

      return res.json({
        message: "Login successful",
        verified: true,
        session: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          expires_at: tokens.expires_at,
          user: { id: subject, email: activePatient.email },
        },
        profile: {
          id: activePatient._id,
          email: activePatient.email,
          fullName: activePatient.name,
          role: "patient",
          organizationId: activePatient.organization_id,
          isActive: activePatient.is_active,
          emailVerified: activePatient.emailVerified,
          subscription_status:
            activePatient.subscription?.status || "pending_payment",
        },
      });
    }

    res.json({ message: "Verification successful", verified: true });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(400).json({ error: err.message || "Verification failed" });
  }
}

async function setPassword(req, res) {
  try {
    const subject =
      req.auth?.subject || req.profile.supabaseUid || req.profile.supabase_uid;
    const data = await authService.setPassword(
      req.body.newPassword,
      req,
      req.profile,
      subject,
    );
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Set password error:", err);
    res.status(500).json({ error: "Failed to set password" });
  }
}

async function switchRole(req, res) {
  try {
    const { targetRole } = req.body;
    if (!targetRole) {
      return res.status(400).json({ error: "targetRole is required" });
    }
    const data = await authService.switchRole(targetRole, req, req.profile);
    res.json(data);
  } catch (err) {
    if (err.status) return sendError(res, err);
    console.error("Switch role error:", err);
    res.status(500).json({ error: "Switch role failed" });
  }
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  resetPassword,
  resetPasswordVerify,
  me,
  createUser,
  changePassword,
  patientCity,
  updateMe,
  uploadAvatar,
  sendOtp,
  verifyOtp,
  setPassword,
  deleteMe,
  deactivateMe,
  exportMyData,
  switchRole,
};
