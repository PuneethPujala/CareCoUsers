const mongoose = require('mongoose');

const ProcessedWebhookSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, required: true, enum: ['stripe', 'razorpay'] },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, expires: '30d' }, // Auto-prune old events after 30 days
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ProcessedWebhook', ProcessedWebhookSchema);
