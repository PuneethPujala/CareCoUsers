/**
 * aiContextService.js
 * 
 * Responsible for building a highly compressed, token-optimized JSON payload
 * representing the patient's current health context.
 * 
 * Strict Truncation Rules:
 * - Vitals: 7-day aggregate only
 * - Medications: Active only, with next scheduled time
 * - Adherence: 3-day history summary only
 */

const moment = require('moment-timezone');
const Patient = require('../models/Patient');
const Profile = require('../models/Profile');
const Medication = require('../models/Medication');
const MedicineLog = require('../models/MedicineLog');
const VitalLog = require('../models/VitalLog');

/**
 * Builds the truncated patient context for LLM injection
 * @param {string} patientId 
 * @returns {object} Highly optimized JSON object
 */
async function buildPatientContext(patientId) {
    // 1. Fetch Patient & Profile
    const patient = await Patient.findById(patientId).select('name date_of_birth gender profile_id timezone');
    if (!patient) return null;
    
    const tz = patient.timezone || 'UTC';
    const profile = await Profile.findById(patient.profile_id).select('blood_type dietary_restrictions medical_history vaccinations');
    
    const now = moment().tz(tz);
    const threeDaysAgo = now.clone().subtract(3, 'days').startOf('day').toDate();
    const sevenDaysAgo = now.clone().subtract(7, 'days').startOf('day').toDate();

    // 2. Active Medications
    const activeMeds = await Medication.find({ patient_id: patientId, is_active: true })
        .select('name dosage frequency times -_id');
        
    // 3. Adherence (Last 3 Days)
    const logs = await MedicineLog.find({
        patient_id: patientId,
        scheduled_time: { $gte: threeDaysAgo }
    }).select('status scheduled_time');
    
    let takenMeds = 0;
    let missedMeds = 0;
    logs.forEach(log => {
        if (log.status === 'taken') takenMeds++;
        else missedMeds++;
    });

    // 4. Vitals (7-Day Aggregate)
    const vitals = await VitalLog.find({
        patient_id: patientId,
        date: { $gte: sevenDaysAgo }
    }).select('heart_rate blood_pressure oxygen_saturation hydration');

    let vitalsSummary = 'No vitals logged in last 7 days';
    if (vitals.length > 0) {
        const sum = arr => arr.reduce((a, b) => a + b, 0);
        const hrs = vitals.map(v => v.heart_rate).filter(Boolean);
        const sys = vitals.map(v => v.blood_pressure?.systolic).filter(Boolean);
        const dia = vitals.map(v => v.blood_pressure?.diastolic).filter(Boolean);
        const ox = vitals.map(v => v.oxygen_saturation).filter(Boolean);

        vitalsSummary = {
            days_logged: vitals.length,
            heart_rate: hrs.length ? { min: Math.min(...hrs), max: Math.max(...hrs), avg: Math.round(sum(hrs)/hrs.length) } : null,
            blood_pressure: sys.length ? {
                sys_avg: Math.round(sum(sys)/sys.length),
                dia_avg: Math.round(sum(dia)/dia.length)
            } : null,
            spo2_avg: ox.length ? Math.round(sum(ox)/ox.length) : null,
        };
    }

    // 5. Build final payload
    const payload = {
        patient: {
            name: patient.name,
            age: patient.date_of_birth ? moment().diff(patient.date_of_birth, 'years') : 'Unknown',
            gender: patient.gender,
            blood_type: profile?.blood_type,
            diet: profile?.dietary_restrictions
        },
        medical_history: (profile?.medical_history || []).map(h => h.event).slice(0, 5), // Top 5
        vaccinations: (profile?.vaccinations || []).map(v => v.name),
        medications: activeMeds.map(m => ({
            name: m.name,
            dosage: m.dosage,
            freq: m.frequency,
            times: m.times
        })),
        recent_adherence: {
            period: 'Last 3 days',
            taken: takenMeds,
            missed: missedMeds
        },
        recent_vitals: vitalsSummary
    };

    return payload;
}

module.exports = { buildPatientContext };
