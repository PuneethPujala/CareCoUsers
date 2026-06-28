export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.1';

export const TERMS_CONTENT = [
    {
        title: '01 Use of Service',
        content: 'CareMyMed grants you a limited, non-exclusive license to access and use the platform for personal health management. You agree not to misuse, reverse-engineer, or redistribute any part of the service. Access may be suspended for violations of these terms. The service is intended for individuals 18 years and older, or minors under guardian supervision. Unauthorized use may result in immediate termination of access without notice or refund.'
    },
    {
        title: '02 Subscription & Billing',
        content: 'CareMyMed offers monthly and annual subscription plans billed automatically at the start of each cycle. Subscriptions renew unless cancelled at least 24 hours before renewal. Refunds are available within 7 days of initial purchase only. You may cancel anytime through account settings. Price changes will be communicated 30 days in advance and apply only to the next billing period.'
    },
    {
        title: '03 Accuracy of Data',
        content: 'Accuracy of data is not guaranteed. While we strive to provide reliable and accurate information, data from connected devices (such as heart rate monitors, SpO₂ sensors, and health trackers) or manual logs may contain discrepancies. CareMyMed also utilizes statistical algorithms and AI forecasting to predict vital sign trends and calculate personal health scores. These features are intended solely for personal wellness tracking and do not constitute clinical diagnostic tools. You are responsible for verifying all information and predictions with licensed healthcare providers. We are not liable for any clinical decisions made based on information or predictions within the app.'
    },
    {
        title: '04 Modifications to Terms',
        content: 'We reserve the right to update these terms at any time. You will be notified via email and in-app notification at least 14 days before significant changes take effect. Continued use of the service after changes constitutes acceptance of the revised terms. Material changes will always require explicit re-acceptance before continued use.'
    },
    {
        title: '05 Privacy & Your Data',
        content: 'Your health data is encrypted at rest and in transit using AES-256 and TLS 1.3. We do not sell personal health information to third parties. If you choose to designate a companion (such as a caregiver, family member, or trusted contact), they will be granted real-time access to view your health profile, medication adherence, sleep, mood logs, and vitals. You explicitly consent to sharing this data with your designated companion. You may revoke or manage companion access at any time through your Profile settings. We process export and deletion requests within 30 days.'
    },
    {
        title: '06 Limitation of Liability',
        content: 'To the maximum extent permitted by law, CareMyMed shall not be liable for any indirect, incidental, or consequential damages from use or inability to use the services. Total aggregate liability shall not exceed the amount paid by you in the 12 months preceding the claim. These limitations apply regardless of the theory of liability.'
    }
];

export const PRIVACY_CONTENT = [
    {
        title: '01 About CareMyMed',
        content: 'CareMyMed is a healthcare and medication management platform designed to help users:\n\n• Track medications and adherence\n• Monitor health vitals\n• Manage appointments and prescriptions\n• Receive medication reminders\n• Receive AI-assisted health insights'
    },
    {
        title: '02 Information We Collect',
        content: '• Personal Identity Information: Full name, Email address, Phone number, Date of birth, Gender, Profile photo, Authentication credentials\n\n• Location Information: City and saved addresses, GPS coordinates, Foreground location access only, Delivery and appointment location data\n\n• Medical & Health Information: Medical conditions, Allergies and blood type, Vaccination records, Medication schedules, Prescription uploads, Vital signs like BP, heart rate, SpO₂\n\n• Device & Notification Information: Push notification tokens, IP address and device identifiers, Session and login activity, Security and audit logs'
    },
    {
        title: '03 How We Use Information',
        content: 'We use the collected information to:\n\n• Provide healthcare and medication management services\n• Authenticate users securely\n• Deliver reminders and notifications\n• Generate AI-powered health insights\n• Support caregivers and companions\n• Maintain platform security and fraud prevention\n• Improve platform functionality and reliability'
    },
    {
        title: '04 Third-Party Services',
        content: 'CareMyMed may use trusted third-party providers including:\n\n• Supabase (Database & Authentication)\n• MongoDB Atlas (Cloud Storage)\n• Twilio (SMS & Calls)\n• Stripe (Payments)\n• Google Sign-In (OAuth)\n• Apple HealthKit (Vitals Integration)\n• Sentry (Error Reporting)\n• Firebase Cloud Messaging (Push Notifications)\n\nWe only share data necessary to provide and improve the Services.'
    },
    {
        title: '05 AI Features & Health Data',
        content: 'Some CareMyMed features use advanced algorithms and artificial intelligence to assist in your health tracking:\n\n• Personal Baseline Engine: Utilizes statistical Z-score calculations over a rolling 30-day historical window of your BP, heart rate, oxygen saturation, sleep, mood, and medication compliance to flag wellness anomalies.\n\n• Vitals Forecasting: Uses predictive machine learning models to forecast future vital sign trends.\n\n• Medical Context & Chat: Interactive caregiver AI features may securely process chat messages and prescription uploads using Optical Character Recognition (OCR).\n\n• Health Scores: Computes daily personalized health wellness scores based on adherence and tracked metrics.'
    },
    {
        title: '06 Data Security',
        content: 'We implement industry-standard safeguards including:\n\n• Encrypted authentication\n• Secure password hashing\n• Role-based access control\n• Session management\n• Audit logging\n• Secure cloud infrastructure\n• Multi-factor authentication support'
    },
    {
        title: '07 Data Retention',
        content: '• Audit logs may be retained up to 7 years\n• Notifications retained for up to 30 days\n• Authentication tokens retained until expiration\n• Account data retained until deletion request'
    },
    {
        title: '08 Your Rights',
        content: '• Access your personal information\n• Correct inaccurate information\n• Delete your account and data\n• Export your information\n• Withdraw consent where applicable\n• Manage caregiver permissions\n• Disable notifications'
    },
    {
        title: '09 Contact Information',
        content: 'CareMyMed Support Team\n• Email: support@caremymed.com\n• Website: caremymed.com\n\nCareMyMed, Health Services\n• Vijayawada, Andhra Pradesh, India\n• Phone: 8121662611'
    }
];
