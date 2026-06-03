const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Patient = require('../../models/Patient');
const CallLog = require('../../models/CallLog');
const MedicineLog = require('../../models/MedicineLog');
const VitalLog = require('../../models/VitalLog');
const Caller = require('../../models/Caller');
const Notification = require('../../models/Notification');
const AIVitalPrediction = require('../../models/AIVitalPrediction');
const CompanionAccess = require('../../models/CompanionAccess');
const logger = require('../../utils/logger');
const { getOrCreatePatient, createBasicPatient, findOrCreatePatientRecord } = require('../../utils/patientHelpers');
const { authenticateSession } = require('../../middleware/authenticate');
const { validateObjectId } = require('../../middleware/validateObjectId');
const { computeHealthScore } = require('../../services/healthScoreService');

const router = express.Router();

// SEC-FIX: Block companions from accessing patient mutation/settings routes
router.use((req, res, next) => {
    if (req.profile && req.profile.role === 'companion') {
        return res.status(403).json({ error: 'Companions cannot access or mutate patient records directly. Use the companion APIs.' });
    }
    next();
});

/**
 * Refresh the healthScoreCache on the patient document.
 * Called fire-and-forget from any mutating endpoint so admin queries stay fresh.
 * Does NOT block the response.
 */
async function refreshHealthScoreCache(patientId) {
    try {
        const patient = await Patient.findById(patientId);
        if (!patient) return;

        // 7-day adherence rate
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const logs = await MedicineLog.find({ patient_id: patientId, date: { $gte: weekAgo } });
        let adherenceRate = null;
        if (logs.length > 0) {
            const taken = logs.filter(l => l.status === 'taken').length;
            adherenceRate = (taken / logs.length) * 100;
        }

        // Latest vitals
        const latestVital = await VitalLog.findOne({ patient_id: patientId }).sort({ recorded_at: -1 }).lean();

        const result = computeHealthScore(patient.toObject(), adherenceRate, latestVital);
        await Patient.updateOne(
            { _id: patientId },
            { $set: { healthScoreCache: result.score, healthScoreUpdatedAt: new Date() } }
        );
    } catch (err) {
        logger.warn('Failed to refresh health score cache', { error: err.message, patientId });
    }
}

// ─── Subscription & Onboarding ────────────────────────────────────────────────

async function subscribeAndSeedDemoData(patient, planId) {
    const isActive = patient.subscription?.status === 'active';
    const isExpired = patient.subscription?.expires_at && new Date(patient.subscription.expires_at) < new Date();

    const isTest = process.env.NODE_ENV === 'test';
    const session = isTest ? null : await mongoose.startSession();
    if (session) session.startTransaction();

    try {
        const orgId = patient.organization_id || new mongoose.Types.ObjectId('674f07e1525049b7348908f9');

        // Map plan pricing correctly
        const planAmounts = {
            'premium_monthly': 499,
            'premium_annual': 4199,
            'basic': 99,
        };
        const resolvedPlan = planId || patient.pending_plan || 'basic';
        const amount = planAmounts[resolvedPlan] || 499;
        const durationDays = resolvedPlan === 'premium_annual' ? 365 : 30;
        
        let newExpiresAt;
        if (isActive && !isExpired && patient.subscription?.expires_at) {
            // Stack the days on top of the current remaining days
            newExpiresAt = new Date(new Date(patient.subscription.expires_at).getTime() + (durationDays * 86400000));
        } else {
            // Start fresh from today
            newExpiresAt = new Date(Date.now() + durationDays * 86400000);
        }

        const subscriptionUpdates = {
            'subscription.status': 'active',
            'subscription.plan': resolvedPlan,
            'subscription.amount': amount,
            'subscription.payment_date': new Date(),
            'subscription.expires_at': newExpiresAt,
            'subscription.next_billing': newExpiresAt,
            paid: 1,
        };
        
        if (!isActive || isExpired) {
            subscriptionUpdates['subscription.started_at'] = new Date();
        }

        await Patient.updateOne({ _id: patient._id }, { $set: subscriptionUpdates }, { session });

        const Profile = require('../../models/Profile');
        const manager = await Profile.findOne({
            organization_id: orgId,
            role: { $in: ['manager', 'admin', 'super_admin', 'care manager'] },
        }).session(session);

        if (manager && !patient.assigned_manager_id) {
            await Patient.updateOne({ _id: patient._id }, { $set: { assigned_manager_id: manager._id } }, { session });
            
            const Alert = require('../../models/Alert');
            await Alert.create([{
                type: 'team_lead_recommended',
                patient_id: patient._id,
                manager_id: manager._id,
                organization_id: orgId,
                description: `New patient "${patient.name || patient.email}" subscribed. Needs caregiver assignment.`,
                auto_generated: true,
                status: 'open',
            }], { session });
        }

        await Notification.create([{
            patient_id: patient._id,
            type: 'system',
            title: 'Welcome to CareMyMed! 🎉',
            message: 'Your account is now active. Explore the app while we appoint your dedicated caregiver.',
            target_screen: 'HealthProfile',
        }], { session });

        if (session) await session.commitTransaction();
        logger.info('Subscription activated atomically', { patientId: patient._id, plan: subscriptionUpdates['subscription.plan'] });

        if (patient.expo_push_token) {
            const PushNotificationService = require('../../utils/pushNotifications');
            PushNotificationService.sendPush(
                patient.expo_push_token,
                'Welcome to CareMyMed! 🎉',
                'Your account is now active.'
            ).catch(err => logger.warn('Push notification failed', { error: err.message }));
        }

        return await Patient.findById(patient._id);
    } catch (error) {
        if (session) await session.abortTransaction();
        logger.error('Subscription transaction aborted', { error: error.message, patientId: patient._id });
        throw error;
    } finally {
        if (session) session.endSession();
    }
}

// ─── Public endpoints ─────────────────────────────────────────────────────────

router.get('/cities', async (req, res) => {
    try {
        const City = require('../../models/City');
        let cities = await City.find({ isActive: true }).sort('name');

        if (cities.length === 0) {
            const seedCities = [
                { name: 'Hyderabad', state: 'Telangana', isActive: true },
                { name: 'Bengaluru', state: 'Karnataka', isActive: true },
                { name: 'Chennai', state: 'Tamil Nadu', isActive: true },
                { name: 'Mumbai', state: 'Maharashtra', isActive: true },
                { name: 'Delhi', state: 'Delhi', isActive: true },
            ];
            await City.insertMany(seedCities);
            cities = await City.find({ isActive: true }).sort('name');
        }
        res.json({ cities });
    } catch (error) {
        logger.error('Get cities error', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
});

router.get('/location/reverse', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) return res.status(400).json({ error: 'Latitude and longitude are required' });

        const fetch = global.fetch || require('node-fetch');
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
            { headers: { 'User-Agent': 'CareMyMed-Backend/1.0' } }
        );
        const data = await response.json();
        res.json(data);
    } catch (error) {
        logger.error('Reverse geocoding error', { error: error.message });
        res.status(500).json({ error: 'Failed to geocode location' });
    }
});

