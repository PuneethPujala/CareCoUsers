const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Master Firebase Configuration
 * 
 * Supports both JSON string from environment and direct file path.
 * In production, it is safer to store the Service Account JSON in a 
 * secure environment variable (FIREBASE_SERVICE_ACCOUNT_JSON).
 */

const initializeFirebase = () => {
    try {
        if (admin.apps.length > 0) return admin;

        let serviceAccount;
        
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } else {
            // Fallback for local development if a file is present
            // console.warn('FIREBASE_SERVICE_ACCOUNT_JSON not found in env, looking for local file...');
            try {
                serviceAccount = require('./firebase-service-account.json');
            } catch (err) {
                console.error('Firebase Service Account key missing. Notifications will fail.');
                return null;
            }
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase Admin initialized successfully');
        return admin;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
        return null;
    }
};

module.exports = initializeFirebase();
