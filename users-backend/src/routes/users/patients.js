const express = require('express');
const mongoose = require('mongoose');
const Patient = require('../../models/Patient');
const CallLog = require('../../models/CallLog');
const MedicineLog = require('../../models/MedicineLog');
const VitalLog = require('../../models/VitalLog');
const Caller = require('../../models/Caller');
const Notification = require('../../models/Notification');
const AIVitalPrediction = require('../../models/AIVitalPrediction');
const { authenticate, authenticateSession } = require('../../middleware/authenticate');
const { validateObjectId } = require('../../middleware/validateObjectId');

const router = express.Router();

// ─── Auto-Seed Basic Profile ────────────────────────────
async function createBasicPatient(supabaseUid, email, name, profileId, paid = 0) {
    try {
        const orgId = new mongoose.Types.ObjectId();
        const patientData = {
            supabase_uid: supabaseUid,
            profile_id: profileId,
            name: name || (email ? email.split('@')[0] : 'Patient'),
            email: email || `${supabaseUid}@phone.careco.in`,
            organization_id: orgId,
            subscription: {
                status: paid === 1 ? 'active' : 'pending_payment',
                plan: 'basic'
            },
            paid: paid,
            emailVerified: true, // Auto-verified since they come from Supabase Auth
            profile_complete: false,
            role: 'patient',
            conditions: [],
            medical_history: [],
            allergies: [],
            medications: []
        };

        const patient = await Patient.create(patientData);
        console.log(`✅ Auto-seeded basic profile for ${email} (paid: ${paid})`);
        return patient;
    } catch (err) {
        // Handle duplicate key error (11000) - possible race condition or recreated Supabase account
        if (err.code === 11000) {
            console.log(`ℹ️ Patient already exists or conflict for ${email}, attempting to re-fetch.`);
            const existing = await Patient.findOne({
                $or: [{ supabase_uid: supabaseUid }, { email: email.toLowerCase() }]
            });
            if (existing) {
                // Auto-heal the supabase_uid if it was recreated in Supabase but their MongoDB record remained
                if (existing.supabase_uid !== supabaseUid) {
                    console.log(`[Auto-heal] Updating stale supabase_uid for patient ${email}`);
                    existing.supabase_uid = supabaseUid;
                    await existing.save();
                }
                return existing;
            }
        }
        throw err;
    }
}

// ─── Activate Subscription & Notify Manager (Post-Subscription) ────────────────────────────
async function subscribeAndSeedDemoData(patient) {
    if (patient.subscription?.status === 'active') return patient; // Already subscribed

    const orgId = patient.organization_id || new mongoose.Types.ObjectId();

    // 1. Activate subscription — NO caller assignment, manager will assign one
    patient.subscription = {
        status: 'active',
        plan: patient.pending_plan || 'basic',
        amount: 500,
        payment_date: new Date(),
        started_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 86400000),
        next_billing: new Date(Date.now() + 30 * 86400000),
    };
    patient.profile_complete = true;
    patient.expireAt = undefined; // Remove TTL so account is kept permanently

    // Provide empty containers for user to add health data
    patient.conditions = [];
    patient.medical_history = [];
    patient.allergies = [];
    patient.medications = [];
    patient.vaccinations = [];
    patient.appointments = [];

    // Find the org manager (Profile with role 'manager' in this org)
    const Profile = require('../../models/Profile');
    const manager = await Profile.findOne({
        organization_id: orgId,
        role: { $in: ['manager', 'admin', 'super_admin'] },
    });

    if (manager) {
        patient.assigned_manager_id = manager._id;
    }

    await patient.save();

    // 2. Alert the organization manager to assign a caller
    const Alert = require('../../models/Alert');
    try {
        await Alert.create({
            type: 'team_lead_recommended',
            patient_id: patient._id,
            manager_id: manager?._id || undefined,
            organization_id: orgId,
            description: `New patient "${patient.name || patient.email}" has subscribed and needs a caregiver assigned.`,
            auto_generated: true,
            status: 'open',
        });
        console.log(`📋 Alert created for manager to assign caller for ${patient.email}`);
    } catch (alertErr) {
        console.warn('⚠️ Could not create manager alert:', alertErr.message);
    }

    // 3. Welcome notification for the patient
    await Notification.create({
        patient_id: patient._id,
        type: 'account',
        title: 'Welcome to CareCo! 🎉',
        message: 'Your account is now active. Explore the app and set up your health profile while we appoint your dedicated caregiver. You\'ll be notified once they\'re assigned!',
        target_screen: 'HealthProfile',
    });

    if (patient.expo_push_token) {
        const PushNotificationService = require('../../utils/pushNotifications');
        PushNotificationService.sendPush(
            patient.expo_push_token,
            'Welcome to CareCo! 🎉',
            'Your account is now active. Explore the app and set up your health profile.'
        ).catch(err => console.warn('Failed to send welcome push notification:', err));
    }

    console.log(`✅ Subscribed ${patient.email} — manager notified, no dummy caller assigned.`);
    return patient;
}