router.get('/location/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Search query is required' });

        const fetch = global.fetch || require('node-fetch');
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=in&limit=5`,
            { headers: { 'User-Agent': 'CareMyMed-Backend/1.0' } }
        );
        const data = await response.json();
        const results = data.map(item => ({
            id: item.place_id,
            display_name: item.display_name,
            name: item.name || item.address?.suburb || item.address?.neighbourhood || item.address?.city_district || item.address?.city,
            city: item.address?.city || item.address?.town || item.address?.village,
            state: item.address?.state,
            pincode: item.address?.postcode,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
        }));
        res.json({ results });
    } catch (error) {
        logger.error('Location search error', { error: error.message });
        res.status(500).json({ error: 'Failed to search location' });
    }
});

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * POST /api/users/patients/subscribe
 *
 * FIX 1: The client sends { plan, paid } but the route destructured { planId, paymentId }.
 *   'plan' was never read → patient.pending_plan was never set → subscribeAndSeedDemoData
 *   always activated the 'basic' plan regardless of what the user selected.
 *   Fixed: accept both 'plan' and 'planId' for compatibility.
 *
 * FIX 2: The paymentId gate (if (!paymentId && paid === 1) return 400) rejected every
 *   legitimate subscription because the UPI mock flow never sends a paymentId.
 *   The gate is now only enforced when PAYMENT_GATEWAY_ENABLED env flag is set,
 *   so it's a no-op in the current mock flow but activates automatically when a
 *   real payment gateway is wired up.
 */
router.post('/subscribe', authenticateSession, async (req, res) => {
    try {
        // FIX 1: accept 'plan' (what the client sends) or 'planId' (legacy)
        const { paid, plan, planId, paymentId } = req.body;
        const resolvedPlanId = plan || planId || 'basic';

        let patient = await getOrCreatePatient(req);

        // FIX 2: Only enforce paymentId when a real gateway is configured.
        // The UPI mock flow never sends a paymentId — blocking on it would
        // reject every subscription in the current architecture.
        if (process.env.PAYMENT_GATEWAY_ENABLED === 'true' && !paymentId && paid === 1) {
            return res.status(400).json({ error: 'Payment verification failed. No payment ID provided.' });
        }

        // Update metadata regardless of current status (handles partially recorded attempts)
        if (paid !== undefined) patient.paid = paid;
        if (resolvedPlanId) patient.pending_plan = resolvedPlanId;

        // We no longer block active users from subscribing.
        // If they are already active, we just stack their days in `subscribeAndSeedDemoData`.

        patient = await subscribeAndSeedDemoData(patient, resolvedPlanId);

        res.json({ success: true, patient, message: `Successfully subscribed to ${resolvedPlanId} plan.` });
    } catch (error) {
        logger.error('Subscription endpoint error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to process subscription' });
    }
});

// ─── Addresses ────────────────────────────────────────────────────────────────

router.get('/me/addresses', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        res.json({ saved_addresses: patient.saved_addresses || [] });
    } catch (error) {
        logger.error('Get addresses error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get saved addresses' });
    }
});

router.post('/me/addresses', authenticateSession, async (req, res) => {
    try {
        const { label, title, address_line, flat_no, street, city, state, postcode, lat, lon } = req.body;
        const patient = await getOrCreatePatient(req);
        const newAddress = { label, title, address_line, flat_no, street, city, state, postcode, lat, lon };
        await Patient.updateOne({ _id: patient._id }, { $push: { saved_addresses: newAddress } });
        req.patient = await Patient.findById(patient._id);
        logger.info('Address added', { patientId: patient._id, label });
        res.status(201).json({ saved_addresses: req.patient.saved_addresses, message: 'Address saved successfully' });
    } catch (error) {
        logger.error('Add address error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to save address' });
    }
});

router.put('/me/addresses/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const { label, title, address_line, flat_no, street, city, state, postcode, lat, lon } = req.body;
        const patient = await getOrCreatePatient(req);
        const updates = {};
        if (label !== undefined) updates['saved_addresses.$.label'] = label;
        if (title !== undefined) updates['saved_addresses.$.title'] = title;
        if (address_line !== undefined) updates['saved_addresses.$.address_line'] = address_line;
        if (flat_no !== undefined) updates['saved_addresses.$.flat_no'] = flat_no;
        if (street !== undefined) updates['saved_addresses.$.street'] = street;
        if (city !== undefined) updates['saved_addresses.$.city'] = city;
        if (state !== undefined) updates['saved_addresses.$.state'] = state;
        if (postcode !== undefined) updates['saved_addresses.$.postcode'] = postcode;
        if (lat !== undefined) updates['saved_addresses.$.lat'] = lat;
        if (lon !== undefined) updates['saved_addresses.$.lon'] = lon;
        const result = await Patient.updateOne(
            { _id: patient._id, 'saved_addresses._id': req.params.id },
            { $set: updates }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Address not found' });
        req.patient = await Patient.findById(patient._id);
        logger.info('Address updated', { patientId: patient._id, addressId: req.params.id });
        res.json({ saved_addresses: req.patient.saved_addresses, message: 'Address updated successfully' });
    } catch (error) {
        logger.error('Update address error', { error: error.message, addressId: req.params.id });
        res.status(500).json({ error: 'Failed to update address' });
    }
});

router.delete('/me/addresses/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        await Patient.updateOne({ _id: patient._id }, { $pull: { saved_addresses: { _id: req.params.id } } });
        req.patient = await Patient.findById(patient._id);
        logger.info('Address deleted', { patientId: patient._id, addressId: req.params.id });
        res.json({ saved_addresses: req.patient.saved_addresses, message: 'Address deleted successfully' });
    } catch (error) {
        logger.error('Delete address error', { error: error.message, addressId: req.params.id });
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

// ─── Core profile ─────────────────────────────────────────────────────────────

router.get('/me', authenticateSession, async (req, res) => {
    try {
        let patient = await getOrCreatePatient(req);
        const withHash = await Patient.findById(patient._id).select('+passwordHash');
        const patientObj = patient.toObject();
        patientObj.hasPassword = !!withHash?.passwordHash;

        // Fetch active companions from the decoupled relationship collection
        const companionAccesses = await CompanionAccess.find({
            patient_id: patient._id,
            is_active: true,
            status: 'accepted'
        }).populate('companion_id');

        // Map back to the expected array format for transparent backward compatibility
        patientObj.companions = companionAccesses.map(access => ({
            _id: access._id,
            profile_id: access.companion_id,
            joined_at: access.joined_at,
            notification_preferences: access.notification_preferences,
            is_active: access.is_active,
            access_level: access.access_level,
            permissions: access.permissions,
            status: access.status
        }));

        res.json({ patient: patientObj });
    } catch (error) {
        logger.error('Get patient profile error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to fetch or initialize patient profile' });
    }
});

router.put('/me', authenticateSession, async (req, res) => {
    try {
        const {
            name, city, date_of_birth, phone, gender, blood_type, language,
            push_notifications_enabled, medication_reminders_enabled,
            expo_push_token, profile_complete,
            device_platform, device_name, app_version,
            acceptedTermsVersion, acceptedPrivacyVersion, acceptedAt,
            avatar_url
        } = req.body;

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (city !== undefined) updates.city = city;
        if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
        if (phone !== undefined) updates.phone = phone;
        if (gender !== undefined) updates.gender = gender;
        if (blood_type !== undefined) {
            const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
            if (!validBloodTypes.includes(blood_type)) {
                return res.status(400).json({ error: 'Invalid blood type provided' });
            }
            updates.blood_type = blood_type;
        }
        if (language !== undefined) updates.language = language;
        if (push_notifications_enabled !== undefined) updates.push_notifications_enabled = push_notifications_enabled;
        if (medication_reminders_enabled !== undefined) updates.medication_reminders_enabled = medication_reminders_enabled;
        if (expo_push_token !== undefined) {
            updates.expo_push_token = expo_push_token;
            updates.last_token_update = new Date();
        }
        if (device_platform !== undefined) updates.device_platform = device_platform;
        if (device_name !== undefined) updates.device_name = device_name;
        if (app_version !== undefined) updates.app_version = app_version;
        if (profile_complete !== undefined) updates.profile_complete = profile_complete;
        if (acceptedTermsVersion !== undefined) updates.acceptedTermsVersion = acceptedTermsVersion;
        if (acceptedPrivacyVersion !== undefined) updates.acceptedPrivacyVersion = acceptedPrivacyVersion;
        if (acceptedAt !== undefined) updates.acceptedAt = acceptedAt;
        if (avatar_url !== undefined) updates.avatar_url = avatar_url;

        const patient = await getOrCreatePatient(req, name);
        await Patient.updateOne({ _id: patient._id }, { $set: updates });
        req.patient = await Patient.findById(patient._id);
        logger.info('Profile updated', { patientId: patient._id, body: req.body });

        // Only send the connection success notification if the patient did not have a token previously.
        // This prevents spamming the user on daily app launches, preview updates, or normal token rotations.
        if (expo_push_token && !patient.expo_push_token) {
            const PushNotificationService = require('../../utils/pushNotifications');
            PushNotificationService.sendPush(
                expo_push_token,
                'Push Notifications Connected! 🔔',
                `Hi ${(patient.name || '').split(' ')[0] || 'there'}, you will now receive live alerts.`
            ).catch(err => logger.warn('Failed to send push connection notification', { error: err.message }));
        }

        res.json({ patient: req.patient, message: 'Profile updated successfully' });
    } catch (error) {
        logger.error('Update patient profile error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ─── Health Profile ───────────────────────────────────────────────────────────

router.get('/me/profile', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const patientObj = patient.toObject();

        // Merge top-level legacy fields with the actual lifestyle subdocument.
        const savedLifestyle = patientObj.lifestyle || {};
        patientObj.lifestyle = {
            height_cm: savedLifestyle.height_cm ?? patientObj.height_cm,
            weight_kg: savedLifestyle.weight_kg ?? patientObj.weight_kg,
            smoking_status: savedLifestyle.smoking_status ?? patientObj.smoking_status,
            alcohol_use: savedLifestyle.alcohol_use ?? patientObj.alcohol_use,
            exercise_frequency: savedLifestyle.exercise_frequency ?? patientObj.exercise_frequency,
            mobility_level: savedLifestyle.mobility_level ?? patientObj.mobility_level,
            mobility_aids: savedLifestyle.mobility_aids || [],
            dietary_restrictions: savedLifestyle.dietary_restrictions || [],
            device_sync_status: savedLifestyle.device_sync_status || null,
        };
        patientObj.gp = { name: patientObj.gp_name, phone: patientObj.gp_phone, email: patientObj.gp_email };

        // ── Compute live health score ──────────────────────────────────────────
        // 30-day adherence rate from MedicineLog (uses medicines[].taken boolean)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [logs, latestVital] = await Promise.all([
            MedicineLog.find({ patient_id: patient._id, date: { $gte: thirtyDaysAgo } }).lean(),
            VitalLog.findOne({ patient_id: patient._id }).sort({ recorded_at: -1 }).lean(),
        ]);

        let adherenceRate = null;
        if (logs.length > 0) {
            let totalMeds = 0;
            let takenMeds = 0;
            for (const log of logs) {
                const active = (log.medicines || []).filter(m => m.is_active !== false);
                totalMeds += active.length;
                takenMeds += active.filter(m => m.taken).length;
            }
            if (totalMeds > 0) {
                adherenceRate = (takenMeds / totalMeds) * 100;
            }
        }

        const healthScore = computeHealthScore(patientObj, adherenceRate, latestVital);
        patientObj.health_score = healthScore;

        // Write to cache asynchronously — don't block the response
        Patient.updateOne(
            { _id: patient._id },
            { $set: { healthScoreCache: healthScore.score, healthScoreUpdatedAt: new Date() } }
        ).catch(e => logger.warn('Health score cache write failed', { error: e.message }));
        // ─────────────────────────────────────────────────────────────────────

        res.json(patientObj);
    } catch (err) {
        logger.error('Profile fetch error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

const updateProfileArray = (field) => async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        if (req.body._id) {
            const updates = {};
            for (const [key, value] of Object.entries(req.body)) {
                if (key !== '_id') updates[`${field}.$.${key}`] = value;
            }
            await Patient.updateOne({ _id: patient._id, [`${field}._id`]: req.body._id }, { $set: updates });
        } else {
            await Patient.updateOne({ _id: patient._id }, { $push: { [field]: req.body } });
        }
        req.patient = await Patient.findById(patient._id);
        logger.info(`${field} updated`, { patientId: patient._id });
        // Refresh health score cache in background
        refreshHealthScoreCache(patient._id).catch(() => {});
        res.json({ message: `${field} updated`, patient: req.patient });
    } catch (err) {
        logger.error(`Update ${field} error`, { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
};

router.put('/me/conditions', authenticateSession, updateProfileArray('conditions'));
router.put('/me/allergies', authenticateSession, updateProfileArray('allergies'));
router.put('/me/vaccinations', authenticateSession, updateProfileArray('vaccinations'));
router.put('/me/appointments', authenticateSession, updateProfileArray('appointments'));
router.put('/me/medical-history', authenticateSession, updateProfileArray('medical_history'));

router.post('/me/prescriptions', authenticateSession, async (req, res) => {
    try {
        const { file_base64, content_type } = req.body;
        if (!file_base64) return res.status(400).json({ error: 'file_base64 is required' });

        const patient = await getOrCreatePatient(req);
        const { createClient } = require('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Supabase configuration missing on server' });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const buffer = Buffer.from(file_base64, 'base64');
        const ext = content_type === 'image/png' ? 'png' : 'jpg';
        const randomHash = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const fileName = `${patient.supabase_uid}/${randomHash}.${ext}`;
        const { data, error } = await supabaseAdmin.storage
            .from('prescriptions')
            .upload(fileName, buffer, { contentType: content_type || 'image/jpeg' });

        if (error) {
            logger.error('Supabase upload error', { error: error.message, patientId: patient._id });
            return res.status(500).json({ error: 'Failed to upload: ' + error.message });
        }

        const publicUrl = supabaseAdmin.storage.from('prescriptions').getPublicUrl(fileName).data.publicUrl;
        patient.uploaded_prescriptions.push({ file_url: publicUrl, file_name: fileName });
        await patient.save();
        res.status(201).json({ message: 'Prescription uploaded successfully', uploaded_prescriptions: patient.uploaded_prescriptions });
    } catch (err) {
        logger.error('Upload prescription error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

router.post('/me/avatar', authenticateSession, async (req, res) => {
    try {
        const { file_base64, content_type } = req.body;
        if (!file_base64) return res.status(400).json({ error: 'file_base64 is required' });

        const patient = await getOrCreatePatient(req);
        const { createClient } = require('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Supabase configuration missing on server' });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const buffer = Buffer.from(file_base64, 'base64');
        const ext = content_type === 'image/png' ? 'png' : 'jpg';
        const randomHash = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const fileName = `${patient.supabase_uid || patient._id}/${randomHash}.${ext}`;

        const { data, error } = await supabaseAdmin.storage
            .from('avatars')
            .upload(fileName, buffer, { contentType: content_type || 'image/jpeg', upsert: true });

        if (error) {
            logger.error('Supabase avatar upload error', { error: error.message, patientId: patient._id });
            return res.status(500).json({ error: 'Failed to upload avatar: ' + error.message });
        }

        const publicUrl = supabaseAdmin.storage.from('avatars').getPublicUrl(fileName).data.publicUrl;

        // Proactively delete old avatar from Supabase Storage if it exists
        if (patient.avatar_url) {
            try {
                const marker = `/public/avatars/`;
                const idx = patient.avatar_url.indexOf(marker);
                if (idx !== -1) {
                    const oldFilePath = decodeURIComponent(patient.avatar_url.substring(idx + marker.length));
                    await supabaseAdmin.storage.from('avatars').remove([oldFilePath]);
                }
            } catch (delErr) {
                logger.warn('Failed to delete old avatar file', { error: delErr.message, patientId: patient._id });
            }
        }

        patient.avatar_url = publicUrl;
        await patient.save();

        res.status(200).json({ message: 'Avatar uploaded successfully', avatar_url: publicUrl, patient });
    } catch (err) {
        logger.error('Upload avatar error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

router.put('/me/lifestyle', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const { height_cm, weight_kg, smoking_status, alcohol_use, exercise_frequency, mobility_level, mobility_aids, dietary_restrictions, device_sync_status } = req.body;
        if (!patient.lifestyle) patient.lifestyle = {};
        if (height_cm !== undefined) patient.lifestyle.height_cm = height_cm;
        if (weight_kg !== undefined) patient.lifestyle.weight_kg = weight_kg;
        if (smoking_status !== undefined) patient.lifestyle.smoking_status = smoking_status;
        if (alcohol_use !== undefined) patient.lifestyle.alcohol_use = alcohol_use;
        if (exercise_frequency !== undefined) patient.lifestyle.exercise_frequency = exercise_frequency;
        if (mobility_level !== undefined) patient.lifestyle.mobility_level = mobility_level;
        if (mobility_aids !== undefined) patient.lifestyle.mobility_aids = mobility_aids;
        if (dietary_restrictions !== undefined) patient.lifestyle.dietary_restrictions = dietary_restrictions;
        if (device_sync_status !== undefined) patient.lifestyle.device_sync_status = device_sync_status;
        
        patient.markModified('lifestyle');
        await patient.save();
        // Refresh health score cache in background
        refreshHealthScoreCache(patient._id).catch(() => {});
        res.json({ message: 'Lifestyle updated', patient });
    } catch (err) {
        logger.error('Update lifestyle error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

router.put('/me/primary-doctor', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const { gp_name, gp_phone, gp_email, name, phone, email } = req.body;
        if (gp_name !== undefined || name !== undefined) patient.gp_name = gp_name || name;
        if (gp_phone !== undefined || phone !== undefined) patient.gp_phone = gp_phone || phone;
        if (gp_email !== undefined || email !== undefined) patient.gp_email = gp_email || email;
        await patient.save();
        res.json({ message: 'Primary doctor updated', patient });
    } catch (err) {
        logger.error('Update gp error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

const deleteProfileItem = (dbCollection, responseKey) => async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const item = patient[dbCollection].id(req.params.id);
        if (item) {
            patient[dbCollection].pull(req.params.id);
            await patient.save();
            res.json({ message: 'Item deleted', [responseKey]: patient[dbCollection] });
        } else {
            res.status(404).json({ error: 'Item not found' });
        }
    } catch (err) {
        logger.error(`Delete ${dbCollection} error`, { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
};

router.delete('/me/conditions/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('conditions', 'conditions'));
router.delete('/me/allergies/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('allergies', 'allergies'));
router.delete('/me/vaccinations/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('vaccinations', 'vaccinations'));
router.delete('/me/appointments/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('appointments', 'appointments'));
router.delete('/me/medical-history/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('medical_history', 'medical_history'));
router.delete('/me/history/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('medical_history', 'medical_history'));
router.delete('/me/medications/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('medications', 'medications'));
router.delete('/me/trusted-contacts/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('trusted_contacts', 'trusted_contacts'));
router.delete('/me/contact/:id', authenticateSession, validateObjectId('id'), deleteProfileItem('trusted_contacts', 'trusted_contacts'));

// ─── Emergency Contact ────────────────────────────────────────────────────────

/**
 * PUT /api/users/patients/me/emergency-contact
 *
 * FIX 3 (CRITICAL): The original logic first set all is_emergency flags to false,
 *   then re-fetched the patient, then tried to find a contact with is_emergency===true.
 *   Since the update cleared the flag, the find always returned null → the code
 *   always took the "push new contact" branch instead of updating the existing one.
 *   Result: unlimited duplicate emergency contacts on every save.
 *
 *   Fixed by finding the existing emergency contact BEFORE clearing the flag,
 *   then using that _id for the targeted update.
 */
router.put('/me/emergency-contact', authenticateSession, async (req, res) => {
    try {
        const { name, phone, relation } = req.body;
        const patient = await getOrCreatePatient(req);

        if (!name && !phone) {
            await Patient.updateOne({ _id: patient._id }, { $pull: { trusted_contacts: { is_emergency: true } } });
        } else {
            // FIX: find the existing emergency contact BEFORE clearing the flag.
            // The original cleared first, re-fetched, then tried to find — always null.
            const existingEmergencyContact = patient.trusted_contacts.find(c => c.is_emergency);

            if (existingEmergencyContact) {
                // Update the existing emergency contact in place
                await Patient.updateOne(
                    { _id: patient._id, 'trusted_contacts._id': existingEmergencyContact._id },
                    {
                        $set: {
                            'trusted_contacts.$.name': name,
                            'trusted_contacts.$.phone': phone,
                            'trusted_contacts.$.relation': relation,
                            'trusted_contacts.$.is_emergency': true,
                        },
                    }
                );
            } else {
                // No existing emergency contact — add a new one
                await Patient.updateOne(
                    { _id: patient._id },
                    { $push: { trusted_contacts: { name, phone, relation, is_emergency: true, is_primary: true } } }
                );
            }
        }

        req.patient = await Patient.findById(patient._id);
        logger.info('Emergency contact updated', { patientId: patient._id });
        res.json({ patient: req.patient, message: 'Emergency contact updated successfully' });
    } catch (error) {
        logger.error('Update emergency contact error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to update emergency contact' });
    }
});

// ─── Family Companion Access ──────────────────────────────────────────────────

/**
 * POST /api/users/patients/me/invite-code
 * Generates a single-use 6-character invite code valid for 24 hours.
 */
router.post('/me/invite-code', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        
        // Generate a clean 6-char alphanumeric code (excluding confusing chars like 0/O, 1/I)
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        let isUnique = false;
        
        while (!isUnique) {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const existing = await Patient.findOne({ invite_code: code, invite_code_expires_at: { $gt: new Date() } });
            if (!existing) isUnique = true;
        }

        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

        await Patient.updateOne(
            { _id: patient._id },
            { $set: { invite_code: code, invite_code_expires_at: expiresAt } }
        );

        logger.info('Companion invite code generated', { patientId: patient._id });
        res.json({ success: true, invite_code: code, expires_at: expiresAt });
    } catch (error) {
        logger.error('Generate invite code error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to generate invite code' });
    }
});

/**
 * DELETE /api/users/patients/me/companions/:id
 * Revokes a companion's access to this patient's data.
 */
router.delete('/me/companions/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const companionId = req.params.id; // This is the Profile ID of the companion

        // Soft-deactivate the relationship inside the CompanionAccess mapping table
        await CompanionAccess.updateOne(
            { companion_id: companionId, patient_id: patient._id },
            { 
                is_active: false, 
                status: 'revoked', 
                revoked_at: new Date(), 
                revoked_by: req.profile._id 
            }
        );
        
        // FUTURE: In a robust setup, you might want to force-logout the companion here
        // by invalidating their RefreshTokens in the DB.

        logger.info('Companion access revoked', { patientId: patient._id, companionId });
        res.json({ success: true, message: 'Companion access revoked successfully.' });
    } catch (error) {
        logger.error('Revoke companion error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to revoke companion access' });
    }
});

// ─── Trusted Contacts ─────────────────────────────────────────────────────────

router.get('/me/trusted-contacts', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        res.json({ trusted_contacts: patient.trusted_contacts || [] });
    } catch (error) {
        logger.error('Get trusted contacts error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get trusted contacts' });
    }
});

router.post('/me/trusted-contacts', authenticateSession, async (req, res) => {
    try {
        const { name, phone, relation, email, is_primary, is_emergency, can_view_data, permissions } = req.body;
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });
        if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) return res.status(400).json({ error: 'Valid phone number is required' });

        const patient = await getOrCreatePatient(req);
        if (is_emergency) {
            patient.trusted_contacts.forEach(c => { c.is_emergency = false; });
        }
        patient.trusted_contacts.push({
            name, phone, relation, email,
            is_primary: is_primary || is_emergency,
            is_emergency: !!is_emergency,
            can_view_data: !!can_view_data,
            permissions: permissions || [],
        });
        await patient.save();

        // Seam 4: Send warm caregiver invitation SMS (fire-and-forget)
        try {
            const smsService = require('../../services/smsService');
            const patientName = patient.name || 'Someone';
            const caregiverFirstName = name.split(' ')[0];
            const warmMessage = `Hi ${caregiverFirstName} — ${patientName} has added you to their trusted care circle on CareMyMed. They'd love for you to be quietly kept in the loop regarding their health. Tap here to connect: https://caremymed.app/invite`;
            smsService.sendMessage(phone, warmMessage).catch(e =>
                logger.warn('Caregiver invite SMS failed (non-critical)', { error: e.message })
            );
        } catch (smsErr) {
            // Non-critical — never block the response
            logger.warn('Caregiver invite SMS setup failed', { error: smsErr.message });
        }

        res.status(201).json({ trusted_contacts: patient.trusted_contacts, message: 'Trusted contact added successfully' });
    } catch (error) {
        logger.error('Add trusted contact error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to add trusted contact' });
    }
});

