const twilio = require('twilio');

class SmsService {
    constructor() {
        this.client = null;
        this.isConfigured = false;
        
        try {
            const sid = process.env.TWILIO_ACCOUNT_SID;
            const token = process.env.TWILIO_AUTH_TOKEN;
            this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

            if (sid && token && this.fromNumber) {
                this.client = twilio(sid, token);
                this.isConfigured = true;
            } else {
                console.warn('[Twilio] Missing credentials in .env. SMS will not be sent.');
            }
        } catch (err) {
            console.error('[Twilio] Initialization failed:', err.message);
        }
    }

    /**
     * Send an OTP to a phone number.
     * Overrides for dummy local simulation if unconfigured.
     */
    async sendOTP(phoneNumber, otpCode) {
        if (!this.isConfigured) {
            console.log(`[Twilio Mock] 📲 Would send SMS to ${phoneNumber}: "Your Samvaya verification code is ${otpCode}"`);
            return { success: true, mocked: true };
        }

        try {
            // Formatting safeguard (ensure + is prefixed for E.164 if missing, simplistic approach)
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

            const message = await this.client.messages.create({
                body: `Your Samvaya verification code is: ${otpCode}. It is valid for 10 minutes.`,
                from: this.fromNumber,
                to: formattedPhone
            });

            console.log(`[Twilio] SMS sent successfully. SID: ${message.sid}`);
            return { success: true, sid: message.sid };
        } catch (err) {
            console.error('[Twilio] Failed to send SMS:', err.message);
            throw new Error('Failed to send SMS via Twilio. Check your credentials and quota.');
        }
    }
}

module.exports = new SmsService();
