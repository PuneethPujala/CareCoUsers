const axios = require('axios');
const logger = require('../utils/logger');
const { sendEmail } = require('./emailService');
const AuditLog = require('../models/AuditLog');
const AIChatLog = require('../models/AIChatLog');

async function triggerSystemAlert(severity, title, message) {
  logger.error(`[SYSTEM ALERT] [${severity}] ${title}: ${message}`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@caremymed.com';
  const env = process.env.NODE_ENV || 'development';

  // 1. Email Alert
  const emailSubject = `🚨 [${severity.toUpperCase()}] CareMyMed System Alert: ${title}`;
  const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 2px solid ${severity === 'Critical' ? '#ef4444' : '#f59e0b'}; border-radius: 8px;">
            <h2 style="color: ${severity === 'Critical' ? '#ef4444' : '#f59e0b'}; margin-top: 0;">System Alert</h2>
            <p><strong>Severity:</strong> ${severity}</p>
            <p><strong>Environment:</strong> ${env}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <hr />
            <p><strong>Alert:</strong> ${title}</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">${message}</div>
            <hr />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">CareMyMed Operations Observability Engine</p>
        </div>
    `;

  try {
    await sendEmail(adminEmail, emailSubject, emailHtml);
  } catch (err) {
    logger.error('Failed to send email alert:', { error: err.message });
  }

  // 2. Discord Webhook
  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      await axios.post(
        process.env.DISCORD_WEBHOOK_URL,
        {
          content: `🚨 **[${severity.toUpperCase()}] CareMyMed System Alert**\n**Environment:** ${env}\n**Alert:** ${title}\n\`\`\`\n${message}\n\`\`\``,
        },
        { timeout: 5000 }
      );
    } catch (err) {
      logger.error('Failed to send Discord alert:', { error: err.message });
    }
  }

  // 3. Slack Webhook
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await axios.post(
        process.env.SLACK_WEBHOOK_URL,
        {
          text: `🚨 *[${severity.toUpperCase()}] CareMyMed System Alert*\n*Environment:* ${env}\n*Alert:* ${title}\n\`\`\`\n${message}\n\`\`\``,
        },
        { timeout: 5000 }
      );
    } catch (err) {
      logger.error('Failed to send Slack alert:', { error: err.message });
    }
  }
}

async function checkSystemHealth() {
  logger.info('[Observability] Checking system health metrics...');

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 1. Chatbot Error/Fallback Rate Evaluation (last 15 mins)
  try {
    const totalChats = await AIChatLog.countDocuments({
      created_at: { $gte: fifteenMinutesAgo },
    });
    const failedChats = await AIChatLog.countDocuments({
      created_at: { $gte: fifteenMinutesAgo },
      $or: [{ is_fallback: true }, { fallback_reason: { $ne: null } }],
    });

    if (totalChats >= 5) {
      const errorRate = failedChats / totalChats;
      if (errorRate > 0.05) {
        await module.exports.triggerSystemAlert(
          'Warning',
          'High Chatbot Failure/Fallback Rate',
          `Chatbot fallback/error rate is ${(errorRate * 100).toFixed(1)}% (${failedChats}/${totalChats} requests failed/fallback) over the last 15 minutes.`
        );
      }
    }
  } catch (err) {
    logger.error('Failed to evaluate chatbot health:', { error: err.message });
  }

  // 2. OCR Failure Rate Evaluation (last 15 mins)
  try {
    const ocrTotal = await AuditLog.countDocuments({
      action: { $in: ['ocr_extraction_success', 'ocr_extraction_failed'] },
      createdAt: { $gte: fifteenMinutesAgo },
    });
    const ocrFailed = await AuditLog.countDocuments({
      action: 'ocr_extraction_failed',
      createdAt: { $gte: fifteenMinutesAgo },
    });

    if (ocrTotal >= 3) {
      const ocrFailureRate = ocrFailed / ocrTotal;
      if (ocrFailureRate > 0.1) {
        await module.exports.triggerSystemAlert(
          'Warning',
          'High OCR Extraction Failure Rate',
          `Prescription OCR failure rate is ${(ocrFailureRate * 100).toFixed(1)}% (${ocrFailed}/${ocrTotal} extractions failed) over the last 15 minutes.`
        );
      }
    }
  } catch (err) {
    logger.error('Failed to evaluate OCR health:', { error: err.message });
  }

  // 3. Payment Success Rate Evaluation (last 24 hours)
  try {
    const paymentTotal = await AuditLog.countDocuments({
      action: {
        $in: ['payment_activation_success', 'payment_activation_failed'],
      },
      createdAt: { $gte: twentyFourHoursAgo },
    });
    const paymentFailed = await AuditLog.countDocuments({
      action: 'payment_activation_failed',
      createdAt: { $gte: twentyFourHoursAgo },
    });

    if (paymentTotal >= 1) {
      const successRate = (paymentTotal - paymentFailed) / paymentTotal;
      if (successRate < 0.9) {
        await module.exports.triggerSystemAlert(
          'Warning',
          'Low Payment Activation Success Rate',
          `Subscription payment activation success rate is ${(successRate * 100).toFixed(1)}% (${paymentFailed}/${paymentTotal} activations failed) over the last 24 hours.`
        );
      }
    }
  } catch (err) {
    logger.error('Failed to evaluate payment health:', { error: err.message });
  }
}

module.exports = {
  triggerSystemAlert,
  checkSystemHealth,
};
