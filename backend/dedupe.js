const mongoose = require('mongoose');
require('dotenv').config();

async function fixTimezoneDuplicates() {
    await mongoose.connect(process.env.MONGODB_URI);
    const MedicineLog = require('./src/models/MedicineLog');

    console.log('--- STARTING DUPLICATE RESOLUTION ---');
    
    // Group all logs by patient_id
    const allLogs = await MedicineLog.find({}).lean();
    console.log(`Analyzing ${allLogs.length} total logs...`);

    const grouped = {};
    for (const log of allLogs) {
        const pIdStr = log.patient_id.toString();
        // Convert log.date to strict local YYYY-MM-DD
        // E.g., 2026-04-24T18:30:00.000Z maps to "2026-04-25" locally in IST
        // Let's use a safe offset for the user's expected tz (+05:30)
        // Or simpler, just convert timezone offset to get local YYYY-MM-DD
        const dateObj = new Date(log.date);
        
        // If it's near midnight UTC (00:00), it's the exact day.
        // If it's 18:30 UTC, it's actually the NEXT day in IST (+5:30).
        let localStr;
        if (dateObj.toISOString().includes('18:30:00.000Z')) {
            // It's IST midnight representation! Advance 1 day to get the real Date
            dateObj.setDate(dateObj.getDate() + 1);
            localStr = dateObj.toISOString().split('T')[0];
        } else {
            localStr = dateObj.toISOString().split('T')[0];
        }

        const key = `${pIdStr}_${localStr}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(log);
    }

    let deletedCount = 0;

    for (const [key, similarLogs] of Object.entries(grouped)) {
        if (similarLogs.length > 1) {
            console.log(`\nFound ${similarLogs.length} duplicate logs for ${key}! Merging...`);
            
            // Sort by createdAt descending so we keep the newest logic, or merge them safely
            similarLogs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            
            // Canonical log is the first one
            const canonical = similarLogs[0];
            const duplicateIds = similarLogs.slice(1).map(l => l._id);

            // Merge true checkmarks from duplicates into canonical
            for (let i = 1; i < similarLogs.length; i++) {
                const dup = similarLogs[i];
                for (const med of dup.medicines) {
                    if (med.taken) {
                        const canMed = canonical.medicines.find(m => m.medicine_name === med.medicine_name && m.scheduled_time === med.scheduled_time);
                        if (canMed && !canMed.taken) {
                            canMed.taken = true;
                            canMed.marked_by = med.marked_by;
                        }
                    }
                }
            }

            // Force canonical date strictly to UTC midnight 00:00:00.000Z
            const parts = key.split('_');
            const targetDateStr = parts[1];
            canonical.date = new Date(`${targetDateStr}T00:00:00.000Z`);

            // Save canonical
            await MedicineLog.updateOne({ _id: canonical._id }, {
                $set: { date: canonical.date, medicines: canonical.medicines }
            });

            // Delete duplicates
            await MedicineLog.deleteMany({ _id: { $in: duplicateIds } });
            deletedCount += duplicateIds.length;
            console.log(`  Merged and cleaned ${duplicateIds.length} duplicates for ${targetDateStr}`);
        } else if (similarLogs.length === 1) {
            // Fix timezone anyway
            const log = similarLogs[0];
            const parts = key.split('_');
            const targetDateStr = parts[1];
            const properDate = new Date(`${targetDateStr}T00:00:00.000Z`);
            
            if (log.date.getTime() !== properDate.getTime()) {
                await MedicineLog.updateOne({ _id: log._id }, { $set: { date: properDate } });
            }
        }
    }

    console.log(`\n✅ Finished! Deleted ${deletedCount} duplicate logs globally.`);
    process.exit(0);
}

fixTimezoneDuplicates();
