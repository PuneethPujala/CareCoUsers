export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';

export const TERMS_CONTENT = [
    {
        title: '1. Acceptance of Terms',
        content: 'By creating an account or using the CareMyMed app, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use the app.'
    },
    {
        title: '2. User Accounts and Verification',
        content: 'You must provide accurate and complete information when registering. You are responsible for safeguarding your credentials (OTP or password) and must notify us immediately of any unauthorized account activity.'
    },
    {
        title: '3. Companion Relationships',
        content: 'Companions are invited by patient care circles to monitor adherence and receive health reports. Patients retain control over their circles and can revoke companion access at any time.'
    },
    {
        title: '4. Acceptable Use Policy',
        content: 'You agree not to use the app for any unlawful activity, to disrupt service operations, or to attempt unauthorized access to patient data.'
    },
    {
        title: '5. Limitation of Liability',
        content: 'CareMyMed is provided "as is" and "as available". We do not warrant uninterrupted or error-free operations and are not liable for any indirect or consequential damages arising from app usage.'
    }
];

export const PRIVACY_CONTENT = [
    {
        title: '1. Data Collection',
        content: 'We collect health profile information, medication names, schedules, adherence logs, vital records, push tokens, and account information required to run the service.'
    },
    {
        title: '2. Data Usage and Sharing',
        content: 'Your health and profile data are shared strictly with your assigned organization/caller and caregivers you explicitly approve. We do not sell user data to third parties.'
    },
    {
        title: '3. Security Practices',
        content: 'All sensitive health data is encrypted in transit and at rest. Access is protected by JSON Web Token (JWT) sessions and Optional Multi-Factor Authentication (MFA).'
    },
    {
        title: '4. Push Notifications',
        content: 'We send push notification alerts for missed medication doses and urgent vitals. You can opt out of push notifications at any time from your account settings.'
    },
    {
        title: '5. Data Retention & Deletion',
        content: 'We retain your personal data as long as your account remains active. You can request account deactivation or download an export of your personal data at any time.'
    }
];
