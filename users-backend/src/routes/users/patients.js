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
const logger = require('../../utils/logger');
const { getOrCreatePatient, createBasicPatient, findOrCreatePatientRecord } = require('../../utils/patientHelpers');
const { authenticateSession } = require('../../middleware/authenticate');
const { validateObjectId } = require('../../middleware/validateObjectId');

const router = express.Router();

// ─── Subscription & Onboarding ────────────────────────────────────────────────

async function subscribeAndSeedDemoData(patient, planId) {
    if (patient.subscription?.status === 'active') return patient;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const orgId = patient.organization_id || new mongoose.Types.ObjectId('674f07e1525049b7348908f9');

        const subscriptionUpdates = {
            'subscription.status': 'active',
            'subscription.plan': planId || patient.pending_plan || 'basic',
            'subscription.amount': 500,
            'subscription.payment_date': new Date(),
            'subscription.started_at': new Date(),
            'subscription.expires_at': new Date(Date.now() + 30 * 86400000),
            'subscription.next_billing': new Date(Date.now() + 30 * 86400000),
            paid: 1,
        };

        await Patient.updateOne({ _id: patient._id }, { $set: subscriptionUpdates }, { session });

        const Profile = require('../../models/Profile');
        const manager = await Profile.findOne({
            organization_id: orgId,
            role: { $in: ['manager', 'admin', 'super_admin', 'care manager'] },
        }).session(session);

        if (manager) {
            await Patient.updateOne({ _id: patient._id }, { $set: { assigned_manager_id: manager._id } }, { session });
        }

        const Alert = require('../../models/Alert');
        await Alert.create([{
            type: 'team_lead_recommended',
            patient_id: patient._id,
            manager_id: manager?._id || undefined,
            organization_id: orgId,
            description: `New patient "${patient.name || patient.email}" subscribed. Needs caregiver assignment.`,
            auto_generated: true,
            status: 'open',
        }], { session });

        await Notification.create([{
            patient_id: patient._id,
            type: 'system',
            title: 'Welcome to CareCo! 🎉',
            message: 'Your account is now active. Explore the app while we appoint your dedicated caregiver.',
            target_screen: 'HealthProfile',
        }], { session });

        await session.commitTransaction();
        logger.info('Subscription activated atomically', { patientId: patient._id, plan: subscriptionUpdates['subscription.plan'] });

        if (patient.expo_push_token) {
            const PushNotificationService = require('../../utils/pushNotifications');
            PushNotificationService.sendPush(
                patient.expo_push_token,
                'Welcome to CareCo! 🎉',
                'Your account is now active.'
            ).catch(err => logger.warn('Push notification failed', { error: err.message }));
        }

        return await Patient.findById(patient._id);
    } catch (error) {
        await session.abortTransaction();
        logger.error('Subscription transaction aborted', { error: error.message, patientId: patient._id });
        throw error;
    } finally {
        session.endSession();
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
            { headers: { 'User-Agent': 'CareCo-Backend/1.0' } }
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
            { headers: { 'User-Agent': 'CareCo-Backend/1.0' } }
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

        // If patient is already active, just save the 'paid' status and return.
        // This handles cases where a previous attempt was partially recorded.
        if (patient.subscription?.status === 'active') {
            await patient.save();
            return res.json({ success: true, patient, message: 'Subscription already active, data updated.' });
        }

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
        const patient = await getOrCreatePatient(req);
        const withHash = await Patient.findById(patient._id).select('+passwordHash');
        const patientObj = patient.toObject();
        patientObj.hasPassword = !!withHash?.passwordHash;
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
        if (expo_push_token !== undefined) updates.expo_push_token = expo_push_token;
        if (profile_complete !== undefined) updates.profile_complete = profile_complete;

        const patient = await getOrCreatePatient(req, name);
        await Patient.updateOne({ _id: patient._id }, { $set: updates });
        req.patient = await Patient.findById(patient._id);
        logger.info('Profile updated', { patientId: patient._id });

        if (expo_push_token && patient.expo_push_token !== expo_push_token) {
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
        // The PUT /me/lifestyle handler writes to patient.lifestyle.*, so we must
        // read from there. Legacy top-level fields (height_cm, weight_kg, etc.)
        // are kept as fallbacks for patients who haven't used the new lifestyle form yet.
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
                .select('name employee_id profile_photo_url languages_spoken experience_years phone city');
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
                .select('name employee_id profile_photo_url languages_spoken experience_years phone city');
            if (caller) {
                await Patient.updateOne({ _id: patient._id }, { $set: { assigned_caller_id: caller._id } });
                req.patient = await Patient.findById(patient._id);
                logger.info('Synced assigned_caller_id', { patientId: patient._id, callerId: caller._id });
            }
        }

        res.json({ caller: caller || null, manager: manager || null });
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
            CallLog.find({ patient_id: patient._id })
                .select('-caller_notes -admin_notes')
                .sort({ call_date: -1 })
                .skip(skip)
                .limit(limit)
                .populate('caller_id', 'name profile_photo_url'),
            CallLog.countDocuments({ patient_id: patient._id }),
        ]);

        res.json({
            calls,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        logger.error('Get patient calls error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to get call history' });
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
            const prefs = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };
            if (times.includes('morning')) scheduledTimes.push(prefs.morning);
            if (times.includes('afternoon') || times.includes('evening')) scheduledTimes.push(prefs.afternoon);
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
        res.json({ medications: req.patient.medications });
    } catch (error) {
        logger.error('Update medications error', { error: error.message, patientId: req.user?.id });
        res.status(500).json({ error: 'Failed to update medications' });
    }
});

router.put('/me/call-preferences', authenticateSession, async (req, res) => {
    try {
        const { morning, afternoon, night } = req.body;
        const patient = await getOrCreatePatient(req);

        const newPrefs = {
            morning: morning || patient.medication_call_preferences?.morning || '09:00',
            afternoon: afternoon || patient.medication_call_preferences?.afternoon || '14:00',
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
                    if (med.times.includes('afternoon') || med.times.includes('evening')) newScheduledTimes.push(prefs.afternoon);
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
        const { type, description } = req.body;
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

module.exports = router;