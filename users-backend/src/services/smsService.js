const twilio = require('twilio');

class SmsService {
    constructor() {
        this.client = null;
        this.isConfigured = false;
        
        try {
            const sid = process.env.TWILIO_ACCOUNT_SID;
            const token = process.env.TWILIO_AUTH_TOKEN;
            this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

            if (sid && token && this.verifyServiceSid) {
                this.client = twilio(sid, token);
                this.isConfigured = true;
                console.log(`[Twilio] Initialized with Verify Service: ${this.verifyServiceSid}`);
            } else {
                console.warn('[Twilio] Missing credentials or Verify Service SID in .env. SMS will not be sent.');
            }
        } catch (err) {
            console.error('[Twilio] Initialization failed:', err.message);
        }
    }

    /**
     * Send an OTP via Twilio Verify
     */
    async sendVerification(phoneNumber) {
        if (!this.isConfigured) {
            console.log(`[Twilio Mock] 📲 Would send verify SMS to ${phoneNumber}`);
            return { success: true, mocked: true };
        }

        try {
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
            
            const verification = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verifications.create({ to: formattedPhone, channel: 'sms' });
                
            console.log(`[Twilio] Verify SMS sent successfully. Status: ${verification.status}`);
            return { success: true, status: verification.status };
        } catch (err) {
            console.error('[Twilio] Failed to send Verify SMS:', err.message);
            throw new Error('Failed to send SMS via Twilio. Check your credentials and verify service.');
        }
    }
    
    /**
     * Check an OTP via Twilio Verify
     */
    async checkVerification(phoneNumber, code) {
        if (!this.isConfigured) {
            console.log(`[Twilio Mock] 📲 Would check verify SMS for ${phoneNumber} with code ${code}`);
            return { valid: true, mocked: true };
        }

        try {
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
            
            const verificationCheck = await this.client.verify.v2
                .services(this.verifyServiceSid)
                .verificationChecks.create({ to: formattedPhone, code });
                
            console.log(`[Twilio] Verification check status: ${verificationCheck.status}`);
            
            if (verificationCheck.status === 'approved') {
                 return { valid: true };
            } else {
                 return { valid: false, reason: 'Invalid OTP. Please check and try again.' };
            }
        } catch (err) {
            console.error('[Twilio] Failed to check Verify SMS:', err.message);
            if (err.status === 404) {
                 return { valid: false, reason: 'OTP expired or not found. Please request a new one.' };
            }
            throw new Error('Verification failed. Server error.');
        }
    }
}

module.exports = new SmsService();
