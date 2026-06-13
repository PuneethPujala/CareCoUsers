const mongoose = require('mongoose');

const PriorityActionSchema = new mongoose.Schema(
    {
        action_type: { type: String, required: true },
        priority: { type: Number, required: true },
        severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
        message: { type: String, required: true }
    },
    { _id: false }
);

const companionAiInsightSchema = new mongoose.Schema(
    {
        patient_id: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Patient', 
            required: true,
            unique: true,
            index: true
        },
        schema_version: { type: Number, default: 1 },
        summary: { type: String, required: true },
        recommendations: [{ type: String }],
        risk_level: { 
            type: String, 
            enum: ['low', 'medium', 'high'], 
            default: 'low' 
        },
        risk_score: { type: Number, min: 0, max: 100, required: true },
        risk_breakdown: {
            adherence: { type: Number, required: true },
            vitals: { type: Number, required: true },
            mood: { type: Number, required: true },
            visibility: { type: Number, required: true }
        },
        risk_factors: [{ type: String }],
        risk_trend: {
            previous: { type: String, enum: ['low', 'medium', 'high'] },
            current: { type: String, enum: ['low', 'medium', 'high'] },
            direction: { type: String, enum: ['improving', 'worsening', 'stable'] }
        },
        trend_delta: {
            risk_score: { type: Number, default: 0 },
            visibility_score: { type: Number, default: 0 },
            confidence_score: { type: Number, default: 0 }
        },
        visibility_score: { type: Number, min: 0, max: 100, required: true },
        visibility_label: { type: String, enum: ['Low', 'Medium', 'High'], required: true },
        visibility_breakdown: {
            medications: { type: Number, required: true },
            vitals: { type: Number, required: true },
            wearable: { type: Number, required: true },
            mood: { type: Number, required: true }
        },
        confidence_score: { type: Number, min: 0, max: 100, required: true },
        confidence_label: { type: String, enum: ['Low', 'Medium', 'High'], required: true },
        last_stable: {
            stable_days: { type: Number },
            last_stable_at: { type: Date },
            currently_stable: { type: Boolean, required: true },
            unstable_since: { type: Date }
        },
        priority_actions: [PriorityActionSchema],
        predictive_health: {
            momentum: {
                score: { type: Number, default: 50 },
                direction: { type: String, enum: ['improving', 'stable', 'declining'], default: 'stable' }
            },
            consistency: {
                score: { type: Number, default: 100 }
            },
            risk_trends: {
                velocity: { type: Number, default: 0 },
                acceleration: { type: Number, default: 0 }
            },
            recovery: {
                status: { type: Boolean, default: false },
                days: { type: Number, default: 0 },
                confidence: { type: Number, default: 0 }
            },
            forecast: {
                projected_score_14d: { type: Number, default: 80 },
                trajectory: { type: String, enum: ['positive', 'negative', 'stable'], default: 'stable' }
            }
        },
        generation_meta: {
            provider: { type: String },
            model: { type: String },
            generated_with_ai: { type: Boolean },
            fallback_used: { type: Boolean }
        },
        generated_at: { type: Date, default: Date.now },
        expires_at: { type: Date, required: true }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
    }
);

// TTL index to automatically delete expired insights (e.g. after 6 hours)
companionAiInsightSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CompanionAiInsight', companionAiInsightSchema);
