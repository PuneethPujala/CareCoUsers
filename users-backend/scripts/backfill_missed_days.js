const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Patient = require('../src/models/Patient');
const MedicineLog = require('../src/models/MedicineLog');
const Medication = require('../src/models/Medication');
const streakService = require('../src/services/streakService');

require('dotenv').config();

function mapTimeToLegacyBucket(timeStr) {
    if (!timeStr) return 'morning';
    const isPM = timeStr.toLowerCase().includes('pm');
    const isAM = timeStr.toLowerCase().includes('am');
    const match = timeStr.match(/(\d+):(\d+)/);
    if (match) {
        let hour = parseInt(match[1]);
        if (isPM && hour < 12) hour += 12;
        if (isAM && hour === 12) hour = 0;
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }
    return 'morning';
}

async function buildMergedMeds(patient) {
    const searchIds = [patient._id];
    if (patient.profile_id) searchIds.push(patient.profile_id);
    const externalMeds = await Medication.find({ patientId: { $in: searchIds }, isActive: true });

    const allMedsRaw = [];
    const seenNames = new Set();

    for (const extMed of externalMeds) {
        const name = extMed.name;
        if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            let mappedTimes = extMed.times?.length > 0
                ? extMed.times
                : (extMed.scheduledTimes || []).map(mapTimeToLegacyBucket);
            mappedTimes = [...new Set(mappedTimes)];
            if (mappedTimes.length === 0) mappedTimes = ['morning'];
            allMedsRaw.push({
                name: extMed.name,
                is_active: extMed.isActive,
                times: mappedTimes,
            });
        }
    }

    for (const med of (patient.medications || [])) {
        const name = med.name;
        if (name && !seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            allMedsRaw.push(med);
        }
    }

    return allMedsRaw;
}

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const patients = await Patient.find({});
        for (const patient of patients) {
            const allMedsRaw = await buildMergedMeds(patient);
            
            // If patient has no active meds, nothing to backfill
            const activeMeds = allMedsRaw.filter(m => m.is_active !== false);
            if (activeMeds.length === 0) continue;

            const timezone = patient.timezone || 'Asia/Kolkata';
            
            // Backfill for the month of May 2026 (or last 30 days)
            // The user mentioned gaps on May 10 and May 14
            const start = moment.tz('2026-05-01', timezone);
            const end = moment().tz(timezone).subtract(1, 'days'); // up to yesterday

            let cursor = start.clone();
            let addedCount = 0;

            while (cursor.isSameOrBefore(end)) {
                const dateStr = cursor.format('YYYY-MM-DD');
                const utcMidnight = new Date(`${dateStr}T00:00:00.000Z`);

                const existingLog = await MedicineLog.findOne({ patient_id: patient._id, date: utcMidnight });
                
                if (!existingLog) {
                    // Create missed log
                    const medicines = activeMeds.flatMap(med => {
                        return med.times.map(t => ({
                            medicine_name: med.name,
                            scheduled_time: t,
                            taken: false
                        }));
                    });

                    const newLog = new MedicineLog({
                        patient_id: patient._id,
                        date: utcMidnight,
                        medicines: medicines
                    });
                    
                    await newLog.save();
                    console.log(`[+] Created missed log for ${patient._id} on ${dateStr}`);
                    addedCount++;
                }

                cursor.add(1, 'day');
            }
            
            if (addedCount > 0) {
                // Re-evaluate streak for the patient
                await streakService.evaluateAndUpdateStreak(patient._id);
                console.log(`[*] Updated streak for ${patient._id}`);
            }
        }
        
        console.log('Backfill complete!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
