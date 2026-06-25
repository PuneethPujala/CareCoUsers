const mongoose = require("mongoose");

const AIChatLogSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    retrieved_chunks: {
      type: [String],
      default: [],
    },
    response: {
      type: String,
      required: true,
    },
    emergency_escalation_triggered: {
      type: Boolean,
      default: false,
    },
    translated_language: {
      type: String,
      default: "en",
    },
    emergency_ruleset: {
      type: String,
      default: null,
    },
    llm_latency_ms: {
      type: Number,
      default: 0,
    },
    retrieval_latency_ms: {
      type: Number,
      default: 0,
    },
    translation_latency_ms: {
      type: Number,
      default: 0,
    },
    end_to_end_latency_ms: {
      type: Number,
      default: 0,
    },
    streaming_first_token_ms: {
      type: Number,
      default: 0,
    },
    prompt_tokens: {
      type: Number,
      default: 0,
    },
    completion_tokens: {
      type: Number,
      default: 0,
    },
    total_tokens: {
      type: Number,
      default: 0,
    },
    provider: {
      type: String,
      default: "ollama",
    },
    model: {
      type: String,
      default: "unknown",
    },
    is_fallback: {
      type: Boolean,
      default: false,
    },
    fallback_reason: {
      type: String,
      default: null,
    },
    retrieved_chunks_count: {
      type: Number,
      default: 0,
    },
    retrieval_similarity_avg: {
      type: Number,
      default: 0,
    },
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIChatSession",
      default: null,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

module.exports = mongoose.model("AIChatLog", AIChatLogSchema);