router.put('/me/trusted-contacts/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const { name, phone, relation, email, is_primary, is_emergency, can_view_data, permissions } = req.body;
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });
        if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) return res.status(400).json({ error: 'Valid phone number is required' });

        const patient = await getOrCreatePatient(req);
        if (is_emergency) {
            await Patient.updateOne(
                { _id: patient._id, 'trusted_contacts.is_emergency': true, 'trusted_contacts._id': { $ne: req.params.id } },
                { $set: { 'trusted_contacts.$.is_emergency': false } }
            );
        }

        const updates = {};
        if (name !== undefined) updates['trusted_contacts.$.name'] = name;
        if (phone !== undefined) updates['trusted_contacts.$.phone'] = phone;
        if (relation !== undefined) updates['trusted_contacts.$.relation'] = relation;
        if (email !== undefined) updates['trusted_contacts.$.email'] = email;
        if (is_primary !== undefined) updates['trusted_contacts.$.is_primary'] = is_primary;
        if (is_emergency !== undefined) updates['trusted_contacts.$.is_emergency'] = is_emergency;
        if (can_view_data !== undefined) updates['trusted_contacts.$.can_view_data'] = can_view_data;
        if (permissions !== undefined) updates['trusted_contacts.$.permissions'] = permissions;

        const result = await Patient.updateOne(
            { _id: patient._id, 'trusted_contacts._id': req.params.id },
            { $set: updates }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Contact not found' });

        req.patient = await Patient.findById(patient._id);
        logger.info('Trusted contact updated', { patientId: patient._id, contactId: req.params.id });
        res.json({ trusted_contacts: req.patient.trusted_contacts, message: 'Contact updated successfully' });
    } catch (error) {
        logger.error('Update trusted contact error', { error: error.message, contactId: req.params.id });
        res.status(500).json({ error: 'Failed to update contact' });
    }
});

