/**
 * Migration: Convert ActivityLog and BodyCompositionLog dates from server-local midnight
 * (e.g. T18:30:00Z for IST) to UTC midnight (T00:00:00Z).
 * 
 * Run: node scripts/migrate_utc_midnight.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  MIGRATION: Convert Local Midnight to UTC Midnight');
    console.log('═══════════════════════════════════════════════════\n');

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB.');

        const ActivityLog = require('../src/models/ActivityLog');
        const BodyCompositionLog = require('../src/models/BodyCompositionLog');

        // --- 1. Migrate ActivityLog ---
        console.log('\nAnalyzing ActivityLog documents...');
        const activityLogs = await ActivityLog.find({}).lean();
        console.log(`Found ${activityLogs.length} total ActivityLog documents.`);

        let activityUpdates = 0;
        for (const log of activityLogs) {
            const date = new Date(log.date);
            // Check if it is already normalized to UTC midnight
            if (
                date.getUTCHours() !== 0 ||
                date.getUTCMinutes() !== 0 ||
                date.getUTCSeconds() !== 0 ||
                date.getUTCMilliseconds() !== 0
            ) {
                // Determine the local date representation (written as local midnight)
                const localYear = date.getFullYear();
                const localMonth = date.getMonth();
                const localDay = date.getDate();
                const utcMidnight = new Date(Date.UTC(localYear, localMonth, localDay, 0, 0, 0, 0));

                console.log(`   [ActivityLog] Migrating doc ${log._id}: ${date.toISOString()} -> ${utcMidnight.toISOString()}`);
                
                await ActivityLog.updateOne(
                    { _id: log._id },
                    { $set: { date: utcMidnight } }
                );
                activityUpdates++;
            }
        }
        console.log(`✅ ActivityLog migration completed: ${activityUpdates} documents updated.`);

        // --- 2. Migrate BodyCompositionLog ---
        console.log('\nAnalyzing BodyCompositionLog documents...');
        const bodyLogs = await BodyCompositionLog.find({}).lean();
        console.log(`Found ${bodyLogs.length} total BodyCompositionLog documents.`);

        let bodyUpdates = 0;
        for (const log of bodyLogs) {
            const date = new Date(log.date);
            if (
                date.getUTCHours() !== 0 ||
                date.getUTCMinutes() !== 0 ||
                date.getUTCSeconds() !== 0 ||
                date.getUTCMilliseconds() !== 0
            ) {
                const localYear = date.getFullYear();
                const localMonth = date.getMonth();
                const localDay = date.getDate();
                const utcMidnight = new Date(Date.UTC(localYear, localMonth, localDay, 0, 0, 0, 0));

                console.log(`   [BodyCompositionLog] Migrating doc ${log._id}: ${date.toISOString()} -> ${utcMidnight.toISOString()}`);
                
                await BodyCompositionLog.updateOne(
                    { _id: log._id },
                    { $set: { date: utcMidnight } }
                );
                bodyUpdates++;
            }
        }
        console.log(`✅ BodyCompositionLog migration completed: ${bodyUpdates} documents updated.`);

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB.');
    }
}

migrate().catch(console.error);
