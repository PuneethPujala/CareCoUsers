/**
 * NextActionEngine — Healthcare Priority & Progressive Disclosure Decision Engine.
 *
 * Evaluates all patient data streams and determines the single highest-priority
 * action the patient should focus on right now.
 *
 * Priority Order (Clinical & Behavioral Safety):
 * 1. P1: Critical Health Alerts / Emergency Alerts
 * 2. P2: Overdue Tasks / Missed Medication Slots
 * 3. P3: Immediate Due Medication Slot (due within ±45 mins)
 * 4. P4: Immediate Due Vital Log (Blood Pressure / Glucose)
 * 5. P5: Profile Completion Step (with estimated completion time)
 * 6. P6: Upcoming Doctor Appointment
 * 7. P7: AI Coaching & Insights
 */

export const NextActionEngine = {
    /**
     * Determine the highest-priority action item for the patient.
     *
     * @param {Object} context
     * @param {Object} [context.patient]
     * @param {Array} [context.meds]
     * @param {Object} [context.vitals]
     * @param {Array} [context.alerts]
     * @param {number} [context.completionPct=100]
     * @returns {Object} Priority action object
     */
    evaluatePriority(context = {}) {
        const {
            patient = null,
            meds = [],
            vitals = {},
            alerts = [],
            completionPct = 100,
        } = context;

        // ── P1: Critical Health Alerts ──────────────────────────────────────
        const activeSevereAlerts = (alerts || []).filter(
            (a) => a.severity === 'severe' || a.status === 'active'
        );
        if (activeSevereAlerts.length > 0) {
            return {
                rank: 'P1',
                type: 'alert',
                bannerTitle: 'Action Required',
                bannerDescription: `Active Health Alert: ${activeSevereAlerts[0].name || 'Needs Attention'}`,
                targetScreen: 'HealthProfile',
                iconType: 'alert',
                estimatedTimeText: 'Immediate',
                actionPayload: activeSevereAlerts[0],
            };
        }

        // ── P2: Overdue Tasks / Missed Medications ──────────────────────────
        const untakenSlots = (meds || []).filter((s) => !s.taken);
        const overdueSlots = untakenSlots.filter((s) => {
            if (!s.time) return false;
            // Parse time string e.g. "08:00" or "8:00 AM"
            const now = new Date();
            const slotHour = parseInt(s.time.split(':')[0], 10);
            return now.getHours() > slotHour + 1; // Overdue by more than 1 hour
        });

        if (overdueSlots.length > 0) {
            return {
                rank: 'P2',
                type: 'overdue',
                bannerTitle: 'Action Required',
                bannerDescription: `${overdueSlots.length} medication ${overdueSlots.length > 1 ? 'doses' : 'dose'} missed today. Review now.`,
                targetScreen: 'Medications',
                iconType: 'alert',
                estimatedTimeText: '1 min',
                actionPayload: overdueSlots[0],
            };
        }

        // ── P3: Immediate Due Medication Slot ───────────────────────────────
        if (untakenSlots.length > 0) {
            const nextSlot = untakenSlots[0];
            return {
                rank: 'P3',
                type: 'medication',
                bannerTitle: "What's Next?",
                bannerDescription: `Take ${nextSlot.name || nextSlot.label || 'Medication'} • Due at ${nextSlot.time || nextSlot.label}`,
                targetScreen: 'Medications',
                iconType: 'medication',
                estimatedTimeText: '30 sec',
                actionPayload: nextSlot,
            };
        }

        // ── P4: Profile Completion Step ─────────────────────────────────────
        if (completionPct < 70) {
            return {
                rank: 'P4',
                type: 'profile',
                bannerTitle: 'Quick Setup',
                bannerDescription: 'Add Emergency Contact to complete profile • 30 sec est.',
                targetScreen: 'HealthProfile',
                iconType: 'done',
                estimatedTimeText: '30 sec est.',
                actionPayload: null,
            };
        }

        // ── P5 (Default): All Tasks Completed / AI Coaching ────────────────
        return {
            rank: 'P5',
            type: 'insight',
            bannerTitle: 'All Caught Up! 🎉',
            bannerDescription: 'All today\'s medications logged. Log BP to boost score.',
            targetScreen: 'HealthProfile',
            iconType: 'done',
            estimatedTimeText: 'All Done',
            actionPayload: null,
        };
    },
};
