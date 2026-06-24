/**
 * Parses the Accept header and checks if markdown is explicitly negotiated.
 * Default to JSON (application/json) for wildcard formats and standard clients.
 *
 * @param {Object} req - The Express request object.
 * @returns {boolean} True if text/markdown should be returned, false otherwise.
 */
function shouldNegotiateMarkdown(req) {
    const accept = req.headers.accept;
    if (!accept) return false;

    // Split by comma to get individual media types
    const types = accept.split(',').map(part => part.trim().toLowerCase());
    
    let markdownWeight = -1;
    let jsonWeight = -1;

    for (const type of types) {
        // Parse media type and parameters (like q=0.8)
        const [mediaType, ...params] = type.split(';').map(p => p.trim());
        
        let q = 1.0; // default weight is 1.0
        for (const param of params) {
            if (param.startsWith('q=')) {
                q = parseFloat(param.substring(2)) || 0;
            }
        }

        if (mediaType === 'text/markdown' || mediaType === 'text/x-markdown') {
            markdownWeight = q;
        } else if (mediaType === 'application/json') {
            jsonWeight = q;
        } else if (mediaType === '*/*') {
            // Wildcard sets the baseline jsonWeight
            if (jsonWeight === -1) {
                jsonWeight = q;
            }
        }
    }

    // Markdown must be explicitly requested and not weighted to 0
    if (markdownWeight > 0) {
        // If JSON is also requested (or matched via wildcard), compare weights.
        // If weights are equal, JSON wins to prioritize API client defaults.
        if (jsonWeight >= 0) {
            return markdownWeight > jsonWeight;
        }
        return true;
    }

    return false;
}

/**
 * Formats a daily medication log and preference schedule into clean Markdown.
 * Used for content negotiation under GET /api/users/medicines/today.
 *
 * @param {Object} log - The daily medicine log object.
 * @param {Object} preferences - The time-of-day preferred hour preferences.
 * @returns {string} Fully formatted Markdown string.
 */
function formatTodayMedicationsMarkdown(log, preferences) {
    let dateStr = 'Today';
    if (log && log.date) {
        try {
            dateStr = new Date(log.date).toISOString().slice(0, 10);
        } catch (e) {
            dateStr = String(log.date).slice(0, 10);
        }
    }

    let markdown = `# Today's Medication Schedule (CareMyMed)\n`;
    markdown += `*Date: ${dateStr}*\n\n`;

    const buckets = { morning: [], afternoon: [], evening: [], night: [] };
    const medicines = (log && log.medicines) || [];
    
    medicines.forEach(m => {
        const time = m.scheduled_time || 'morning';
        if (buckets[time]) {
            buckets[time].push(m);
        } else {
            // fallback for safety
            buckets['morning'].push(m);
        }
    });

    const orderedBuckets = ['morning', 'afternoon', 'evening', 'night'];
    orderedBuckets.forEach(bucket => {
        const list = buckets[bucket];
        const bucketName = bucket.charAt(0).toUpperCase() + bucket.slice(1);
        const prefTime = preferences && preferences[bucket] ? ` (Preferred Time: ${preferences[bucket]})` : '';
        
        markdown += `## ${bucketName}${prefTime}\n`;
        if (list.length === 0) {
            markdown += `No medications scheduled.\n\n`;
        } else {
            list.forEach(m => {
                const status = m.taken ? '✅ Taken' : '❌ Pending';
                const dosageStr = m.dosage ? ` - Dose: ${m.dosage}` : '';
                const instructionsStr = m.instructions ? ` (${m.instructions})` : '';
                const refillStr = (m.refillInfo && typeof m.refillInfo.remainingDoses === 'number')
                    ? ` [Supply: ${m.refillInfo.remainingDoses}/${m.refillInfo.totalDoses || 30} left]`
                    : '';
                markdown += `- **${m.medicine_name}**: ${status}${dosageStr}${instructionsStr}${refillStr}\n`;
            });
            markdown += `\n`;
        }
    });

    return markdown.trim();
}

/**
 * Formats overall health adherence details and insights into clean Markdown.
 * Used for content negotiation under GET /api/users/medicines/adherence/details.
 *
 * @param {Object} details - The full adherence details payload.
 * @returns {string} Fully formatted Markdown string.
 */
function formatAdherenceDetailsMarkdown(details) {
    let markdown = `# Medication Adherence & Health Summary (CareMyMed)\n\n`;

    // Clinical disclaimer
    markdown += `> [!IMPORTANT]\n`;
    markdown += `> **Disclaimer:** AI-generated clinical insights are for informational purposes only and do not constitute a clinical diagnosis or medical advice. Please consult your physician for changes to your treatment plan.\n\n`;

    // 1. Scores & Consistency
    const score = details.score || { weekly: 0, monthly: 0 };
    const levelLabel = details.level ? `${details.level.label} ${details.level.emoji}` : 'N/A';
    const streak = details.streak || 0;
    const vitalsAdherence = details.vitals_adherence || 0;
    const momentum = details.momentum || 'steady';

    markdown += `## Adherence Scores & Status\n`;
    markdown += `* **Weekly Adherence**: ${score.weekly}%\n`;
    markdown += `* **Monthly Adherence**: ${score.monthly}% (${levelLabel})\n`;
    markdown += `* **Adherence Momentum**: ${momentum}\n`;
    markdown += `* **Current Streak**: ${streak} Day${streak === 1 ? '' : 's'} 🔥\n`;
    markdown += `* **Vitals Logging Consistency (Last 30 Days)**: ${vitalsAdherence}%\n\n`;

    // 2. AI Clinical Insights
    markdown += `## Clinical Insights\n`;
    const insights = details.insights || [];
    if (insights.length === 0) {
        markdown += `No adherence trends or clinical insights generated for this period.\n\n`;
    } else {
        insights.forEach(insight => {
            markdown += `* ${insight}\n`;
        });
        markdown += `\n`;
    }

    // 3. Achievements
    markdown += `## Achievements & Milestones\n`;
    const achievements = details.achievements || [];
    const unlocked = achievements.filter(a => a.unlocked);
    const locked = achievements.filter(a => !a.unlocked);

    markdown += `### Unlocked (${unlocked.length}/${achievements.length})\n`;
    if (unlocked.length === 0) {
        markdown += `* No achievements unlocked yet.\n`;
    } else {
        unlocked.forEach(a => {
            const tierEmoji = a.tier === 'legendary' ? '👑' : a.tier === 'gold' ? '🏆' : a.tier === 'silver' ? '🥈' : '🥉';
            markdown += `* ${tierEmoji} **${a.label}** (${a.tier}): ${a.description}\n`;
        });
    }
    markdown += `\n`;

    markdown += `### Next Up (Locked)\n`;
    if (locked.length === 0) {
        markdown += `* You have unlocked all achievements!\n`;
    } else {
        // Show up to 5 locked achievements closest to completion
        const nextUp = locked
            .sort((a, b) => (b.progress || 0) - (a.progress || 0))
            .slice(0, 5);

        nextUp.forEach(a => {
            const pct = Math.round((a.progress || 0) * 100);
            markdown += `* 🔒 **${a.label}**: ${a.description} (${a.progressLabel || `${pct}% complete`})\n`;
        });
    }

    return markdown.trim();
}

module.exports = {
    shouldNegotiateMarkdown,
    formatTodayMedicationsMarkdown,
    formatAdherenceDetailsMarkdown,
};