// ─── Caller & Calls ───────────────────────────────────────────────────────────

router.get('/me/caller', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        let caller = null;

        if (patient.assigned_caller_id) {
            caller = await Caller.findById(patient.assigned_caller_id)
                .select('name employee_id profile_photo_url languages_spoken experience_years phone city last_active_at current_call_id');
        }

        // Populate manager data if assigned
        let manager = null;
        if (patient.assigned_manager_id) {
            const Profile = require('../../models/Profile');
            manager = await Profile.findById(patient.assigned_manager_id)
                .select('fullName phone email profile_photo_url languages_spoken experience_years');
        }

        if (!caller) {
            caller = await Caller.findOne({ patient_ids: patient._id, is_active: true })
                .select('name employee_id profile_photo_url languages_spoken experience_years phone city last_active_at current_call_id');
            if (caller) {
                await Patient.updateOne({ _id: patient._id }, { $set: { assigned_caller_id: caller._id } });
                req.patient = await Patient.findById(patient._id);
                logger.info('Synced assigned_caller_id', { patientId: patient._id, callerId: caller._id });
            }
        }

        const getDerivedAvailability = (c) => {
            if (!c) return 'offline';
            const now = new Date();
            const activeThreshold = 2 * 60 * 1000; // 2 minutes
            const awayThreshold = 10 * 60 * 1000; // 10 minutes

            const diff = now - (c.last_active_at || 0);

            if (c.current_call_id) {
                return 'busy';
            }
            if (diff < activeThreshold) {
                return 'available';
            }
            if (diff < awayThreshold) {
                return 'away';
            }
            return 'offline';
        };

        let mappedCaller = null;
        if (caller) {
            mappedCaller = typeof caller.toJSON === 'function' ? caller.toJSON() : { ...caller };
            mappedCaller.availability = getDerivedAvailability(caller);

            const statsResult = await CallLog.aggregate([
                { $match: { patientId: patient._id, caretakerId: caller._id } },
                {
                    $group: {
                        _id: null,
                        totalCalls: { $sum: 1 },
                        completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                        totalDuration: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$duration', 0] } }
                    }
                }
            ]);

            if (statsResult.length > 0) {
                const s = statsResult[0];
                mappedCaller.stats = {
                    totalCalls: s.totalCalls,
                    avgDuration: s.completedCalls > 0 ? Math.round(s.totalDuration / s.completedCalls) : 0,
                    answeredPercent: s.totalCalls > 0 ? Math.round((s.completedCalls / s.totalCalls) * 100) : 0
                };
            } else {
                mappedCaller.stats = {
                    totalCalls: 0,
                    avgDuration: 0,
                    answeredPercent: 0
                };
            }
        }

        res.json({ caller: mappedCaller || null, manager: manager || null });
    } catch (error) {
        logger.error('Get assigned caller error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get assigned caller' });
    }
});

