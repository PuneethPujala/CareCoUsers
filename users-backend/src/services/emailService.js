const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter;

const getTransporter = () => {
    if (transporter) return transporter;

    // Use SMTP config from environment variables
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== 'false', // Default to true for 465
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
    });

    return transporter;
};

/**
 * Send a generic email
 */
const sendEmail = async (to, subject, html) => {
    const transport = getTransporter();
    const fromEmail = process.env.FROM_EMAIL || 'noreply@samvaya.com';

    const mailOptions = {
        from: `"Team Samvaya" <${fromEmail}>`,
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
 * Send OTP verification email
 */
const sendOTPEmail = async (to, otp) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; }
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,.12); }
        .header { background: linear-gradient(135deg, #4338CA, #6366F1); padding: 36px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.3px; }
        .header p { color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; letter-spacing: 1.5px; font-weight: 600; }
        .body { padding: 36px 32px; }
        .body p { color: #334155; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .otp-box { text-align: center; margin: 28px 0; }
        .otp-code { display: inline-block; background: linear-gradient(135deg, #EEF2FF, #E0E7FF); border: 2px solid #C7D2FE; border-radius: 16px; padding: 20px 40px; font-size: 36px; font-weight: 800; color: #4338CA; letter-spacing: 12px; font-family: 'SF Mono', 'Fira Code', monospace; }
        .timer { display: inline-block; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 8px 16px; margin-top: 12px; font-size: 13px; color: #92400E; font-weight: 600; }
        .warning { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 12px; padding: 16px; margin: 20px 0; }
        .warning p { color: #9A3412; margin: 0; font-size: 13px; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #F1F5F9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p>SAMVAYA</p>
          <h1>Verify Your Email</h1>
        </div>
        <div class="body">
          <p>Hello,</p>
          <p>Use the verification code below to complete your sign-up. Enter this code in the app to verify your email address.</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <br />
            <span class="timer">⏳ Expires in 10 minutes</span>
          </div>

          <div class="warning">
            <p>⚠️ If you didn't request this code, you can safely ignore this email. Someone may have entered your email by mistake.</p>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team Samvaya &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'Samvaya — Your Verification Code', html);
};

/**
 * Send temporary password email to newly created user
 */
const sendTempPasswordEmail = async (to, fullName, tempPassword, roleName) => {
    const loginUrl = process.env.FRONTEND_URL || 'https://app.samvaya.com';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; }
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,.12); }
        .header { background: linear-gradient(135deg, #4338CA, #6366F1); padding: 36px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; }
        .header p { color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; letter-spacing: 1.5px; font-weight: 600; }
        .body { padding: 32px 24px; }
        .body p { color: #334155; line-height: 1.6; margin: 0 0 16px; }
        .creds { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .creds p { margin: 4px 0; font-size: 15px; }
        .creds strong { color: #4338CA; }
        .warning { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 16px; margin: 20px 0; }
        .warning p { color: #B91C1C; margin: 0; font-size: 14px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #4338CA, #6366F1); color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; margin: 16px 0; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #F1F5F9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p>SAMVAYA</p>
          <h1>🏥 Your Account Has Been Created</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your Samvaya account has been created with the role <strong>${roleName}</strong>. Please use the credentials below to log in:</p>
          
          <div class="creds">
            <p><strong>Email:</strong> ${to}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          </div>

          <div class="warning">
            <p>⚠️ <strong>You must change your password on first login.</strong> You will not be able to access any features until you set a new password.</p>
          </div>

          <a href="${loginUrl}" class="btn">Log In to Samvaya</a>

          <p style="font-size: 13px; color: #64748B; margin-top: 24px;">If you did not expect this account, please contact your organization administrator.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team Samvaya &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'Samvaya — Your Account Has Been Created', html);
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
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,.12); }
        .header { background: linear-gradient(135deg, #059669, #10B981); padding: 36px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; }
        .header p { color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; letter-spacing: 1.5px; font-weight: 600; }
        .body { padding: 32px 24px; }
        .body p { color: #334155; line-height: 1.6; margin: 0 0 16px; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #F1F5F9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p>SAMVAYA</p>
          <h1>✅ Password Changed Successfully</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your Samvaya password has been changed successfully. If you did not make this change, please contact your administrator immediately.</p>
          <p style="font-size: 13px; color: #64748B;">Changed at: ${new Date().toISOString()}</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team Samvaya &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'Samvaya — Password Changed', html);
};

/**
 * Send password reset email with custom OTP (replaces Supabase default)
 */
const sendPasswordResetEmail = async (to, otp) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; }
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,.12); }
        .header { background: linear-gradient(135deg, #4338CA, #6366F1); padding: 36px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 800; }
        .header p { color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; letter-spacing: 1.5px; font-weight: 600; }
        .body { padding: 36px 32px; }
        .body p { color: #334155; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .otp-box { text-align: center; margin: 28px 0; }
        .otp-code { display: inline-block; background: linear-gradient(135deg, #EEF2FF, #E0E7FF); border: 2px solid #C7D2FE; border-radius: 16px; padding: 20px 40px; font-size: 36px; font-weight: 800; color: #4338CA; letter-spacing: 12px; font-family: 'SF Mono', 'Fira Code', monospace; }
        .timer { display: inline-block; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 8px 16px; margin-top: 12px; font-size: 13px; color: #92400E; font-weight: 600; }
        .warning { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 12px; padding: 16px; margin: 20px 0; }
        .warning p { color: #9A3412; margin: 0; font-size: 13px; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #F1F5F9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p>SAMVAYA</p>
          <h1>Reset Your Password</h1>
        </div>
        <div class="body">
          <p>Hello,</p>
          <p>We received a request to reset your password. Use the code below in the app to set a new password.</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <br />
            <span class="timer">⏳ Expires in 10 minutes</span>
          </div>

          <div class="warning">
            <p>⚠️ If you didn't request this, you can safely ignore this email. Your password will not be changed.</p>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team Samvaya &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'Samvaya — Reset Your Password', html);
};

/**
 * Send security setting change OTP (e.g., Allow Screenshots)
 */
const sendSecurityOTPEmail = async (to, otp) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; }
        .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(99,102,241,.12); }
        .header { background: linear-gradient(135deg, #1E293B, #0F172A); padding: 36px 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 800; }
        .header p { color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px; letter-spacing: 1.5px; font-weight: 600; }
        .body { padding: 36px 32px; }
        .body p { color: #334155; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .otp-box { text-align: center; margin: 28px 0; }
        .otp-code { display: inline-block; background: linear-gradient(135deg, #F1F5F9, #E2E8F0); border: 2px solid #CBD5E1; border-radius: 16px; padding: 20px 40px; font-size: 36px; font-weight: 800; color: #0F172A; letter-spacing: 12px; font-family: 'SF Mono', 'Fira Code', monospace; }
        .timer { display: inline-block; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 8px 16px; margin-top: 12px; font-size: 13px; color: #92400E; font-weight: 600; }
        .warning { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 16px; margin: 20px 0; }
        .warning p { color: #991B1B; margin: 0; font-size: 13px; font-weight: 500; }
        .footer { text-align: center; padding: 20px 24px; color: #94A3B8; font-size: 12px; border-top: 1px solid #F1F5F9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p>SAMVAYA SECURITY</p>
          <h1>Security Action Verification</h1>
        </div>
        <div class="body">
          <p>Hello,</p>
          <p>We received a request to modify a critical security setting on your account (Allow Screenshots). Use the code below in the app to authorize this change.</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <br />
            <span class="timer">⏳ Expires in 10 minutes</span>
          </div>

          <div class="warning">
            <p>🛡️ If you did not authorize this change, please ignore this email. Your settings remain secure.</p>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team Samvaya &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

    return sendEmail(to, 'Samvaya — Security Action Verification', html);
};

module.exports = {
    sendEmail,
    sendOTPEmail,
    sendTempPasswordEmail,
    sendPasswordChangedEmail,
    sendPasswordResetEmail,
    sendSecurityOTPEmail,
};
