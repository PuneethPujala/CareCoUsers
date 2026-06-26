const mongoose = require("mongoose");

/**
 * TempMedication — Temporary/OTC medicines added by callers or patients.
 * Completely separate from the main Medication collection.
 * These are short-term medicines (Dolo, Paracetamol, etc.) that
 * callers need to remind patients about during calls.
 */
const TempMedicationSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // ── Medicine info ────────────────────────────────────────────
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    dosage: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    frequency: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "As needed",
    },
    shift: {
      type: String,
      enum: ["morning", "afternoon", "night"],
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // ── Who added it ─────────────────────────────────────────────
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },
    addedByRole: {
      type: String,
      enum: ["caller", "patient", "care_manager", "org_admin", "super_admin"],
      default: "caller",
    },
    addedByName: {
      type: String,
      trim: true,
      default: "",
    },

    // ── AI Safety Classification ─────────────────────────────────
    riskTier: {
      type: String,
      enum: ["safe", "caution", "restricted"],
      default: "caution",
    },
    genericName: {
      type: String,
      trim: true,
      default: "",
    },
    aiSummary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    sideEffects: [
      {
        type: String,
        trim: true,
      },
    ],
    warnings: [
      {
        type: String,
        trim: true,
      },
    ],
    interactions: [
      {
        type: String,
        trim: true,
      },
    ],

    // ── Status ───────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ────────────────────────────────────────────────────
TempMedicationSchema.index({ patientId: 1, isActive: 1, createdAt: -1 });
TempMedicationSchema.index({ organizationId: 1, isActive: 1 });

// ── Statics ────────────────────────────────────────────────────
TempMedicationSchema.statics.findActiveByPatient = function (patientId) {
  return this.find({ patientId, isActive: true }).sort({ createdAt: -1 });
};

module.exports = mongoose.model("TempMedication", TempMedicationSchema);