/**
 * GET /api/users/patients/me/calls
 *
 * FIX 4: parseInt(page) and parseInt(limit) on arbitrary query strings can return
 *   NaN, which Mongoose passes through and throws. Explicit defaults + bounds added.
 */
router.get('/me/calls', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);

        // FIX: coerce and bound pagination params to prevent NaN reaching Mongoose
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const [calls, total] = await Promise.all([
            CallLog.find({ patientId: patient._id })
                .sort({ scheduledTime: -1 })
                .skip(skip)
                .limit(limit)
                .populate('caretakerId', 'name profile_photo_url'),
            CallLog.countDocuments({ patientId: patient._id }),
        ]);

        // Map the new schema fields back to what the mobile app expects
        const mappedCalls = calls.map(c => ({
            _id: c._id,
            patient_id: c.patientId,
            caller_id: c.caretakerId,
            call_date: c.scheduledTime,
            call_duration_seconds: c.duration,
            status: c.status,
            ai_summary: c.notes,
            created_at: c.createdAt
        }));

        res.json({
            calls: mappedCalls,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        logger.error('Get patient calls error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get call history' });
    }
});

// ─── Telehealth Calling & Sessions ──────────────────────────────────────────────

/**
 * GET /api/users/patients/me/agora-token
 * Dynamic Agora token builder with 503 production protection
 */
router.get('/me/agora-token', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        // Verify paid subscription
        if (patient.subscription_status !== 'active' && patient.subscription_tier === 'free') {
            return res.status(403).json({ error: 'Voice calling is a premium feature. Please upgrade your subscription.' });
        }

        const appId = process.env.AGORA_APP_ID;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE;

        if (!appId || !appCertificate) {
            if (process.env.NODE_ENV === 'development') {
                logger.warn('[Agora] Missing credentials, returning mock credentials in development.');
                return res.json({ token: 'mock-token', uid: 0, appId: 'mock-app-id' });
            } else {
                logger.warn('[Agora] Credentials missing in production. Disabling calling.');
                return res.status(503).json({
                    voice_calling_enabled: false,
                    reason: 'service_unavailable'
                });
            }
        }

        // We use agora-token for generation
        const { RtcTokenBuilder, RtcRole } = require('agora-token');
        const channelName = patient._id.toString();
        const uid = 0; // 0 means Agora assigns the UID
        const role = RtcRole.PUBLISHER;
        const expirationTimeInSeconds = 3600; // 1 hour
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

        const token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channelName,
            uid,
            role,
            expirationTimeInSeconds,
            privilegeExpiredTs
        );

        res.json({ token, uid, appId, channelName });
    } catch (error) {
        logger.error('[Agora] Token generation error:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

/**
 * POST /api/users/patients/me/calls/initiate
 * Initiate a stateful CallSession in ringing state
 */
router.post('/me/calls/initiate', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        // Ensure caregiver is assigned
        let caretakerId = patient.assigned_caller_id;
        if (!caretakerId) {
            const assignedCaller = await Caller.findOne({ patient_ids: patient._id, is_active: true });
            if (!assignedCaller) {
                return res.status(400).json({ error: 'No coordinator is currently assigned to your account.' });
            }
            caretakerId = assignedCaller._id;
        }

        const CallSession = require('../../models/CallSession');
        
        // TTL expires in 15 minutes if unanswered
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        const session = new CallSession({
            patientId: patient._id,
            caretakerId,
            status: 'ringing',
            channelName: patient._id.toString(),
            expiresAt
        });
        await session.save();

        // Update Caller current call session
        await Caller.updateOne({ _id: caretakerId }, { $set: { current_call_id: session._id } });

        // Log initiation in AuditTrail
        const AuditLog = require('../../models/AuditLog');
        await AuditLog.createLog({
            supabaseUid: req.user.id,
            action: 'call_initiated',
            resourceType: 'patient',
            resourceId: patient._id,
            outcome: 'success',
            details: { sessionId: session._id, caretakerId }
        });

        res.status(201).json({ session });
    } catch (error) {
        logger.error('Initiate call error:', error);
        res.status(500).json({ error: 'Failed to initiate call session' });
    }
});

/**
 * GET /api/users/patients/me/calls/:sessionId/status
 * Get the current real-time status of a call session
 */
