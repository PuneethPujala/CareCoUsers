const mongoose = require('mongoose');
const Patient = require('../models/Patient');

/**
 * ─── Auto-Seed Basic Profile ────────────────────────────
 * This is the ultimate fallback: if a user logs in but has NO Mongo record,
 * we provision a minimum viable profile so the system doesn't crash.
 */
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
        console.log(`✅ [Self-Heal] Auto-seeded basic profile for ${email} (paid: ${paid})`);
        return patient;
    } catch (err) {
        if (err.code === 11000) {
            console.log(`ℹ️ [Self-Heal] Patient already exists or conflict for ${email}, attempting to re-fetch.`);
            const existing = await Patient.findOne({
                $or: [{ supabase_uid: supabaseUid }, { email: email.toLowerCase() }]
            });
            if (existing) {
                if (existing.supabase_uid !== supabaseUid) {
                    console.log(`[Self-Heal] Updating stale supabase_uid for patient ${email}`);
                    existing.supabase_uid = supabaseUid;
                    await existing.save();
                }
                return existing;
            }
        }
        throw err;
    }
}

/**
 * Core business logic to fetch or initialize a patient profile.
 * Decoupled from Express 'req' to support background jobs & testing.
 */
async function findOrCreatePatientRecord({ supabaseUid, email, name, profileId = null }) {
    let patient = await Patient.findOne({ supabase_uid: supabaseUid });
    if (!patient) {
        try {
            patient = await createBasicPatient(supabaseUid, email, name, profileId);
        } catch (err) {
            console.error('findOrCreatePatientRecord error:', err);
            throw err;
        }
    }
    return patient;
}

/**
 * Express-aware wrapper that adds request-level caching.
 */
async function getOrCreatePatient(req, customName = null) {
    if (req.patient) return req.patient;

    const patient = await findOrCreatePatientRecord({
        supabaseUid: req.user.id,
        email: req.user.email,
        name: customName || req.user.user_metadata?.full_name || req.user.user_metadata?.name,
        profileId: req.profile?._id
    });

    req.patient = patient; 
    return patient;
}

module.exports = {
    createBasicPatient,
    findOrCreatePatientRecord,
    getOrCreatePatient
};
