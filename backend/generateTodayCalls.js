require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/database');

async function generateTodayCalls() {
    await connectDB();
    const Patient = require('./src/models/Patient');
    const Profile = require('./src/models/Profile');
    const CaretakerPatient = require('./src/models/CaretakerPatient');
    const CallLog = require('./src/models/CallLog');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    console.log('Fetching active assignments...');
    const assignments = await CaretakerPatient.find({ status: 'active' }).populate('patientId caretakerId');
    
    let createdCount = 0;

    for (const assignment of assignments) {
        if (!assignment.patientId || !assignment.caretakerId) continue;
        
        const orgId = assignment.patientId.organization_id || assignment.caretakerId.organizationId;
        
        // Check if call log exists for today
        const existingCall = await CallLog.findOne({
            patientId: assignment.patientId._id,
            caretakerId: assignment.caretakerId._id,
            scheduledTime: { $gte: startOfToday, $lte: endOfToday }
        });

        if (!existingCall) {
            // Schedule call 1 hour from now or at least within today
            const scheduledTime = new Date();
            scheduledTime.setHours(scheduledTime.getHours() + 1);
            if (scheduledTime > endOfToday) {
                scheduledTime.setHours(23, 0, 0, 0);
            }

            await CallLog.create({
                patientId: assignment.patientId._id,
                caretakerId: assignment.caretakerId._id,
                organizationId: orgId,
                scheduledTime: scheduledTime,
                status: 'scheduled',
                priority: 'routine'
            });
            console.log(`[+] Created CallLog for Patient ${assignment.patientId.name} -> Caretaker ${assignment.caretakerId.fullName}`);
            createdCount++;
        } else {
            console.log(`[ ] Skipping Patient ${assignment.patientId.name} -> Caretaker ${assignment.caretakerId.fullName} (CallLog already exists)`);
        }
    }

    console.log(`Done. Created ${createdCount} new call logs for today.`);
    await mongoose.disconnect();
}

generateTodayCalls().catch(e => {
    console.error(e);
    process.exit(1);
});