router.get('/me/calls/:sessionId/status', authenticateSession, async (req, res) => {
    try {
        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Call session not found or expired' });
        }
        res.json({ status: session.status, durationSeconds: session.durationSeconds });
    } catch (error) {
        logger.error('Get call status error:', error);
        res.status(500).json({ error: 'Failed to get call status' });
    }
});

/**
 * POST /api/users/patients/me/calls/:sessionId/accept
 * Simulate caretaker accepting the call (useful for dev testing / callbacks)
 */
router.post('/me/calls/:sessionId/accept', authenticateSession, async (req, res) => {
    try {
        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        session.status = 'accepted';
        session.startedAt = new Date();
        await session.save();

        res.json({ success: true, session });
    } catch (error) {
        logger.error('Accept call error:', error);
        res.status(500).json({ error: 'Failed to accept call session' });
    }
});

/**
 * POST /api/users/patients/me/calls/:sessionId/reject
 * Simulate caretaker rejecting the call
 */
router.post('/me/calls/:sessionId/reject', authenticateSession, async (req, res) => {
    try {
        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        session.status = 'rejected';
        session.endedAt = new Date();
        await session.save();

        // Clear caller active call
        await Caller.updateOne({ _id: session.caretakerId }, { $unset: { current_call_id: '' } });

        // Save CallLog
        const callLog = new CallLog({
            patientId: session.patientId,
            caretakerId: session.caretakerId,
            scheduledTime: new Date(),
            duration: 0,
            status: 'rejected'
        });
        await callLog.save();

        res.json({ success: true, session });
    } catch (error) {
        logger.error('Reject call error:', error);
        res.status(500).json({ error: 'Failed to reject call session' });
    }
});

/**
 * POST /api/users/patients/me/calls/:sessionId/end
 * End an active CallSession, compute duration, and save a persistent CallLog
 */
router.post('/me/calls/:sessionId/end', authenticateSession, async (req, res) => {
    try {
        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Call session not found' });

        session.status = 'completed';
        session.endedAt = new Date();
        
        const durationMs = session.endedAt - (session.startedAt || new Date());
        session.durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
        await session.save();

        // Clear caller current session
        await Caller.updateOne({ _id: session.caretakerId }, { $unset: { current_call_id: '' } });

        // Persist persistent historical CallLog
        const callLog = new CallLog({
            patientId: session.patientId,
            caretakerId: session.caretakerId,
            scheduledTime: session.startedAt || new Date(),
            duration: session.durationSeconds,
            status: 'completed',
            outcome: 'completed'
        });
        await callLog.save();

        res.json({ success: true, session, logId: callLog._id });
    } catch (error) {
        logger.error('End call error:', error);
        res.status(500).json({ error: 'Failed to end call session' });
    }
});

/**
 * POST /api/users/patients/me/calls/:sessionId/callback-request
 * Create a missed/callback request CallLog and trigger notification
 */
router.post('/me/calls/:sessionId/callback-request', authenticateSession, async (req, res) => {
    try {
        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Call session not found' });

        session.status = 'missed';
        await session.save();

        // Clear active session
        await Caller.updateOne({ _id: session.caretakerId }, { $unset: { current_call_id: '' } });

        // Save historical CallLog with outcome callback_requested
        const callLog = new CallLog({
            patientId: session.patientId,
            caretakerId: session.caretakerId,
            scheduledTime: new Date(),
            duration: 0,
            status: 'callback_requested',
            outcome: 'callback_requested'
        });
        await callLog.save();

        // Log compliance audit trail
        const AuditLog = require('../../models/AuditLog');
        await AuditLog.createLog({
            supabaseUid: req.user.id,
            action: 'callback_request_created',
            resourceType: 'call_log',
            resourceId: callLog._id,
            outcome: 'success',
            details: { sessionId: session._id }
        });

        res.json({ success: true, message: 'Callback request registered successfully.' });
    } catch (error) {
        logger.error('Callback request error:', error);
        res.status(500).json({ error: 'Failed to register callback request' });
    }
});

/**
 * POST /api/users/patients/me/calls/:sessionId/secure-message
 * Missed Call Recovery: leave a prioritized secure message for the caretaker
 */
router.post('/me/calls/:sessionId/secure-message', authenticateSession, async (req, res) => {
    try {
        const { text, priority } = req.body; // priority: 'Routine' | 'Important' | 'Urgent'
        if (!text) {
            return res.status(400).json({ error: 'Message text is required' });
        }

        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Call session not found' });

        session.status = 'missed';
        await session.save();

        // Clear active session
        await Caller.updateOne({ _id: session.caretakerId }, { $unset: { current_call_id: '' } });

        // Save CallLog
        const callLog = new CallLog({
            patientId: session.patientId,
            caretakerId: session.caretakerId,
            scheduledTime: new Date(),
            duration: 0,
            status: 'secure_message_left',
            outcome: 'secure_message_left',
            notes: `[Priority: ${priority || 'Routine'}] ${text}`
        });
        await callLog.save();

        // Create Caregiver Alert notification
        const AlertModel = require('../../models/Alert');
        const alert = new AlertModel({
            type: 'missed_call',
            patient_id: session.patientId,
            caller_id: session.caretakerId,
            organization_id: session.patientId.organizationId,
            description: `[Priority: ${priority || 'Routine'}] Patient left secure callback message: "${text}"`
        });
        await alert.save();

        // Log compliance audit trail
        const AuditLog = require('../../models/AuditLog');
        await AuditLog.createLog({
            supabaseUid: req.user.id,
            action: 'secure_message_sent',
            resourceType: 'call_log',
            resourceId: callLog._id,
            outcome: 'success',
            details: { sessionId: session._id, priority }
        });

        res.json({ success: true, message: 'Secure callback message saved successfully.' });
    } catch (error) {
        logger.error('Secure message fallback error:', error);
        res.status(500).json({ error: 'Failed to save secure message' });
    }
});

/**
 * POST /api/users/patients/me/calls/:sessionId/feedback
 * Submit star rating and notes for the call
 */
router.post('/me/calls/:sessionId/feedback', authenticateSession, async (req, res) => {
    try {
        const { rating, notes } = req.body;
        const CallSession = require('../../models/CallSession');
        const session = await CallSession.findById(req.params.sessionId);
        if (!session) return res.status(404).json({ error: 'Call session not found' });

        // Find the matched CallLog of the ended session
        const matchingLog = await CallLog.findOne({
            patientId: session.patientId,
            caretakerId: session.caretakerId,
            scheduledTime: { $gte: session.startedAt || new Date(Date.now() - 10000) }
        }).sort({ scheduledTime: -1 });

        if (matchingLog) {
            matchingLog.callQuality = { rating };
            if (notes) {
                matchingLog.notes = notes;
            }
            await matchingLog.save();
        }

        res.json({ success: true, message: 'Feedback logged successfully.' });
    } catch (error) {
        logger.error('Submit feedback error:', error);
        res.status(500).json({ error: 'Failed to log feedback' });
    }
});

// ─── Medications ──────────────────────────────────────────────────────────────

router.get('/me/medications', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        res.json({ medications: patient.medications || [] });
    } catch (error) {
        logger.error('Get medications error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get medications' });
    }
});

router.put('/me/medications', authenticateSession, async (req, res) => {
    try {
        const { _id, name, dosage, frequency, times, start_date, end_date, is_active, instructions, prescribed_by } = req.body;
        const patient = await getOrCreatePatient(req);

        let scheduledTimes = [];
        if (times && times.length > 0) {
            const prefs = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' };
            if (times.includes('morning')) scheduledTimes.push(prefs.morning);
            if (times.includes('afternoon')) scheduledTimes.push(prefs.afternoon);
            if (times.includes('evening')) scheduledTimes.push(prefs.evening);
            if (times.includes('night')) scheduledTimes.push(prefs.night);
            scheduledTimes = [...new Set(scheduledTimes)].sort();
        }

        if (_id) {
            const updates = {
                'medications.$.name': name,
                'medications.$.dosage': dosage,
                'medications.$.frequency': frequency,
                'medications.$.times': times,
                'medications.$.scheduledTimes': scheduledTimes,
                'medications.$.start_date': start_date,
                'medications.$.end_date': end_date,
                'medications.$.is_active': is_active,
                'medications.$.instructions': instructions,
                'medications.$.prescribed_by': prescribed_by,
            };
            await Patient.updateOne({ _id: patient._id, 'medications._id': _id }, { $set: updates });
        } else {
            await Patient.updateOne(
                { _id: patient._id },
                { $push: { medications: { name, dosage, frequency, times, scheduledTimes, start_date, end_date, is_active, instructions, prescribed_by } } }
            );
        }

        req.patient = await Patient.findById(patient._id);
        logger.info('Medications updated', { patientId: patient._id });
        // Refresh health score cache in background
        refreshHealthScoreCache(patient._id).catch(() => {});
        res.json({ medications: req.patient.medications });
    } catch (error) {
        logger.error('Update medications error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to update medications' });
    }
});

