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
    const patient = await Patient.findById(patientId).select('name date_of_birth gender profile_id timezone medications gamification');
    if (!patient) return null;
    
    const tz = patient.timezone || 'Asia/Kolkata';
    const profile = await Profile.findById(patient.profile_id).select('blood_type dietary_restrictions medical_history vaccinations');
    
    const now = moment().tz(tz);
    const todayStr = now.format('YYYY-MM-DD');
    const threeDaysAgoDate = new Date(`${now.clone().subtract(3, 'days').format('YYYY-MM-DD')}T00:00:00.000Z`);
    const sevenDaysAgoDate = new Date(`${now.clone().subtract(7, 'days').format('YYYY-MM-DD')}T00:00:00.000Z`);

    // 2. Active Medications (search both patient._id and profile_id like the rest of the app)
    const searchIds = [patient._id];
    if (patient.profile_id) searchIds.push(patient.profile_id);
    
    const externalMeds = await Medication.find({ patientId: { $in: searchIds }, isActive: true })
        .select('name dosage frequency times scheduledTimes instructions -_id');
    
    // Also include embedded patient.medications
    const embeddedMeds = (patient.medications || []).filter(m => m.is_active !== false);
    
    // Merge (external first, dedup by name)
    const seenNames = new Set();
    const allMeds = [];
    for (const m of externalMeds) {
        if (m.name && !seenNames.has(m.name.toLowerCase())) {
            seenNames.add(m.name.toLowerCase());
            allMeds.push({ name: m.name, dosage: m.dosage, freq: m.frequency, times: m.times || m.scheduledTimes });
        }
    }
    for (const m of embeddedMeds) {
        if (m.name && !seenNames.has(m.name.toLowerCase())) {
            seenNames.add(m.name.toLowerCase());
            allMeds.push({ name: m.name, dosage: m.dosage, freq: 'daily', times: m.times });
        }
    }

    // 3. Adherence (Last 3 Days) — query by `date` field (UTC midnight dates)
    const logs = await MedicineLog.find({
        patient_id: patient._id,
        date: { $gte: threeDaysAgoDate }
    }).sort({ date: -1 });
    
    let takenMeds = 0;
    let totalMeds = 0;
    logs.forEach(log => {
        const activeMeds = log.medicines.filter(m => m.is_active !== false);
        totalMeds += activeMeds.length;
        takenMeds += activeMeds.filter(m => m.taken).length;
    });
    const missedMeds = totalMeds - takenMeds;

    // 3b. Today's session state — individual med status + last log time
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
    const todayLog = await MedicineLog.findOne({ patient_id: patient._id, date: todayDate });
    let todayStatus = null;
    if (todayLog) {
        const activeTodayMeds = todayLog.medicines.filter(m => m.is_active !== false);
        const todayTaken = activeTodayMeds.filter(m => m.taken).length;
        const todayTotal = activeTodayMeds.length;
        const lastTakenEntry = activeTodayMeds
            .filter(m => m.taken && m.taken_at)
            .sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at))[0];

        todayStatus = {
            total_scheduled: todayTotal,
            taken: todayTaken,
            missed: todayTotal - todayTaken,
            rate: todayTotal > 0 ? Math.round((todayTaken / todayTotal) * 100) + '%' : 'N/A',
            all_done: todayTotal > 0 && todayTaken === todayTotal,
            last_log_time: lastTakenEntry ? moment(lastTakenEntry.taken_at).tz(tz).format('h:mm A') : null,
            medicines: activeTodayMeds.map(m => ({
                name: m.medicine_name,
                time_slot: m.scheduled_time,
                taken: m.taken
            }))
        };
    }

    // 4. Vitals (7-Day Aggregate)
    const vitals = await VitalLog.find({
        patient_id: patient._id,
        date: { $gte: sevenDaysAgoDate }
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

    // 5. Streak
    const currentStreak = patient.gamification?.current_streak || 0;
    const longestStreak = patient.gamification?.longest_streak || 0;

    // 6. Build final payload
    const payload = {
        patient: {
            name: patient.name,
            age: patient.date_of_birth ? moment().diff(patient.date_of_birth, 'years') : 'Unknown',
            gender: patient.gender,
            blood_type: profile?.blood_type,
            diet: profile?.dietary_restrictions
        },
        today: todayStr,
        current_time: now.format('h:mm A'),
        streak: {
            current: currentStreak,
            longest: longestStreak,
            label: currentStreak >= 14 ? 'Strong' : currentStreak >= 7 ? 'Building' : currentStreak >= 3 ? 'Starting' : 'New'
        },
        today_status: todayStatus,
        medical_history: (profile?.medical_history || []).map(h => h.event).slice(0, 5), // Top 5
        vaccinations: (profile?.vaccinations || []).map(v => v.name),
        medications: allMeds,
        recent_adherence: {
            period: 'Last 3 days',
            total_scheduled: totalMeds,
            taken: takenMeds,
            missed: missedMeds,
            rate: totalMeds > 0 ? Math.round((takenMeds / totalMeds) * 100) + '%' : 'N/A'
        },
        recent_vitals: vitalsSummary
    };

    return payload;
}

module.exports = { buildPatientContext };
