const mongoose = require('mongoose');
const CallLog = require('../models/CallLog');
const Escalation = require('../models/Escalation');
const Profile = require('../models/Profile');
const Medication = require('../models/Medication');
const CaretakerPatient = require('../models/CaretakerPatient');

/**
 * ═══════════════════════════════════════════════════════════════
 * ANALYTICS SERVICE
 * Returns chart-ready data arrays for dashboard visualizations.
 * All functions return { labels, datasets } or [{ x, y }] arrays.
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. WEEKLY ADHERENCE TREND ──────────────────────────────────

/**
 * Returns weekly adherence rates for chart rendering.
 *
 * @param {ObjectId|string} organizationId
 * @param {number} [weeks=8]
 * @returns {{ labels: string[], data: number[], details: Array }}
 */
async function getWeeklyAdherenceTrend(organizationId, weeks = 8) {
    const startDate = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
    const match = {
        scheduledTime: { $gte: startDate },
        status: { $in: ['completed', 'missed', 'no_answer'] },
    };
    if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

    const result = await CallLog.aggregate([
        { $match: match },
        { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
        {
            $group: {
                _id: {
                    year: { $isoWeekYear: '$scheduledTime' },
                    week: { $isoWeek: '$scheduledTime' },
                },
                total: { $sum: 1 },
                confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
            },
        },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]);

    const labels = result.map(r => `W${r._id.week}`);
    const data = result.map(r => Math.round((r.confirmed / Math.max(r.total, 1)) * 100));
    const details = result.map(r => ({
        x: `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`,
        y: Math.round((r.confirmed / Math.max(r.total, 1)) * 100),
        confirmed: r.confirmed,
        total: r.total,
    }));

    return { labels, data, details };
}

// ── 2. CALL OUTCOME DISTRIBUTION ────────────────────────────────

/**
 * Pie/donut chart data for call outcomes.
 *
 * @param {ObjectId|string} organizationId
 * @param {{ startDate?: Date, endDate?: Date }} [dateRange]
 * @returns {{ labels: string[], data: number[], colors: string[], details: Array }}
 */
async function getCallOutcomeDistribution(organizationId, dateRange = {}) {
    const match = {};
    if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

    if (dateRange.startDate || dateRange.endDate) {
        match.scheduledTime = {};
        if (dateRange.startDate) match.scheduledTime.$gte = new Date(dateRange.startDate);
        if (dateRange.endDate) match.scheduledTime.$lte = new Date(dateRange.endDate);
    } else {
        match.scheduledTime = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const result = await CallLog.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$outcome',
                count: { $sum: 1 },
            },
        },
        { $sort: { count: -1 } },
    ]);

    const outcomeColors = {
        all_confirmed: '#22c55e',
        partial_confirmed: '#f59e0b',
        refused: '#ef4444',
        not_reached: '#94a3b8',
        follow_up_needed: '#8b5cf6',
        rescheduled: '#06b6d4',
        null: '#d1d5db',
    };

    const outcomeLabels = {
        all_confirmed: 'All Confirmed',
        partial_confirmed: 'Partially Confirmed',
        refused: 'Refused',
        not_reached: 'Not Reached',
        follow_up_needed: 'Follow-up Needed',
        rescheduled: 'Rescheduled',
        null: 'Pending',
    };

    return {
        labels: result.map(r => outcomeLabels[r._id] || r._id || 'Unknown'),
        data: result.map(r => r.count),
        colors: result.map(r => outcomeColors[r._id] || '#9ca3af'),
        details: result.map(r => ({
            x: outcomeLabels[r._id] || r._id || 'Unknown',
            y: r.count,
            outcome: r._id,
        })),
    };
}

// ── 3. CARETAKER PERFORMANCE RANKINGS ───────────────────────────

/**
 * Ranked list of caretakers with composite score.
 *
 * @param {ObjectId|string} organizationId
 * @param {number} [days=30]
 * @returns {{ rankings: Array, teamAverage: number }}
 */