router.put('/me/call-preferences', authenticateSession, async (req, res) => {
    try {
        const { morning, afternoon, evening, night } = req.body;
        const patient = await getOrCreatePatient(req);

        const newPrefs = {
            morning: morning || patient.medication_call_preferences?.morning || '09:00',
            afternoon: afternoon || patient.medication_call_preferences?.afternoon || '14:00',
            evening: evening || patient.medication_call_preferences?.evening || '17:00',
            night: night || patient.medication_call_preferences?.night || '20:00',
        };

        await Patient.updateOne({ _id: patient._id }, { $set: { medication_call_preferences: newPrefs } });

        const freshPatient = await Patient.findById(patient._id);
        if (freshPatient.medications?.length > 0) {
            const bulkUpdates = freshPatient.medications.map(med => {
                const newScheduledTimes = [];
                const prefs = freshPatient.medication_call_preferences;
                if (med.times?.length > 0) {
                    if (med.times.includes('morning')) newScheduledTimes.push(prefs.morning);
                    if (med.times.includes('afternoon')) newScheduledTimes.push(prefs.afternoon);
                    if (med.times.includes('evening')) newScheduledTimes.push(prefs.evening);
                    if (med.times.includes('night')) newScheduledTimes.push(prefs.night);
                }
                return {
                    updateOne: {
                        filter: { _id: freshPatient._id, 'medications._id': med._id },
                        update: { $set: { 'medications.$.scheduledTimes': [...new Set(newScheduledTimes)].sort() } },
                    },
                };
            });
            await Patient.bulkWrite(bulkUpdates);
        }

        req.patient = await Patient.findById(patient._id);
        logger.info('Call preferences updated', { patientId: patient._id });
        res.json({ preferences: req.patient.medication_call_preferences, message: 'Preferences updated successfully' });
    } catch (error) {
        logger.error('Update call preferences error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// ─── Misc ─────────────────────────────────────────────────────────────────────

router.get('/me/notifications', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const notifications = await Notification.find({ patient_id: patient._id }).sort({ created_at: -1 });
        res.json({ notifications });
    } catch (error) {
        logger.error('Get notifications error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

router.put('/me/notifications/:id/read', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, patient_id: patient._id },
            { $set: { is_read: true } },
            { new: true }
        );
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        res.json({ success: true, notification });
    } catch (error) {
        logger.error('Read notification error', { error: error.message, notificationId: req.params.id });
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

router.get('/me/ai-prediction', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const prediction = await AIVitalPrediction.findOne({ patient_id: patient._id });
        res.json({ prediction: prediction || null });
    } catch (error) {
        logger.error('Get AI Prediction error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to fetch AI Prediction' });
    }
});

router.post('/me/flag-issue', authenticateSession, async (req, res) => {
    try {
        const { type, description, file_url, extracted_medicines } = req.body;
        const patient = await getOrCreatePatient(req);
        const Alert = require('../../models/Alert');
        const alert = new Alert({
            type: type || 'missed_call',
            patient_id: patient._id,
            caller_id: patient.assigned_caller_id,
            manager_id: patient.assigned_manager_id,
            organization_id: patient.organization_id,
            description,
            auto_generated: false,
            prescription_url: file_url,
            extracted_medicines: extracted_medicines,
        });
        await alert.save();
        res.status(201).json({ message: 'Issue flagged successfully', alert });
    } catch (error) {
        logger.error('Flag issue error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to flag issue' });
    }
});

// ─── Vitals ───────────────────────────────────────────────────────────────────

router.post('/me/vitals', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const { date, heart_rate, blood_pressure, oxygen_saturation, hydration, source, temperature, notes } = req.body;

        // Pre-save idempotency check: check if vitals for this patient at the exact timestamp already exist
        if (date) {
            const queryDate = new Date(date);
            const existing = await VitalLog.findOne({ patient_id: patient._id, date: queryDate });
            if (existing) {
                logger.info('Duplicate vitals log ignored (idempotent check)', { patientId: patient._id });
                return res.status(200).json({ message: 'Vitals logged successfully (duplicate ignored)', vitals: existing });
            }
        }

        const vitalLog = new VitalLog({
            patient_id: patient._id,
            date: date ? new Date(date) : new Date(),
            heart_rate, blood_pressure, oxygen_saturation, hydration, temperature, notes,
            source: source || 'manual',
        });
        await vitalLog.save();
        logger.info('Vitals logged', { patientId: patient._id, source: vitalLog.source });
        res.status(201).json({ message: 'Vitals logged successfully', vitals: vitalLog });
    } catch (error) {
        logger.error('Log vitals error', { error: error.message, patientId: req.user?.id });
        
        // Handle duplicate key error gracefully to maintain idempotency
        if (error.code === 11000) {
            try {
                const queryDate = req.body.date ? new Date(req.body.date) : null;
                if (queryDate && req.user?.id) {
                    const patient = await getOrCreatePatient(req);
                    const existing = await VitalLog.findOne({ patient_id: patient._id, date: queryDate });
                    if (existing) {
                        logger.info('Duplicate vitals log caught via unique index constraint (idempotent fallback)', { patientId: patient._id });
                        return res.status(200).json({ message: 'Vitals logged successfully (duplicate ignored)', vitals: existing });
                    }
                }
            } catch (findError) {
                logger.error('Error fetching existing vitals log after duplicate key catch', { error: findError.message });
            }
        }

        if (error.name === 'ValidationError') return res.status(400).json({ error: error.message });
        res.status(500).json({ error: 'Failed to log vitals' });
    }
});

/**
 * GET /api/users/patients/me/vitals
 *
 * FIX 5: Date range boundaries used new Date() + setDate/setHours in server
 *   local time. For a patient in IST querying at 1am IST, the server UTC date
 *   is still yesterday — the default 30-day window starts a day late.
 *   Now derives boundaries from the patient's timezone via moment-timezone,
 *   consistent with how medicines.js handles date ranges.
 */
router.get('/me/vitals', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const timezone = patient.timezone || 'Asia/Kolkata';
        const { start_date, end_date } = req.query;
        const query = { patient_id: patient._id };

        if (start_date || end_date) {
            query.date = {};
            if (start_date) {
                // Treat the date string as a date in the patient's timezone
                const sd = moment.tz(start_date, 'YYYY-MM-DD', timezone).startOf('day').toDate();
                query.date.$gte = sd;
            }
            if (end_date) {
                const ed = moment.tz(end_date, 'YYYY-MM-DD', timezone).endOf('day').toDate();
                query.date.$lte = ed;
            }
        } else {
            // Default: last 30 days from the patient's local "today"
            const thirtyDaysAgoStr = moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD');
            query.date = { $gte: new Date(`${thirtyDaysAgoStr}T00:00:00.000Z`) };
        }

        const vitals = await VitalLog.find(query).sort({ date: 1 });
        res.json({ vitals });
    } catch (error) {
        logger.error('Get vitals error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to fetch vitals history' });
    }
});

// ─── Security & Privacy ───────────────────────────────────────────────────────

