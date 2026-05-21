const mongoose = require('mongoose');
const dotenv = require('dotenv');
const MedicineLog = require('./src/models/MedicineLog');
const Patient = require('./src/models/Patient');

dotenv.config();

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // The bug window is today, May 21
    const targetDate = new Date('2026-05-21T00:00:00.000Z');

    const logs = await MedicineLog.find({ date: targetDate });
    console.log(`Found ${logs.length} logs for today.`);

    let updatedCount = 0;
    for (const log of logs) {
        let changed = false;
        for (const med of log.medicines) {
            // Revert Afternoon and Night meds that were marked by the patient today (due to queue bug)
            if ((med.scheduled_time === 'afternoon' || med.scheduled_time === 'night' || med.scheduled_time === 'evening') && med.taken && med.marked_by === 'patient') {
                console.log(`Reverting ${med.medicine_name} for ${med.scheduled_time}`);
                med.taken = false;
                med.taken_at = null;
                med.marked_by = null;
                changed = true;
                
                // Also revert in Patient document
                const patient = await Patient.findById(log.patient_id);
                if (patient) {
                    const pMed = patient.medications.find(m => m.name === med.medicine_name);
                    if (pMed) {
                        // Remove today's takenDates
                        if (pMed.takenDates) {
                            pMed.takenDates = pMed.takenDates.filter(d => {
                                try { return d.toISOString().split('T')[0] !== '2026-05-21'; } catch { return true; }
                            });
                        }
                        // Remove today's takenLogs marked by patient
                        if (pMed.takenLogs) {
                            pMed.takenLogs = pMed.takenLogs.filter(l => {
                                if (l.status === 'taken' && l.markedBy === 'patient' && l.timestamp) {
                                    try { return l.timestamp.toISOString().split('T')[0] !== '2026-05-21'; } catch { return true; }
                                }
                                return true;
                            });
                        }
                        patient.markModified('medications');
                        await patient.save();
                        console.log(`Reverted Patient med ${med.medicine_name}`);
                    }
                }
            }
        }
        if (changed) {
            await log.save();
            updatedCount++;
        }
    }
    
    console.log(`Updated ${updatedCount} logs.`);
    process.exit(0);
}

fix().catch(console.error);
