/**
 * SMS Service — Twilio Verify Integration
 * 
 * Uses Twilio Verify API for OTP generation, delivery, and verification.
 * Twilio handles OTP generation, storage, rate limiting, and fraud protection.
 * 
 * Required env vars:
 *   TWILIO_ACCOUNT_SID    — Your Twilio Account SID
 *   TWILIO_AUTH_TOKEN      — Your Twilio Auth Token
 *   TWILIO_VERIFY_SID      — Your Twilio Verify Service SID
 */
const twilio = require('twilio');

let client = null;

const getClient = () => {
  if (client) return client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('⚠️  Twilio credentials not configured. SMS verification will be unavailable.');
    return null;
  }

  client = twilio(accountSid, authToken);
  return client;
};

const getVerifyServiceSid = () => {
  const sid = process.env.TWILIO_VERIFY_SID;
  if (!sid) {
    throw new Error('TWILIO_VERIFY_SID is not configured. Create a Verify Service in Twilio Console.');
  }
  return sid;
};

/**
 * Send OTP to a phone number via Twilio Verify.
 * Twilio generates, stores, and delivers the OTP automatically.
 * 
 * @param {string} phone - Phone number in E.164 format (e.g., +919876543210)
 * @returns {Object} { success: true, status: 'pending' } or { success: false, error: '...' }
 */
async function sendOtp(phone) {
  try {
    const twilioClient = getClient();
    if (!twilioClient) {
      return { success: false, error: 'SMS service is not configured. Contact your administrator.' };
    }

    const verifySid = getVerifyServiceSid();

    const verification = await twilioClient.verify.v2
      .services(verifySid)
      .verifications.create({
        to: phone,
        channel: 'sms',
      });

    console.log(`📱 OTP sent to ${phone} — Status: ${verification.status}`);
    return { success: true, status: verification.status };
  } catch (error) {
    // Log FULL error details for debugging
    console.error('❌ Twilio SendOTP error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
    });

    // Map Twilio error codes to user-friendly messages
    let userMessage = `Failed to send verification code. (${error.code || 'UNKNOWN'}: ${error.message || 'Unknown error'})`;
    
    const errCode = error.code;
    const msg = (error.message || '').toLowerCase();

    if (errCode === 60200 || msg.includes('invalid parameter')) {
      userMessage = 'Invalid phone number format. Please check your number and try again.';
    } else if (errCode === 60203 || msg.includes('max send attempts')) {
      userMessage = 'Too many OTP requests. Please wait 10 minutes and try again.';
    } else if (errCode === 60210 || msg.includes('not a valid')) {
      userMessage = 'This phone number cannot receive SMS. Please use a different number.';
    } else if (errCode === 20003 || msg.includes('authenticate')) {
      userMessage = 'SMS service authentication failed. Contact your administrator.';
    } else if (errCode === 60223 || msg.includes('unverified')) {
      userMessage = 'Twilio trial: This number must be verified in the Twilio console first. Go to console.twilio.com → Verified Numbers.';
    } else if (msg.includes('permission') || msg.includes('geo') || msg.includes('denied')) {
      userMessage = 'SMS to this region is not enabled. Contact your administrator to enable India SMS in Twilio.';
    }

    return { success: false, error: userMessage };
  }
}

/**
 * Verify an OTP code entered by the user.
 * Twilio checks the code against what was sent.
 * 
 * @param {string} phone - Phone number in E.164 format
 * @param {string} code  - 6-digit OTP entered by user
 * @returns {Object} { success: true, status: 'approved' } or { success: false, error: '...' }
 */
async function verifyOtp(phone, code) {
  try {
    const twilioClient = getClient();
    if (!twilioClient) {
      return { success: false, error: 'SMS service is not configured.' };
    }

    const verifySid = getVerifyServiceSid();

    const verificationCheck = await twilioClient.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to: phone,
        code: code,
      });

    if (verificationCheck.status === 'approved') {
      console.log(`✅ Phone verified: ${phone}`);
      return { success: true, status: 'approved' };
    }

    return { success: false, error: 'Invalid verification code. Please try again.' };
  } catch (error) {
    console.error('❌ Twilio VerifyOTP error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
    });

    let userMessage = `Verification failed. (${error.code || 'UNKNOWN'}: ${error.message || 'Unknown error'})`;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('expired') || error.code === 20404) {
      userMessage = 'Verification code has expired or was not found. Please request a new code.';
    } else if (msg.includes('max check attempts') || error.code === 60202) {
      userMessage = 'Too many incorrect attempts. Please request a new code.';
    }

    return { success: false, error: userMessage };
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
};
