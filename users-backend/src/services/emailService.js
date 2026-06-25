const nodemailer = require("nodemailer");
const { Resend } = require("resend");

// Initialize Resend client if API key is provided
let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("✉️ Resend email service initialized successfully");
}

// Create reusable transporter
let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const smtpPort = parseInt(process.env.SMTP_PORT) || 465;
  const isSecure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE !== "false"
      : smtpPort === 465;

  // Use SMTP config from environment variables
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: smtpPort,
    secure: isSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 45000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
};

/**
 * Send a generic email
 */
const sendEmail = async (to, subject, html, { textBody } = {}) => {
  const fromEmail = process.env.FROM_EMAIL || "noreply@CareMyMed.com";

  if (resend) {
    try {
      let resendFrom = fromEmail;
      const lowerFrom = fromEmail.toLowerCase();
      if (
        lowerFrom.endsWith("@gmail.com") ||
        lowerFrom.endsWith("@yahoo.com") ||
        lowerFrom.endsWith("@outlook.com") ||
        !process.env.FROM_EMAIL
      ) {
        resendFrom = "onboarding@resend.dev";
      }
      const info = await resend.emails.send({
        from: `CareMyMed Health <${resendFrom}>`,
        to,
        subject,
        html,
        text:
          textBody ||
          html
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500),
      });
      if (info.error) {
        throw new Error(info.error.message);
      }
      console.log(
        `📧 Email sent via Resend to ${to}: ${info.data?.id || info.id}`,
      );
      return info;
    } catch (error) {
      console.error(
        `❌ Failed to send email via Resend to ${to}:`,
        error.message,
      );
      console.log("🔄 Falling back to standard SMTP...");
    }
  }

  const transport = getTransporter();

  const mailOptions = {
    from: `"CareMyMed Health" <${fromEmail}>`,
    to,
    subject,
    html,
    // Plain-text fallback — spam filters penalize HTML-only emails
    text:
      textBody ||
      html
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500),
    headers: {
      "X-Mailer": "CareMyMed Health Platform",
      Precedence: "bulk",
      "List-Unsubscribe": `<mailto:${fromEmail}?subject=unsubscribe>`,
    },
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0B0F19; color: #E2E8F0; }
        .container { max-width: 520px; margin: 20px 12px; background: #151D30; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #24304F; }
        .header { background: linear-gradient(135deg, #3B82F6, #6366F1); padding: 40px 24px; text-align: center; }
        .logo { font-size: 14px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .logo-c { color: #FFFFFF; }
        .logo-m { color: #60A5FA; }
        .header h1 { color: #fff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .body { padding: 32px 20px; }
        .body p { color: #94A3B8; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .otp-box { text-align: center; margin: 32px 0; }
        .otp-code { display: inline-block; background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 12px 20px; font-size: 26px; font-weight: 800; color: #60A5FA; letter-spacing: 8px; text-indent: 8px; font-family: 'SF Mono', 'Fira Code', monospace; max-width: 100%; box-sizing: border-box; }
        .timer { display: inline-block; background: #2A2215; border: 1px solid #4D3C1B; border-radius: 8px; padding: 8px 16px; margin-top: 16px; font-size: 13px; color: #F59E0B; font-weight: 600; }
        .warning { background: #2A1C1E; border: 1px solid #4D2527; border-radius: 12px; padding: 16px; margin: 24px 0 0; }
        .warning p { color: #FCA5A5; margin: 0; font-size: 13px; line-height: 1.5; }
        .footer { text-align: center; padding: 24px; color: #64748B; font-size: 12px; border-top: 1px solid #1E293B; background: #0E1322; }
        @media (min-width: 560px) {
          .container { margin: 40px auto; }
          .body { padding: 40px 32px; }
          .otp-code { font-size: 36px; padding: 20px 40px; letter-spacing: 12px; text-indent: 12px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><span class="logo-c">Care</span><span class="logo-m">My</span><span class="logo-c">Med</span></div>
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
          &copy; ${new Date().getFullYear()} Team CareMyMed &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, `Your CareMyMed code: ${otp}`, html, {
    textBody: `Your CareMyMed verification code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, ignore this email.`,
  });
};

/**
 * Send temporary password email to newly created user
 */
const sendTempPasswordEmail = async (to, fullName, tempPassword, roleName) => {
  const loginUrl = process.env.FRONTEND_URL || "https://app.CareMyMed.com";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0B0F19; color: #E2E8F0; }
        .container { max-width: 520px; margin: 20px 12px; background: #151D30; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #24304F; }
        .header { background: linear-gradient(135deg, #3B82F6, #6366F1); padding: 40px 24px; text-align: center; }
        .logo { font-size: 14px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .logo-c { color: #FFFFFF; }
        .logo-m { color: #60A5FA; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 800; }
        .body { padding: 32px 20px; }
        .body p { color: #94A3B8; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .body strong { color: #FFFFFF; }
        .creds { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 20px 0; box-sizing: border-box; max-width: 100%; }
        .creds p { margin: 6px 0; font-size: 15px; color: #E2E8F0; }
        .creds strong { color: #60A5FA; }
        .warning { background: #2A1C1E; border: 1px solid #4D2527; border-radius: 12px; padding: 16px; margin: 20px 0; box-sizing: border-box; max-width: 100%; }
        .warning p { color: #FCA5A5; margin: 0; font-size: 13px; line-height: 1.5; }
        .btn { display: inline-block; background: linear-gradient(135deg, #3B82F6, #6366F1); color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; margin: 16px 0; text-align: center; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); box-sizing: border-box; max-width: 100%; }
        .footer { text-align: center; padding: 24px; color: #64748B; font-size: 12px; border-top: 1px solid #1E293B; background: #0E1322; }
        @media (min-width: 560px) {
          .container { margin: 40px auto; }
          .body { padding: 40px 32px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><span class="logo-c">Care</span><span class="logo-m">My</span><span class="logo-c">Med</span></div>
          <h1>🏥 Your Account Has Been Created</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your CareMyMed account has been created with the role <strong>${roleName}</strong>. Please use the credentials below to log in:</p>
          
          <div class="creds">
            <p><strong>Email:</strong> ${to}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
          </div>

          <div class="warning">
            <p>⚠️ <strong>You must change your password on first login.</strong> You will not be able to access any features until you set a new password.</p>
          </div>

          <a href="${loginUrl}" class="btn">Log In to CareMyMed</a>

          <p style="font-size: 13px; color: #64748B; margin-top: 24px;">If you did not expect this account, please contact your organization administrator.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team CareMyMed &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, "Your CareMyMed account is ready", html);
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0B0F19; color: #E2E8F0; }
        .container { max-width: 520px; margin: 20px 12px; background: #151D30; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #24304F; }
        .header { background: linear-gradient(135deg, #059669, #10B981); padding: 40px 24px; text-align: center; }
        .logo { font-size: 14px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .logo-c { color: #FFFFFF; }
        .logo-m { color: #34D399; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 800; }
        .body { padding: 32px 20px; }
        .body p { color: #94A3B8; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .body strong { color: #FFFFFF; }
        .footer { text-align: center; padding: 24px; color: #64748B; font-size: 12px; border-top: 1px solid #1E293B; background: #0E1322; }
        @media (min-width: 560px) {
          .container { margin: 40px auto; }
          .body { padding: 40px 32px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><span class="logo-c">Care</span><span class="logo-m">My</span><span class="logo-c">Med</span></div>
          <h1>✅ Password Changed Successfully</h1>
        </div>
        <div class="body">
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Your CareMyMed password has been changed successfully. If you did not make this change, please contact your administrator immediately.</p>
          <p style="font-size: 13px; color: #64748B;">Changed at: ${new Date().toISOString()}</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Team CareMyMed &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, "Your CareMyMed password was changed", html);
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0B0F19; color: #E2E8F0; }
        .container { max-width: 520px; margin: 20px 12px; background: #151D30; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #24304F; }
        .header { background: linear-gradient(135deg, #3B82F6, #6366F1); padding: 40px 24px; text-align: center; }
        .logo { font-size: 14px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .logo-c { color: #FFFFFF; }
        .logo-m { color: #60A5FA; }
        .header h1 { color: #fff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .body { padding: 32px 20px; }
        .body p { color: #94A3B8; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .otp-box { text-align: center; margin: 32px 0; }
        .otp-code { display: inline-block; background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 12px 20px; font-size: 26px; font-weight: 800; color: #60A5FA; letter-spacing: 8px; text-indent: 8px; font-family: 'SF Mono', 'Fira Code', monospace; max-width: 100%; box-sizing: border-box; }
        .timer { display: inline-block; background: #2A2215; border: 1px solid #4D3C1B; border-radius: 8px; padding: 8px 16px; margin-top: 16px; font-size: 13px; color: #F59E0B; font-weight: 600; }
        .warning { background: #2A1C1E; border: 1px solid #4D2527; border-radius: 12px; padding: 16px; margin: 24px 0 0; }
        .warning p { color: #FCA5A5; margin: 0; font-size: 13px; line-height: 1.5; }
        .footer { text-align: center; padding: 24px; color: #64748B; font-size: 12px; border-top: 1px solid #1E293B; background: #0E1322; }
        @media (min-width: 560px) {
          .container { margin: 40px auto; }
          .body { padding: 40px 32px; }
          .otp-code { font-size: 36px; padding: 20px 40px; letter-spacing: 12px; text-indent: 12px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><span class="logo-c">Care</span><span class="logo-m">My</span><span class="logo-c">Med</span></div>
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
          &copy; ${new Date().getFullYear()} Team CareMyMed &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, `CareMyMed password reset code: ${otp}`, html, {
    textBody: `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, ignore this email.`,
  });
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0B0F19; color: #E2E8F0; }
        .container { max-width: 520px; margin: 20px 12px; background: #151D30; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #24304F; }
        .header { background: linear-gradient(135deg, #1E293B, #0F172A); padding: 40px 24px; text-align: center; }
        .logo { font-size: 14px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .logo-c { color: #FFFFFF; }
        .logo-m { color: #EF4444; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 800; }
        .body { padding: 32px 20px; }
        .body p { color: #94A3B8; line-height: 1.7; margin: 0 0 16px; font-size: 15px; }
        .otp-box { text-align: center; margin: 32px 0; }
        .otp-code { display: inline-block; background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 12px 20px; font-size: 26px; font-weight: 800; color: #EF4444; letter-spacing: 8px; text-indent: 8px; font-family: 'SF Mono', 'Fira Code', monospace; max-width: 100%; box-sizing: border-box; }
        .timer { display: inline-block; background: #2A2215; border: 1px solid #4D3C1B; border-radius: 8px; padding: 8px 16px; margin-top: 16px; font-size: 13px; color: #F59E0B; font-weight: 600; }
        .warning { background: #2A1C1E; border: 1px solid #4D2527; border-radius: 12px; padding: 16px; margin: 20px 0; }
        .warning p { color: #FCA5A5; margin: 0; font-size: 13px; line-height: 1.5; }
        .footer { text-align: center; padding: 24px; color: #64748B; font-size: 12px; border-top: 1px solid #1E293B; background: #0E1322; }
        @media (min-width: 560px) {
          .container { margin: 40px auto; }
          .body { padding: 40px 32px; }
          .otp-code { font-size: 36px; padding: 20px 40px; letter-spacing: 12px; text-indent: 12px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo"><span class="logo-c">Care</span><span class="logo-m">My</span><span class="logo-c">Med</span> <span class="logo-c" style="opacity: 0.6; font-size: 12px; font-weight: 500;">SECURITY</span></div>
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
          &copy; ${new Date().getFullYear()} Team CareMyMed &mdash; Your Health, Our Priority
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, `CareMyMed security code: ${otp}`, html, {
    textBody: `Your security verification code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't authorize this, ignore this email.`,
  });
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendTempPasswordEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendSecurityOTPEmail,
};
