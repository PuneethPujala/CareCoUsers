const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter;

const getTransporter = () => {
    if (transporter) return transporter;

    // Use SMTP config from environment variables
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    return transporter;
};

/**
 * Send a generic email
 */
const sendEmail = async (to, subject, html) => {
    const transport = getTransporter();
    const fromEmail = process.env.FROM_EMAIL || 'noreply@careconnect.com';

    const mailOptions = {
        from: `"CareConnect" <${fromEmail}>`,
        to,
        subject,
        html,
    };

    try {
        const info = await transport.sendMail(mailOptions);
        console.log(`📧 Email sent to ${to}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error.message);
        // Don't throw — email failure should not block account creation
        return null;
    }
};

/**
 * Send temporary password email to newly created user
 */
const sendTempPasswordEmail = async (to, fullName, tempPassword, roleName) => {
    const loginUrl = process.env.FRONTEND_URL || 'https://app.careconnect.com';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; }
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,.08); }
        .header { background: linear-gradient(135deg, #2563EB, #3B82F6); padding: 32px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; }
        .body { padding: 32px 24px; }
        .body p { color: #334155; line-height: 1.6; margin: 0 0 16px; }
        .creds { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .creds p { margin: 4px 0; font-size: 15px; }
        .creds strong { color: #1E40AF; }
        .warning { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; margin: 20px 0; }
        .warning p { color: #B91C1C; margin: 0; font-size: 14px; }
        .btn { display: inline-block; background: #2563EB; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #E2E8F0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏥 CareConnect Account Created</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your CareConnect account has been created with the role <strong>${roleName}</strong>. Please use the credentials below to log in:</p>
          
          <div class="creds">
            <p><strong>Email:</strong> ${to}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          </div>

          <div class="warning">
            <p>⚠️ <strong>You must change your password on first login.</strong> You will not be able to access any features until you set a new password.</p>
          </div>

          <a href="${loginUrl}" class="btn">Log In to CareConnect</a>

          <p style="font-size: 13px; color: #64748B; margin-top: 24px;">If you did not expect this account, please contact your organization administrator.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} CareConnect &mdash; Healthcare Coordination Platform
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'CareConnect — Your Account Has Been Created', html);
};

/**
 * Send password changed confirmation email
 */
const sendPasswordChangedEmail = async (to, fullName) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; }
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,.08); }
        .header { background: linear-gradient(135deg, #059669, #10B981); padding: 32px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; }
        .body { padding: 32px 24px; }
        .body p { color: #334155; line-height: 1.6; margin: 0 0 16px; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #E2E8F0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Password Changed Successfully</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your CareConnect password has been changed successfully. If you did not make this change, please contact your administrator immediately.</p>
          <p style="font-size: 13px; color: #64748B;">Changed at: ${new Date().toISOString()}</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} CareConnect &mdash; Healthcare Coordination Platform
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'CareConnect — Password Changed', html);
};

module.exports = {
    sendEmail,
    sendTempPasswordEmail,
    sendPasswordChangedEmail,
};