async function getCaretakerPerformanceRankings(organizationId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { scheduledTime: { $gte: startDate } };
    if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

    const callMetrics = await CallLog.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$caretakerId',
                totalCalls: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                avgDuration: { $avg: '$duration' },
                avgRating: { $avg: '$callQuality.rating' },
                followUps: { $sum: { $cond: ['$followUpRequired', 1, 0] } },
            },
        },
        {
            $lookup: {
                from: 'profiles',
                localField: '_id',
                foreignField: '_id',
                as: 'profile',
            },
        },
        { $unwind: '$profile' },
        { $match: { 'profile.role': { $in: ['caretaker', 'caller'] } } },
        {
            $project: {
                id: '$_id',
                name: '$profile.fullName',
                avatarUrl: '$profile.avatarUrl',
                email: '$profile.email',
                totalCalls: 1,
                completed: 1,
                missed: 1,
                completionRate: {
                    $round: [{ $multiply: [{ $divide: ['$completed', { $max: ['$totalCalls', 1] }] }, 100] }, 0],
                },
                avgDuration: { $round: [{ $ifNull: ['$avgDuration', 0] }, 0] },
                avgRating: { $round: [{ $ifNull: ['$avgRating', 0] }, 1] },
                followUps: 1,
            },
        },
        { $sort: { completionRate: -1 } },
    ]);

    // Enrich with patient count and escalation data + composite scoring
    const rankings = await Promise.all(callMetrics.map(async (ct, index) => {
        const [patientCount, escalations] = await Promise.all([
            CaretakerPatient.countDocuments({ caretakerId: ct._id, status: 'active' }),
            Escalation.countDocuments({ caretakerId: ct._id, createdAt: { $gte: startDate } }),
        ]);

        const ratingScore = ct.avgRating ? (ct.avgRating / 5) * 100 : 75;
        const escalationScore = Math.max(0, 100 - escalations * 10);
        const compositeScore = Math.round(
            ct.completionRate * 0.50 +
            ratingScore * 0.20 +
            escalationScore * 0.15 +
            (ct.avgDuration > 0 ? Math.min(100, ct.avgDuration / 3) : 0) * 0.15
        );

        return {
            rank: index + 1,
            ...ct,
            patientCount,
            escalations,
            compositeScore,
        };
    }));

    // Sort by composite score
    rankings.sort((a, b) => b.compositeScore - a.compositeScore);
    rankings.forEach((r, i) => { r.rank = i + 1; });

    const teamAverage = rankings.length
        ? Math.round(rankings.reduce((s, r) => s + r.compositeScore, 0) / rankings.length)
        : 0;

    return { rankings, teamAverage };
}

// ── 4. PATIENT RISK DISTRIBUTION ────────────────────────────────

/**
 * Categorises patients into risk buckets based on adherence + escalations.
 * Returns data suitable for a pie or bar chart.
 *
 * Risk Levels:
 *   low    → adherence >= 85 % and 0 open escalations
 *   medium → adherence 60-84 % or 1–2 open escalations
 *   high   → adherence < 60 % or 3+ open escalations or critical escalation
 *
 * @param {ObjectId|string} organizationId
 * @returns {{ labels: string[], data: number[], patients: object, colors: string[] }}
 */
async function getPatientRiskDistribution(organizationId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const patientFilter = { role: 'patient', isActive: true };
    if (organizationId) patientFilter.organizationId = new mongoose.Types.ObjectId(organizationId);

    const patients = await Profile.find(patientFilter).select('_id fullName avatarUrl metadata').lean();
    const patientIds = patients.map(p => p._id);

    // Adherence per patient
    const adherenceAgg = await CallLog.aggregate([
        {
            $match: {
                patientId: { $in: patientIds },
                scheduledTime: { $gte: thirtyDaysAgo },
                status: { $in: ['completed', 'missed', 'no_answer'] },
            },
        },
        { $unwind: { path: '$medicationConfirmations', preserveNullAndEmptyArrays: false } },
        {
            $group: {
                _id: '$patientId',
                total: { $sum: 1 },
                confirmed: { $sum: { $cond: ['$medicationConfirmations.confirmed', 1, 0] } },
            },
        },
    ]);
    const adherenceMap = Object.fromEntries(
        adherenceAgg.map(a => [a._id.toString(), Math.round((a.confirmed / Math.max(a.total, 1)) * 100)])
    );

    // Open escalations per patient
    const escalationAgg = await Escalation.aggregate([
        {
            $match: {
                patientId: { $in: patientIds },
                status: { $in: ['open', 'acknowledged', 'in_progress'] },
            },
        },
        {
            $group: {
                _id: '$patientId',
                count: { $sum: 1 },
                hasCritical: { $max: { $cond: [{ $eq: ['$priority', 'critical'] }, 1, 0] } },
            },
        },
    ]);
    const escalationMap = Object.fromEntries(
        escalationAgg.map(e => [e._id.toString(), { count: e.count, hasCritical: !!e.hasCritical }])
    );

    // Classify
    const buckets = { low: [], medium: [], high: [] };

    patients.forEach(p => {
        const adherence = adherenceMap[p._id.toString()] ?? (p.metadata?.adherence_rate ?? 100);
        const escData = escalationMap[p._id.toString()] || { count: 0, hasCritical: false };

        let risk = 'low';
        if (adherence < 60 || escData.count >= 3 || escData.hasCritical) {
            risk = 'high';
        } else if (adherence < 85 || escData.count >= 1) {
            risk = 'medium';
        }

        buckets[risk].push({
            id: p._id,
            name: p.fullName,
            avatarUrl: p.avatarUrl,
            adherence,
            openEscalations: escData.count,
        });
    });

    return {
        labels: ['Low Risk', 'Medium Risk', 'High Risk'],
        data: [buckets.low.length, buckets.medium.length, buckets.high.length],
        colors: ['#22c55e', '#f59e0b', '#ef4444'],
        patients: buckets,
        total: patients.length,
    };
}