router.post('/me/security/screenshots/request-otp', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const otpService = require('../../services/otpService');
        const emailService = require('../../services/emailService');
        const otp = await otpService.createOTP(patient.email);
        await emailService.sendSecurityOTPEmail(patient.email, otp);
        res.json({ message: 'OTP sent successfully to your registered email' });
    } catch (err) {
        logger.error('Request screenshot OTP error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

router.post('/me/security/screenshots/verify', authenticateSession, async (req, res) => {
    try {
        const { otp, allow } = req.body;
        if (!otp || typeof allow !== 'boolean') {
            return res.status(400).json({ error: 'OTP and boolean "allow" parameter are required' });
        }
        const patient = await getOrCreatePatient(req);
        const otpService = require('../../services/otpService');
        const verification = await otpService.verifyOTP(patient.email, otp);
        if (!verification.valid) return res.status(400).json({ error: verification.reason });
        patient.allow_screenshots = allow;
        await patient.save();
        res.json({ message: allow ? 'Screenshots enabled' : 'Screenshots disabled', allow_screenshots: patient.allow_screenshots, patient });
    } catch (err) {
        logger.error('Verify screenshot OTP error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

// ─── Emergency Contact OTP ────────────────────────────────────────────────────

router.post('/me/security/emergency-contact/request-otp', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const otpService = require('../../services/otpService');
        const emailService = require('../../services/emailService');
        const otp = await otpService.createOTP(patient.email);
        await emailService.sendSecurityOTPEmail(patient.email, otp);
        res.json({ message: 'OTP sent successfully to your registered email' });
    } catch (err) {
        logger.error('Request EC OTP error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

router.post('/me/security/emergency-contact/verify', authenticateSession, async (req, res) => {
    try {
        const { otp, name, phone, relation } = req.body;
        if (!otp) return res.status(400).json({ error: 'OTP is required' });
        const patient = await getOrCreatePatient(req);
        const otpService = require('../../services/otpService');
        const verification = await otpService.verifyOTP(patient.email, otp);
        if (!verification.valid) return res.status(400).json({ error: verification.reason });

        if (!name && !phone) {
            await Patient.updateOne({ _id: patient._id }, { $pull: { trusted_contacts: { is_emergency: true } } });
        } else {
            const existingEmergencyContact = patient.trusted_contacts.find(c => c.is_emergency);
            if (existingEmergencyContact) {
                await Patient.updateOne(
                    { _id: patient._id, 'trusted_contacts._id': existingEmergencyContact._id },
                    {
                        $set: {
                            'trusted_contacts.$.name': name,
                            'trusted_contacts.$.phone': phone,
                            'trusted_contacts.$.relation': relation,
                            'trusted_contacts.$.is_emergency': true,
                        },
                    }
                );
            } else {
                await Patient.updateOne(
                    { _id: patient._id },
                    { $push: { trusted_contacts: { name, phone, relation, is_emergency: true, is_primary: true } } }
                );
            }
        }

        const updated = await Patient.findById(patient._id);
        logger.info('Emergency contact updated via OTP', { patientId: patient._id });
        res.json({ patient: updated, message: 'Emergency contact updated successfully' });
    } catch (err) {
        logger.error('Verify EC OTP error', { error: err.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Server Error' });
    }
});

// ─── Aggregate Dashboard ──────────────────────────────────────────────────────

/**
 * GET /api/users/patients/me/dashboard
 *
 * Single endpoint that returns everything the mobile HomeScreen needs.
 * Replaces 6 parallel client-side API calls with 1 round-trip:
 *   getMe + getVitals(today) + getVitals(7d) + getToday + getAIPrediction + getAdherenceDetails
 *
 * All DB queries run in parallel within the same server process — no HTTP
 * overhead, shared connection pool, single auth check.
 */
router.get('/me/dashboard', authenticateSession, async (req, res) => {
    try {
        const patient = await getOrCreatePatient(req);
        const patientObj = patient.toObject();
        const withHash = await Patient.findById(patient._id).select('+passwordHash').lean();
        patientObj.hasPassword = !!withHash?.passwordHash;

        const timezone = patient.timezone || 'Asia/Kolkata';
        const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
        const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);
        const todayEndUtc = new Date(`${todayStr}T23:59:59.999Z`);
        const sevenDaysAgo = new Date(`${moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD')}T00:00:00.000Z`);

        // ── Fire all queries in parallel ────────────────────────────────────
        const [
            todayVitals,
            vitalsHistory,
            todayMedLog,
            aiPrediction,
            adherenceLogs,
        ] = await Promise.all([
            // 1. Today's vitals
            VitalLog.find({
                patient_id: patient._id,
                date: { $gte: todayUtc, $lte: todayEndUtc },
            }).sort({ date: -1 }).lean(),

            // 2. 7-day vitals history
            VitalLog.find({
                patient_id: patient._id,
                date: { $gte: sevenDaysAgo },
            }).sort({ date: 1 }).lean(),

            // 3. Today's medication log (re-uses existing /today logic inline)
            (async () => {
                const { buildMergedMeds } = require('./medicines');
                let log = await MedicineLog.findOne({ patient_id: patient._id, date: todayUtc });
                const allMedsRaw = await buildMergedMeds(patient);

                if (!log && allMedsRaw.length > 0) {
                    const medicines = [];
                    for (const med of allMedsRaw) {
                        if (med.is_active !== false) {
                            for (const time of med.times) {
                                medicines.push({ medicine_name: med.name, scheduled_time: time, taken: false });
                            }
                        }
                    }
                    if (medicines.length > 0) {
                        log = new MedicineLog({ patient_id: patient._id, date: todayUtc, medicines });
                        await log.save();
                    }
                } else if (log) {
                    let isModified = false;
                    const activeMedNames = allMedsRaw.filter(m => m.is_active !== false).map(m => m.name);
                    const originalCount = log.medicines.length;
                    log.medicines = log.medicines.filter(m => activeMedNames.includes(m.medicine_name));
                    if (log.medicines.length !== originalCount) isModified = true;
                    for (const med of allMedsRaw) {
                        if (med.is_active !== false) {
                            for (const time of med.times) {
                                const exists = log.medicines.some(m => m.medicine_name === med.name && m.scheduled_time === time);
                                if (!exists) { log.medicines.push({ medicine_name: med.name, scheduled_time: time, taken: false }); isModified = true; }
                            }
                        }
                    }
                    if (isModified) await log.save();
                }

                const logObj = log ? log.toObject() : { medicines: [], date: todayUtc };
                const preferences = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', evening: '17:00', night: '20:00' };
                if (logObj.medicines) {
                    logObj.medicines = logObj.medicines.filter(m => m.is_active !== false).map(m => {
                        const patMed = allMedsRaw.find(p => p.name === m.medicine_name);
                        return { 
                            ...m, 
                            dosage: patMed?.dosage || '', 
                            instructions: patMed?.instructions || '', 
                            preferred_time: preferences[m.scheduled_time] || '',
                            refillInfo: patMed?.refillInfo || null
                        };
                    });
                }
                return { log: logObj, preferences };
            })(),

            // 4. AI prediction
            AIVitalPrediction.findOne({ patient_id: patient._id }).lean().catch(() => null),

            // 5. Adherence details (streak + score — use 30 days for accurate streak)
            MedicineLog.find({
                patient_id: patient._id,
                date: { $gte: new Date(`${moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD')}T00:00:00.000Z`) },
            }).sort({ date: 1 }).lean(),
        ]);

        // ── Compute adherence summary ───────────────────────────────────────
        let weeklyTaken = 0;
        let weeklyTotal = 0;

        // Build daily log in the same format computeCurrentStreak expects
        const dailyLog = [];
        for (const log of adherenceLogs) {
            const active = (log.medicines || []).filter(m => m.is_active !== false);
            const taken = active.filter(m => m.taken).length;
            const total = active.length;
            const dateStr = log.date.toISOString().slice(0, 10);

            // Only count last 7 days for weekly rate
            if (moment(dateStr).isSameOrAfter(moment(todayStr).subtract(6, 'days'))) {
                weeklyTaken += taken;
                weeklyTotal += total;
            }

            dailyLog.push({
                date: dateStr,
                taken,
                total,
                rate: total > 0 ? Math.round((taken / total) * 100) : 0,
            });
        }

        // Use the same streak function as the Medications screen
        const { computeCurrentStreak } = require('./medicines');
        const historyStartStr = moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD');
        const streak = computeCurrentStreak(dailyLog, todayStr, historyStartStr);

        const adherence = {
            streak,
            weeklyRate: weeklyTotal > 0 ? Math.round((weeklyTaken / weeklyTotal) * 100) : 0,
        };

        const vitals = todayVitals.length > 0 ? todayVitals[0] : null;

        res.json({
            patient: patientObj,
            vitals,
            vitalsHistory,
            meds: todayMedLog,
            aiPrediction: aiPrediction || null,
            adherence,
        });
    } catch (error) {
        logger.error('Dashboard aggregate error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

module.exports = router;