/**
 * GET /api/users/patients/cities
 * Public endpoint to get available cities for the manual picker
 */
router.get('/cities', async (req, res) => {
    try {
        const City = require('../../models/City');
        let cities = await City.find({ isActive: true }).sort('name');

        // Auto-seed if empty for the demo
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
        console.error('Get cities error:', error);
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
});

/**
 * GET /api/users/patients/location/reverse
 * Proxy endpoint for reverse geocoding to bypass CORS
 * Query params: lat, lon
 */
router.get('/location/reverse', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }

        // Dynamic import for node-fetch if global fetch is not available in older Node
        const fetch = global.fetch || require('node-fetch');

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
            { headers: { 'User-Agent': 'CareCo-Backend/1.0' } }
        );

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        res.status(500).json({ error: 'Failed to geocode location' });
    }
});

/**
 * GET /api/users/patients/location/search
 * Proxy endpoint for forward geocoding (searching by name/pincode)
 * Query params: q
 */
router.get('/location/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const fetch = global.fetch || require('node-fetch');

        // Limit results to India (countrycodes=in) and city/postal results
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=in&limit=5`,
            { headers: { 'User-Agent': 'CareCo-Backend/1.0' } }
        );

        const data = await response.json();

        // Return more granular results (localities, sectors, etc.)
        const results = data.map(item => ({
            id: item.place_id,
            display_name: item.display_name,
            name: item.name || item.address?.suburb || item.address?.neighbourhood || item.address?.city_district || item.address?.city,
            city: item.address?.city || item.address?.town || item.address?.village,
            state: item.address?.state,
            pincode: item.address?.postcode,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
        }));

        res.json({ results });
    } catch (error) {
        console.error('Location search error:', error);
        res.status(500).json({ error: 'Failed to search location' });
    }
});

/**
 * GET /api/users/patients/me/addresses
 * Get saved addresses for the patient
 */
router.get('/me/addresses', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id }).select('saved_addresses');
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });
        res.json({ saved_addresses: patient.saved_addresses || [] });
    } catch (error) {
        console.error('Get addresses error:', error);
        res.status(500).json({ error: 'Failed to get saved addresses' });
    }
});

/**
 * POST /api/users/patients/me/addresses
 * Add a new saved address
 */
router.post('/me/addresses', authenticateSession, async (req, res) => {
    try {
        const { label, title, address_line, flat_no, street, city, state, postcode, lat, lon } = req.body;
        const patient = await Patient.findOneAndUpdate(
            { supabase_uid: req.user.id },
            {
                $push: {
                    saved_addresses: { label, title, address_line, flat_no, street, city, state, postcode, lat, lon }
                }
            },
            { new: true }
        );
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });
        res.status(201).json({ saved_addresses: patient.saved_addresses, message: 'Address saved successfully' });
    } catch (error) {
        console.error('Add address error:', error);
        res.status(500).json({ error: 'Failed to save address' });
    }
});

/**
 * PUT /api/users/patients/me/addresses/:id
 * Update a saved address
 */
router.put('/me/addresses/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const { label, title, address_line, flat_no, street, city, state, postcode, lat, lon } = req.body;
        const patient = await Patient.findOneAndUpdate(
            {
                supabase_uid: req.user.id,
                "saved_addresses._id": new mongoose.Types.ObjectId(req.params.id)
            },
            {
                $set: {
                    "saved_addresses.$": { label, title, address_line, flat_no, street, city, state, postcode, lat, lon }
                }
            },
            { new: true }
        );
        if (!patient) return res.status(404).json({ error: 'Patient or address not found' });
        res.json({ saved_addresses: patient.saved_addresses, message: 'Address updated successfully' });
    } catch (error) {
        console.error('Update address error:', error);
        res.status(500).json({ error: 'Failed to update address' });
    }
});

/**
 * DELETE /api/users/patients/me/addresses/:id
 * Delete a saved address
 */
router.delete('/me/addresses/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        // Use Mongoose subdocument remove
        const address = patient.saved_addresses.id(req.params.id);
        if (address) {
            address.remove();
            await patient.save();
        }

        res.json({ saved_addresses: patient.saved_addresses, message: 'Address deleted successfully' });
    } catch (error) {
        console.error('Delete address error:', error);
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

/**
 * GET /api/users/patients/me
 * Patient reads their own profile — auto-seeds basic Free profile on first visit
 */
router.get('/me', authenticateSession, async (req, res) => {
    try {
        let patient = await Patient.findOne({ supabase_uid: req.user.id })
            .populate('assigned_manager_id', 'fullName email phone');
        if (!patient) {
            try {
                patient = await createBasicPatient(
                    req.user.id,
                    req.user.email,
                    req.user.user_metadata?.full_name || req.user.user_metadata?.name,
                    req.profile ? req.profile._id : undefined
                );
            } catch (seedErr) {
                console.error('Auto-seed error:', seedErr);
                // Return 500 instead of 404 to correctly indicate an internal server error
                return res.status(500).json({ error: 'Failed to auto-seed patient profile', details: seedErr.message || String(seedErr) });
            }
        }
        // BUG-6 FIX: Expose hasPassword flag (never the actual hash)
        const withHash = await Patient.findById(patient._id).select('+passwordHash');
        const patientObj = patient.toObject();
        patientObj.hasPassword = !!withHash?.passwordHash;
        res.json({ patient: patientObj });
    } catch (error) {
        console.error('Get patient profile error:', error);
        res.status(500).json({ error: 'Failed to get patient profile' });
    }
});

/**
 * PUT /api/users/patients/me
 * Update basic patient profile details (city, name)
 */
router.put('/me', authenticateSession, async (req, res) => {
    try {
        const { name, city, date_of_birth, phone, gender, blood_type, language, push_notifications_enabled, medication_reminders_enabled, expo_push_token, profile_complete } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (city !== undefined) updates.city = city;
        if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
        if (phone !== undefined) updates.phone = phone;
        if (gender !== undefined) updates.gender = gender;
        if (blood_type !== undefined) updates.blood_type = blood_type;
        if (language !== undefined) updates.language = language;
        if (push_notifications_enabled !== undefined) updates.push_notifications_enabled = push_notifications_enabled;
        if (medication_reminders_enabled !== undefined) updates.medication_reminders_enabled = medication_reminders_enabled;
        if (expo_push_token !== undefined) updates.expo_push_token = expo_push_token;
        if (profile_complete !== undefined) updates.profile_complete = profile_complete;

        let patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        const expoTokenUpdated = expo_push_token && patient.expo_push_token !== expo_push_token;

        // Apply updates
        Object.assign(patient, updates);
        await patient.save();

        if (expoTokenUpdated) {
            const PushNotificationService = require('../../utils/pushNotifications');
            const firstName = (patient.name || 'there').split(' ')[0];
            PushNotificationService.sendPush(
                expo_push_token,
                `Push Notifications Connected! 🔔`,
                `Hi ${firstName}, you will now receive live alerts from the backend.`
            ).catch(err => console.warn('Failed to send push connection notification:', err));
        }

        res.json({ patient, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update patient profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// --- HEALTH PROFILE ENDPOINTS ---

/**
 * GET /api/users/patients/me/profile
 * Returns detailed health profile with nested lifestyle/gp objects for frontend
 */
router.get('/me/profile', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        const patientObj = patient.toObject();

        // Reshape flat root-level fields into nested objects expected by frontend
        patientObj.lifestyle = {
            height_cm: patientObj.height_cm,
            weight_kg: patientObj.weight_kg,
            smoking_status: patientObj.smoking_status,
            alcohol_use: patientObj.alcohol_use,
            exercise_frequency: patientObj.exercise_frequency,
            mobility_level: patientObj.mobility_level,
        };

        patientObj.gp = {
            name: patientObj.gp_name,
            phone: patientObj.gp_phone,
            email: patientObj.gp_email,
        };

        res.json(patientObj);
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

const updateProfileArray = (field) => async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        if (req.body._id) {
            const item = patient[field].id(req.body._id);
            if (item) Object.assign(item, req.body);
            else return res.status(404).json({ error: 'Item not found' });
        } else {
            patient[field].push(req.body);
        }
        await patient.save();
        res.json({ message: `${field} updated`, patient });
    } catch (err) {
        console.error(`Update ${field} error:`, err);
        res.status(500).json({ error: 'Server Error' });
    }
};

router.put('/me/conditions', authenticateSession, updateProfileArray('conditions'));
router.put('/me/allergies', authenticateSession, updateProfileArray('allergies'));
router.put('/me/vaccinations', authenticateSession, updateProfileArray('vaccinations'));
router.put('/me/appointments', authenticateSession, updateProfileArray('appointments'));
router.put('/me/medical-history', authenticateSession, updateProfileArray('medical_history'));

/**
 * POST /api/users/patients/me/prescriptions
 * Uploads a securely backed prescription file URL from the client
 */
router.post('/me/prescriptions', authenticateSession, async (req, res) => {
    try {
        const { file_base64, content_type } = req.body;
        if (!file_base64) return res.status(400).json({ error: 'file_base64 is required' });

        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        // Initialize Supabase Admin client to bypass frontend RLS
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
            console.error('Supabase admin upload error:', error);
            return res.status(500).json({ error: 'Failed to upload to storage: ' + error.message });
        }
        
        const publicUrl = supabaseAdmin.storage.from('prescriptions').getPublicUrl(fileName).data.publicUrl;

        patient.uploaded_prescriptions.push({ file_url: publicUrl, file_name: fileName });
        await patient.save();

        res.status(201).json({ message: 'Prescription uploaded successfully', uploaded_prescriptions: patient.uploaded_prescriptions });
    } catch (err) {
        console.error('Upload prescription error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.put('/me/lifestyle', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        const {
            height_cm, weight_kg, smoking_status,
            alcohol_use, exercise_frequency, mobility_level,
            mobility_aids, dietary_restrictions, device_sync_status
        } = req.body;

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

        await patient.save();
        res.json({ message: 'Lifestyle updated', patient });
    } catch (err) {
        console.error('Update lifestyle error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.put('/me/primary-doctor', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        // Frontend may send as gp_name or name — handle both
        const { gp_name, gp_phone, gp_email, name, phone, email } = req.body;
        if (gp_name !== undefined || name !== undefined) patient.gp_name = gp_name || name;
        if (gp_phone !== undefined || phone !== undefined) patient.gp_phone = gp_phone || phone;
        if (gp_email !== undefined || email !== undefined) patient.gp_email = gp_email || email;

        await patient.save();
        res.json({ message: 'Primary doctor updated', patient });
    } catch (err) {
        console.error('Update gp error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

const deleteProfileItem = (dbCollection, responseKey) => async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        const { id } = req.params;
        const item = patient[dbCollection].id(id);
        
        if (item) {
            patient[dbCollection].pull(id);
            await patient.save();
            res.json({ message: 'Item deleted', [responseKey]: patient[dbCollection] });
        } else {
            res.status(404).json({ error: 'Item not found' });
        }
    } catch (err) {
        console.error(`Delete ${dbCollection} error:`, err);
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

/**
 * POST /api/users/patients/subscribe
 * Subscribes a Free patient to a paid plan, notifying the manager to assign a Caller
 */
router.post('/subscribe', authenticateSession, async (req, res) => {
    try {
        const { paid, planId, paymentId } = req.body;
        let patient = await Patient.findOne({ supabase_uid: req.user.id });

        if (!patient) {
            try {
                patient = await createBasicPatient(
                    req.user.id,
                    req.user.email,
                    req.user.user_metadata?.full_name || req.user.user_metadata?.name,
                    req.profile._id
                );
            } catch (seedErr) {
                console.error('Auto-seed error in subscribe:', seedErr);
                return res.status(500).json({ error: 'Failed to create patient profile' });
            }
        }

        if (patient.subscription?.status === 'active') return res.status(400).json({ error: 'Already subscribed' });

        // SEC-FIX-2: Don't trust frontend "paid: 1". 
        // In production, verify paymentId with Razorpay/Stripe API here.
        if (!paymentId && paid === 1) {
             return res.status(400).json({ error: 'Payment verification failed. No payment ID provided.' });
        }

        if (paid !== undefined) {
            patient.paid = paid;
        }
        if (planId) {
            patient.pending_plan = planId;
        }

        // Simulate payment success, then seed data
        patient = await subscribeAndSeedDemoData(patient);

        res.json({ success: true, patient, message: `Successfully subscribed to ${planId || 'basic'} plan.` });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: 'Failed to process subscription' });
    }
});

/**
 * PUT /api/users/patients/me/emergency-contact
 * Patient updates their primary emergency contact.
 * This now looks for the contact in trusted_contacts with is_emergency: true.
 */
router.put('/me/emergency-contact', authenticateSession, async (req, res) => {
    try {
        const { name, phone, relation } = req.body;
        
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        // If payload is empty, treat as a request to remove the emergency contact
        if (!name && !phone) {
            const emergencyContact = patient.trusted_contacts.find(c => c.is_emergency);
            if (emergencyContact) {
                patient.trusted_contacts.pull(emergencyContact._id);
            }
            await patient.save();
            return res.json({ patient, message: 'Emergency contact removed successfully' });
        }

        // Simple validation
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });
        if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) return res.status(400).json({ error: 'Valid phone number is required' });

        // Find existing emergency contact
        let emergencyContact = patient.trusted_contacts.find(c => c.is_emergency);

        if (emergencyContact) {
            emergencyContact.name = name;
            emergencyContact.phone = phone;
            emergencyContact.relation = relation;
        } else {
            // Create one if it doesn't exist
            patient.trusted_contacts.push({
                name, phone, relation,
                is_emergency: true,
                is_primary: true
            });
        }

        await patient.save();
        res.json({ patient, message: 'Emergency contact updated successfully' });
    } catch (error) {
        console.error('Update emergency contact error:', error);
        res.status(500).json({ error: 'Failed to update emergency contact' });
    }
});

/**
 * GET /api/users/patients/me/trusted-contacts
 * Patient gets their list of trusted contacts
 */
router.get('/me/trusted-contacts', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id }).select('trusted_contacts');
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });
        res.json({ trusted_contacts: patient.trusted_contacts || [] });
    } catch (error) {
        console.error('Get trusted contacts error:', error);
        res.status(500).json({ error: 'Failed to get trusted contacts' });
    }
});

/**
 * POST /api/users/patients/me/trusted-contacts
 * Patient adds a new trusted contact
 */
router.post('/me/trusted-contacts', authenticateSession, async (req, res) => {
    try {
        const { name, phone, relation, email, is_primary, is_emergency, can_view_data, permissions } = req.body;
        
        // Validation
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });
        if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) return res.status(400).json({ error: 'Valid phone number is required' });

        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        // If this is marked as emergency, unset any other emergency contact
        if (is_emergency) {
            patient.trusted_contacts.forEach(c => c.is_emergency = false);
        }

        patient.trusted_contacts.push({
            name, phone, relation, email, 
            is_primary: is_primary || is_emergency, 
            is_emergency: !!is_emergency,
            can_view_data: !!can_view_data, 
            permissions: permissions || []
        });

        await patient.save();
        res.status(201).json({ trusted_contacts: patient.trusted_contacts, message: 'Trusted contact added successfully' });
    } catch (error) {
        console.error('Add trusted contact error:', error);
        res.status(500).json({ error: 'Failed to add trusted contact' });
    }
});

/**
 * PUT /api/users/patients/me/trusted-contacts/:id
 * Patient updates a trusted contact
 */
router.put('/me/trusted-contacts/:id', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const { name, phone, relation, email, is_primary, is_emergency, can_view_data, permissions } = req.body;
        
        // Validation
        if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });
        if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) return res.status(400).json({ error: 'Valid phone number is required' });

        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        // If this is marked as emergency, unset any other emergency contact
        if (is_emergency) {
            patient.trusted_contacts.forEach(c => {
                if (c._id.toString() !== req.params.id) c.is_emergency = false;
            });
        }

        const contact = patient.trusted_contacts.id(req.params.id);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        Object.assign(contact, {
            name, phone, relation, email,
            is_primary: is_primary || is_emergency,
            is_emergency: !!is_emergency,
            can_view_data: !!can_view_data,
            permissions: permissions || []
        });

        await patient.save();
        res.json({ trusted_contacts: patient.trusted_contacts, message: 'Trusted contact updated successfully' });
    } catch (error) {
        console.error('Update trusted contact error:', error);
        res.status(500).json({ error: 'Failed to update trusted contact' });
    }
});

/**
 * GET /api/users/patients/me/caller
 * Patient gets their assigned caller's info + manager info.
 * Performs a two-way lookup: first checks patient.assigned_caller_id,
 * then falls back to searching Caller.patient_ids for this patient.
 */
router.get('/me/caller', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id })
            .populate('assigned_manager_id', 'fullName email phone');

        if (!patient) {
            return res.status(200).json({ caller: null, manager: null, message: 'Patient profile not found' });
        }

        let caller = null;

        // 1. Primary lookup: direct assigned_caller_id on Patient
        if (patient.assigned_caller_id) {
            caller = await Caller.findById(patient.assigned_caller_id)
                .select('name employee_id profile_photo_url languages_spoken experience_years phone city');
        }

        // 2. Fallback lookup: search Caller whose patient_ids includes this patient
        if (!caller) {
            caller = await Caller.findOne({ patient_ids: patient._id, is_active: true })
                .select('name employee_id profile_photo_url languages_spoken experience_years phone city');

            // Auto-heal: sync the relationship back to the Patient document
            if (caller) {
                patient.assigned_caller_id = caller._id;
                await patient.save();
                console.log(`[Auto-heal] Synced assigned_caller_id for patient ${patient.email} → Caller ${caller.name}`);
            }
        }

        // Build manager object from populated field
        const manager = patient.assigned_manager_id || null;

        res.json({ caller: caller || null, manager: manager || null });
    } catch (error) {
        console.error('Get assigned caller error:', error);
        res.status(500).json({ error: 'Failed to get assigned caller' });
    }
});

/**
 * GET /api/users/patients/me/calls
 * Patient gets their call history — caller_notes and admin_notes are STRIPPED
 */
router.get('/me/calls', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(200).json({ calls: [], pagination: { total: 0 }, error: 'Patient profile not found' });
        }

        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const calls = await CallLog.find({ patient_id: patient._id })
            .select('-caller_notes -admin_notes') // SECURITY: strip private fields
            .sort({ call_date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('caller_id', 'name profile_photo_url');

        const total = await CallLog.countDocuments({ patient_id: patient._id });

        res.json({
            calls,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error('Get patient calls error:', error);
        res.status(500).json({ error: 'Failed to get call history' });
    }
});

/**
 * GET /api/users/patients/me/medications
 * Patient gets their medication schedule
 */
router.get('/me/medications', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id })
            .select('medications');
        if (!patient) {
            return res.status(200).json({ medications: [], error: 'Patient profile not found' });
        }
        res.json({ medications: patient.medications });
    } catch (error) {
        console.error('Get medications error:', error);
        res.status(500).json({ error: 'Failed to get medications' });
    }
});

/**
 * GET /api/users/patients/me/notifications
 * Patient gets all their persistent backend notifications
 */
router.get('/me/notifications', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        const notifications = await Notification.find({ patient_id: patient._id })
            .sort({ created_at: -1 });

        res.json({ notifications });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

/**
 * PUT /api/users/patients/me/notifications/:id/read
 * Mark a persistent backend notification as read
 */
router.put('/me/notifications/:id/read', authenticateSession, validateObjectId('id'), async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, patient_id: patient._id },
            { $set: { is_read: true } },
            { new: true }
        );

        if (!notification) return res.status(404).json({ error: 'Notification not found' });

        res.json({ success: true, notification });
    } catch (error) {
        console.error('Read notification error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

/**
 * GET /api/users/patients/me/ai-prediction
 * Get the AI predictive vitals for patient
 */
router.get('/me/ai-prediction', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        const prediction = await AIVitalPrediction.findOne({ patient_id: patient._id });
        if (!prediction) {
            return res.status(200).json({ prediction: null, message: 'No AI predictions generated yet.' });
        }

        res.json({ prediction });
    } catch (error) {
        console.error('Get AI Prediction error:', error);
        res.status(500).json({ error: 'Failed to fetch AI Prediction' });
    }
});


/**
 * PUT /api/users/patients/me/medications
 * Add or update a medication
 */
router.put('/me/medications', authenticateSession, async (req, res) => {
    try {
        const { _id, name, dosage, frequency, times, start_date, end_date, is_active, instructions, prescribed_by } = req.body;
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        // Auto-sync abstract times to concrete scheduledTimes based on preferences
        let scheduledTimes = [];
        if (times && times.length > 0) {
            const prefs = patient.medication_call_preferences || { morning: '09:00', afternoon: '14:00', night: '20:00' };
            if (times.includes('morning')) scheduledTimes.push(prefs.morning);
            if (times.includes('afternoon') || times.includes('evening')) scheduledTimes.push(prefs.afternoon);
            if (times.includes('night')) scheduledTimes.push(prefs.night);
            scheduledTimes = [...new Set(scheduledTimes)].sort();
        }

        if (_id) {
            const item = patient.medications.id(_id);
            if (item) item.set({ name, dosage, frequency, times, scheduledTimes, start_date, end_date, is_active, instructions, prescribed_by });
        } else {
            patient.medications.push({ name, dosage, frequency, times, scheduledTimes, start_date, end_date, is_active, instructions, prescribed_by });
        }
        await patient.save();
        res.json({ medications: patient.medications });
    } catch (error) {
        console.error('Update medications error:', error);
        res.status(500).json({ error: 'Failed to update medications' });
    }
});

/**
 * PUT /api/users/patients/me/call-preferences
 * Update medication call times for morning/afternoon/night slots
 */
router.put('/me/call-preferences', authenticateSession, async (req, res) => {
    try {
        const { morning, afternoon, night } = req.body;
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        patient.medication_call_preferences = {
            morning: morning || patient.medication_call_preferences?.morning || '09:00',
            afternoon: afternoon || patient.medication_call_preferences?.afternoon || '14:00',
            night: night || patient.medication_call_preferences?.night || '20:00'
        };

        // Sync abstract call preferences to the actual scheduledTimes in each medication
        if (patient.medications && patient.medications.length > 0) {
            patient.medications.forEach(med => {
                const newScheduledTimes = [];
                const prefs = patient.medication_call_preferences;
                if (med.times && med.times.length > 0) {
                    if (med.times.includes('morning')) newScheduledTimes.push(prefs.morning);
                    if (med.times.includes('afternoon') || med.times.includes('evening')) newScheduledTimes.push(prefs.afternoon);
                    if (med.times.includes('night')) newScheduledTimes.push(prefs.night);
                } else if (med.scheduledTimes && med.scheduledTimes.length > 0) {
                    med.scheduledTimes.forEach(st => {
                        const hr = parseInt(st.split(':')[0], 10);
                        if (hr < 12) newScheduledTimes.push(prefs.morning);
                        else if (hr >= 12 && hr < 17) newScheduledTimes.push(prefs.afternoon);
                        else newScheduledTimes.push(prefs.night);
                    });
                }
                if (newScheduledTimes.length > 0) {
                    med.scheduledTimes = [...new Set(newScheduledTimes)].sort();
                }
            });
        }

        await patient.save();
        res.json({ preferences: patient.medication_call_preferences, message: 'Preferences updated successfully' });
    } catch (error) {
        console.error('Update call preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

/**
 * PUT /api/users/patients/me/medical-history
 * Add or update a medical history event
 */
/**
 * POST /api/users/patients/me/flag-issue
 * Patient flags a missed call or complaint
 */
router.post('/me/flag-issue', authenticateSession, async (req, res) => {
    try {
        const { type, description } = req.body;
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

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
        console.error('Flag issue error:', error);
        res.status(500).json({ error: 'Failed to flag issue' });
    }
});



/**
 * POST /api/users/patients/me/vitals
 * Log new vitals for a specific date (or today).
 * Uses the updated VitalLog schema (oxygen_saturation, hydration as %).
 */
router.post('/me/vitals', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        const { date, heart_rate, blood_pressure, oxygen_saturation, hydration, source } = req.body;
        const logDate = date ? new Date(date) : new Date();

        // Create new log (we no longer overwrite, allowing multiple entries per day)
        const vitalLog = new VitalLog({
            patient_id: patient._id,
            date: logDate,
            heart_rate,
            blood_pressure,
            oxygen_saturation,
            hydration,
            source: source || 'manual'
        });

        await vitalLog.save();
        res.status(201).json({ message: 'Vitals logged successfully', vitals: vitalLog });
    } catch (error) {
        console.error('Log vitals error:', error);
        if (error.name === 'ValidationError') {
            const details = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: 'Validation failed', details });
        }
        res.status(500).json({ error: 'Failed to log vitals' });
    }
});

/**
 * GET /api/users/patients/me/vitals
 * Fetch vitals history with optional start_date and end_date queries
 */
router.get('/me/vitals', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

        const { start_date, end_date } = req.query;
        let query = { patient_id: patient._id };

        if (start_date || end_date) {
            query.date = {};
            if (start_date) {
                // Ensure we start at the beginning of the local day
                const sd = new Date(start_date);
                sd.setHours(0, 0, 0, 0);
                query.date.$gte = sd;
            }
            if (end_date) {
                // Ensure we end at the very end of the local day
                const ed = new Date(end_date);
                ed.setHours(23, 59, 59, 999);
                query.date.$lte = ed;
            }
        } else {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            thirtyDaysAgo.setHours(0, 0, 0, 0);
            query.date = { $gte: thirtyDaysAgo };
        }

        const vitals = await VitalLog.find(query).sort({ date: 1 }); // Ascending order for graphs
        res.json({ vitals });
    } catch (error) {
        console.error('Get vitals error:', error);
        res.status(500).json({ error: 'Failed to fetch vitals history' });
    }
});



// ─── Security & Privacy Settings ────────────────────────────

/**
 * POST /api/users/patients/me/security/screenshots/request-otp
 * Request an OTP to change the `allow_screenshots` setting.
 */
router.post('/me/security/screenshots/request-otp', authenticateSession, async (req, res) => {
    try {
        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        const otpService = require('../../services/otpService');
        const emailService = require('../../services/emailService');

        const otp = await otpService.createOTP(patient.email);
        await emailService.sendSecurityOTPEmail(patient.email, otp);

        res.json({ message: 'OTP sent successfully to your registered email' });
    } catch (err) {
        console.error('Request screenshot OTP error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * POST /api/users/patients/me/security/screenshots/verify
 * Verify OTP and toggle `allow_screenshots` setting.
 */
router.post('/me/security/screenshots/verify', authenticateSession, async (req, res) => {
    try {
        const { otp, allow } = req.body;
        if (!otp || typeof allow !== 'boolean') {
            return res.status(400).json({ error: 'OTP and boolean "allow" parameter are required' });
        }

        const patient = await Patient.findOne({ supabase_uid: req.user.id });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        const otpService = require('../../services/otpService');
        const verification = await otpService.verifyOTP(patient.email, otp);

        if (!verification.valid) {
            return res.status(400).json({ error: verification.reason });
        }

        patient.allow_screenshots = allow;
        await patient.save();

        res.json({
            message: allow ? 'Screenshots enabled' : 'Screenshots disabled and secured',
            allow_screenshots: patient.allow_screenshots,
            patient
        });
    } catch (err) {
        console.error('Verify screenshot OTP error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