// ── 5. DAILY CALL VOLUME TREND ──────────────────────────────────

/**
 * Line chart of daily call volumes over time.
 *
 * @param {ObjectId|string} organizationId
 * @param {number} [days=30]
 * @returns {{ labels: string[], completed: number[], missed: number[], scheduled: number[] }}
 */
async function getDailyCallVolume(organizationId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { scheduledTime: { $gte: startDate } };
    if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

    const result = await CallLog.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime' } },
                total: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                missed: { $sum: { $cond: [{ $in: ['$status', ['missed', 'no_answer']] }, 1, 0] } },
                scheduled: { $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] } },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    return {
        labels: result.map(r => r._id),
        completed: result.map(r => r.completed),
        missed: result.map(r => r.missed),
        scheduled: result.map(r => r.scheduled),
        details: result.map(r => ({ x: r._id, total: r.total, completed: r.completed, missed: r.missed })),
    };
}

// ── 6. ESCALATION ANALYTICS ─────────────────────────────────────

/**
 * Escalation breakdown by type, priority, and resolution time.
 *
 * @param {ObjectId|string} organizationId
 * @param {number} [days=30]
 * @returns {{ byType: Array, byPriority: Array, avgResolutionTime: object }}
 */
async function getEscalationAnalytics(organizationId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { createdAt: { $gte: startDate } };
    if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

    const [byType, byPriority, resolutionTime] = await Promise.all([
        Escalation.aggregate([
            { $match: match },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        Escalation.aggregate([
            { $match: match },
            { $group: { _id: '$priority', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        Escalation.aggregate([
            { $match: { ...match, status: 'resolved', resolvedAt: { $exists: true } } },
            {
                $project: {
                    resolutionMinutes: {
                        $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 60000],
                    },
                    priority: 1,
                },
            },
            {
                $group: {
                    _id: '$priority',
                    avgMinutes: { $avg: '$resolutionMinutes' },
                    minMinutes: { $min: '$resolutionMinutes' },
                    maxMinutes: { $max: '$resolutionMinutes' },
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const priorityColors = {
        critical: '#ef4444',
        high: '#f97316',
        medium: '#f59e0b',
        low: '#22c55e',
    };

    return {
        byType: byType.map(t => ({
            type: t._id,
            label: t._id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            count: t.count,
        })),
        byPriority: byPriority.map(p => ({
            priority: p._id,
            count: p.count,
            color: priorityColors[p._id] || '#9ca3af',
        })),
        avgResolutionTime: Object.fromEntries(
            resolutionTime.map(r => [
                r._id,
                { avgMinutes: Math.round(r.avgMinutes), minMinutes: Math.round(r.minMinutes), maxMinutes: Math.round(r.maxMinutes), resolved: r.count },
            ])
        ),
    };
}

module.exports = {
    getWeeklyAdherenceTrend,
    getCallOutcomeDistribution,
    getCaretakerPerformanceRankings,
    getPatientRiskDistribution,
    getDailyCallVolume,
    getEscalationAnalytics,
};
