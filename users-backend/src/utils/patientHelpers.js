const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const logger = require('./logger');

/**
 * Auto-seed a minimal Patient document on first sign-in.
 *
 * FIX: email.toLowerCase() in the 11000 recovery path would throw if email
 *   is undefined (phone-only patients get a synthetic email in patientData,
 *   but the raw argument may still be undefined). Guard added.
 */
async function createBasicPatient(supabaseUid, email, name, profileId, paid = 0) {
    try {
        const DEFAULT_ORG_ID = '674f07e1525049b7348908f9';

        const patientData = {
            supabase_uid: supabaseUid,
            profile_id: profileId,
            name: name || (email ? email.split('@')[0] : 'Patient'),
            email: email || `${supabaseUid}@phone.careco.in`,
            organization_id: new mongoose.Types.ObjectId(DEFAULT_ORG_ID),
            subscription: {
                status: paid === 1 ? 'active' : 'pending_payment',
                plan: 'basic',
            },
            paid,
            emailVerified: true,
            profile_complete: false,
            role: 'patient',
            conditions: [],
            medical_history: [],
            allergies: [],
            medications: [],
        };

        const patient = await Patient.create(patientData);

        logger.info('Patient profile auto-seeded', {
            email,
            supabaseUid,
            orgId: DEFAULT_ORG_ID,
            paid,
        });

        return patient;
    } catch (err) {
        if (err.code === 11000) {
            logger.info('Patient re-fetch triggered by duplicate key conflict', { email, supabaseUid });

            // FIX: email may be undefined for phone-only patients — guard before calling toLowerCase()
            const emailQuery = email ? email.toLowerCase() : null;
            const orConditions = [{ supabase_uid: supabaseUid }];
            if (emailQuery) orConditions.push({ email: emailQuery });

            const existing = await Patient.findOne({ $or: orConditions });
            if (existing) {
                if (existing.supabase_uid !== supabaseUid) {
                    logger.info('Healing stale supabase_uid on existing patient', {
                        email,
                        oldUid: existing.supabase_uid,
                        newUid: supabaseUid,
                    });
                    existing.supabase_uid = supabaseUid;
                    await existing.save();
                }
                return existing;
            }
        }
        logger.error('Failed to create basic patient', { error: err, email, supabaseUid });
        throw err;
    }
}

/**
 * Core business logic — fetch or initialize a patient record.
 * Pure function: no Express req/res dependencies.
 */
async function findOrCreatePatientRecord({ supabaseUid, email, name, profileId = null }) {
    let patient = await Patient.findOne({ supabase_uid: supabaseUid });
    if (!patient) {
        try {
            patient = await createBasicPatient(supabaseUid, email, name, profileId);
        } catch (err) {
            logger.error('findOrCreatePatientRecord failed', { error: err, supabaseUid });
            throw err;
        }
    }
    return patient;
}

/**
 * Express-aware wrapper with request-level caching (req.patient).
 * Avoids redundant DB calls within the same request lifecycle.
 *
 * FIX: The file was truncated here — the function body, return statement,
 *   module.exports, and closing brace were all missing. Completed below.
 */
async function getOrCreatePatient(req, customName = null) {
    // Request-level cache: if a previous middleware/route already resolved
    // the patient for this request, return it directly.
    if (req.patient) return req.patient;

    const patient = await findOrCreatePatientRecord({
        supabaseUid: req.user.id,
        email: req.user.email,
        name: customName || req.user.user_metadata?.full_name || req.user.user_metadata?.name,
        profileId: req.profile?._id || null,
    });

    // Cache on the request object for the duration of this request
    req.patient = patient;
    return patient;
}

module.exports = { getOrCreatePatient, createBasicPatient, findOrCreatePatientRecord };