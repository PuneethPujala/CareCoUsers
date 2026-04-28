require('dotenv').config();
const mongoose = require('mongoose');
const Profile = require('./src/models/Profile');
const Patient = require('./src/models/Patient');
const Notification = require('./src/models/Notification');
const CallLog = require('./src/models/CallLog');
const CaretakerPatient = require('./src/models/CaretakerPatient');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected');

    // ── 1. Wipe ALL old seeded ──
    const del = await Notification.deleteMany({ 'data.seeded': true });
    console.log(`Deleted ${del.deletedCount} old seeded\n`);

    // ── 2. Load REAL data ──
    const profiles = await Profile.find({
        role: { $in: ['caller','caretaker','care_manager','org_admin','super_admin'] },
        isActive: true,
    }).select('_id fullName role organizationId').lean();

    // Patient collection uses `name`, not `fullName`
    const patients = await Patient.find({}).select('_id name medications').lean();
    console.log('Patients:', patients.map(p => p.name).join(', '));

    // Build a patientId → name map
    const patientNameMap = {};
    patients.forEach(p => { patientNameMap[p._id.toString()] = p.name || 'Unknown Patient'; });

    // Assignments
    const assignments = await CaretakerPatient.find({ status: 'active' }).lean();

    // Recent calls
    const calls = await CallLog.find({}).sort({ scheduledTime: -1 }).limit(20).lean();

    // ── 3. Build real notifications per profile ──
    const now = new Date();
    const h = (hrs) => new Date(now.getTime() - hrs * 60 * 60 * 1000);
    let total = 0;

    for (const prof of profiles) {
        const notifs = [];

        // Get patient names assigned to this user
        const myAssignmentIds = assignments
            .filter(a => a.caretakerId?.toString() === prof._id.toString())
            .map(a => a.patientId?.toString());
        const myPatientNames = myAssignmentIds.map(id => patientNameMap[id]).filter(Boolean);

        // Get this user's call history
        const myCalls = calls.filter(c => c.caretakerId?.toString() === prof._id.toString());
        const completedCalls = myCalls.filter(c => c.status === 'completed').length;

        // ─────────── CALLER / CARETAKER ───────────
        if (prof.role === 'caller' || prof.role === 'caretaker') {
            if (myPatientNames.length > 0) {
                notifs.push({
                    type: 'call_overdue', priority: 'high', createdAt: h(1),
                    title: 'Call Overdue',
                    body: `Your scheduled call with ${myPatientNames[0]} is overdue. Please complete it as soon as possible.`,
                });
                notifs.push({
                    type: 'medication_alert', priority: 'urgent', createdAt: h(0.3),
                    title: 'Medication Confirmation Pending',
                    body: `${myPatientNames[0]} has medications pending confirmation for today.`,
                });
            }
            if (myPatientNames.length > 1) {
                notifs.push({
                    type: 'call_reminder', priority: 'normal', createdAt: h(3),
                    title: 'Upcoming Call',
                    body: `You have a scheduled call with ${myPatientNames[1]} coming up. Review their medication list before calling.`,
                });
            }
            if (myPatientNames.length > 2) {
                notifs.push({
                    type: 'patient_reassigned', priority: 'normal', createdAt: h(8),
                    title: 'Patient Assignment Update',
                    body: `${myPatientNames[2]} has been added to your care roster.`,
                });
            }
            notifs.push({
                type: 'shift_reminder', priority: 'normal', createdAt: h(20),
                title: 'Shift Update',
                body: `You have ${myPatientNames.length} patient${myPatientNames.length !== 1 ? 's' : ''} assigned for your current shift.`,
            });
            if (myCalls.length > 0) {
                notifs.push({
                    type: 'weekly_summary', priority: 'low', createdAt: h(48),
                    title: 'Weekly Summary',
                    body: `You completed ${completedCalls} of ${myCalls.length} calls recently. ${completedCalls === myCalls.length ? 'Excellent work!' : 'Keep improving!'}`,
                });
            }
        }

        // ─────────── CARE MANAGER ───────────
        if (prof.role === 'care_manager') {
            const patientsWithMeds = patients.filter(p => (p.medications || []).length > 0);
            const callerCount = profiles.filter(p => p.role === 'caller' || p.role === 'caretaker').length;

            if (patientsWithMeds.length > 0) {
                notifs.push({
                    type: 'low_adherence_alert', priority: 'urgent', createdAt: h(1),
                    title: 'Adherence Alert',
                    body: `${patientsWithMeds[0].name}'s medication adherence needs review. Immediate attention recommended.`,
                });
            }
            notifs.push({
                type: 'compliance_alert', priority: 'high', createdAt: h(4),
                title: 'Compliance Report',
                body: `${patients.length} patients are being monitored. Review daily compliance metrics across your team.`,
            });
            notifs.push({
                type: 'sla_breach', priority: 'high', createdAt: h(6),
                title: 'SLA Review Required',
                body: `Review call completion SLAs for your team. Ensure all overdue calls are addressed promptly.`,
            });
            notifs.push({
                type: 'assignment_change', priority: 'normal', createdAt: h(24),
                title: 'Team Assignment Status',
                body: `${callerCount} caller${callerCount !== 1 ? 's' : ''} active in your team. All patient assignments are up to date.`,
            });
            notifs.push({
                type: 'report_ready', priority: 'normal', createdAt: h(48),
                title: 'Weekly Report Available',
                body: `Your team's weekly performance report is ready for review.`,
            });
        }

        // ─────────── ORG ADMIN ───────────
        if (prof.role === 'org_admin') {
            const orgUserCount = profiles.filter(p => p.organizationId?.toString() === prof.organizationId?.toString()).length;
            notifs.push({
                type: 'new_user_added', priority: 'normal', createdAt: h(2),
                title: 'Organization Overview',
                body: `Your organization has ${orgUserCount} active users and ${patients.length} patients.`,
            });
            notifs.push({
                type: 'account_activity', priority: 'high', createdAt: h(12),
                title: 'Security Notice',
                body: `Admin portal access detected from your account. If unauthorized, update your password immediately.`,
            });
            notifs.push({
                type: 'system_announcement', priority: 'low', createdAt: h(5),
                title: 'System Update',
                body: `Role-based notification system is now active. Alerts will be delivered based on your role permissions.`,
            });
            notifs.push({
                type: 'compliance_alert', priority: 'normal', createdAt: h(36),
                title: 'Organization Adherence',
                body: `${patients.length} patients being monitored organization-wide. Review adherence from the dashboard.`,
            });
        }

        // ─────────── SUPER ADMIN ───────────
        if (prof.role === 'super_admin') {
            notifs.push({
                type: 'system_announcement', priority: 'normal', createdAt: h(1),
                title: 'System Health',
                body: `All services operational. ${profiles.length} active admin users, ${patients.length} patients in the platform.`,
            });
            notifs.push({
                type: 'new_user_added', priority: 'low', createdAt: h(12),
                title: 'Platform Overview',
                body: `${profiles.length} active profiles across all organizations. All systems nominal.`,
            });
            notifs.push({
                type: 'account_activity', priority: 'normal', createdAt: h(24),
                title: 'Admin Access Log',
                body: `Recent admin portal sessions verified. No unauthorized access detected.`,
            });
            notifs.push({
                type: 'sla_breach', priority: 'low', createdAt: h(48),
                title: 'Platform SLA Report',
                body: `API uptime healthy. No critical service disruptions reported this week.`,
            });
        }

        // ── Insert ──
        if (notifs.length > 0) {
            const docs = notifs.map((n, i) => ({
                recipientId: prof._id,
                organizationId: prof.organizationId,
                type: n.type,
                channel: 'in_app',
                title: n.title,
                body: n.body,
                priority: n.priority,
                data: { seeded: true, real: true },
                status: i < Math.ceil(notifs.length * 0.6) ? 'delivered' : 'read',
                readAt: i >= Math.ceil(notifs.length * 0.6) ? n.createdAt : undefined,
                createdAt: n.createdAt,
                updatedAt: n.createdAt,
            }));
            await Notification.insertMany(docs);
            console.log(`✅ ${prof.fullName} (${prof.role}): ${docs.length} notifications — patients: [${myPatientNames.join(', ')}]`);
            total += docs.length;
        }
    }

    console.log(`\nTotal: ${total} notifications from REAL database data`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
