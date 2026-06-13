/**
 * Health Momentum Service
 * 
 * Computes multi-factor momentum score and direction based on 30-day score, adherence, streak, and mood changes.
 */

/**
 * Calculates health momentum.
 * @param {Array} history snapshots of PatientHealthStateHistory (sorted ascending by date)
 * @param {Object} currentState the latest health state
 * @returns {Object} momentum metrics
 */
function calculateMomentum(history = [], currentState = {}) {
    const defaultState = {
        score: currentState.score ?? 82,
        adherence: currentState.adherence?.today ?? 0,
        streak: currentState.adherence?.streak ?? 0,
        mood: currentState.mood ?? 'good'
    };

    const oldest = history.length > 0 ? history[0] : null;
    const moodScores = { sad: 20, okay: 50, good: 80, great: 100 };

    const scoreChange = oldest ? (defaultState.score - oldest.score) : 0;
    const adherenceChange = oldest ? (defaultState.adherence - (oldest.adherence?.today ?? 0)) : 0;
    const streakChange = oldest ? (defaultState.streak - (oldest.adherence?.streak ?? 0)) : 0;
    
    const moodTodayVal = moodScores[defaultState.mood] ?? 80;
    const moodOldestVal = oldest ? (moodScores[oldest.mood] ?? 80) : 80;
    const moodChange = moodTodayVal - moodOldestVal;

    // Base momentum is 50 (neutral/stable)
    let momentum = 50;

    // Apply weighted changes
    // 35% Health Score Trend (up to +/- 17.5 points)
    const scoreWeight = Math.min(17.5, Math.max(-17.5, scoreChange * 1.5));
    // 30% Adherence Trend (up to +/- 15 points)
    const adherenceWeight = Math.min(15, Math.max(-15, adherenceChange * 0.25));
    // 20% Streak Growth (up to +/- 10 points)
    const streakWeight = Math.min(10, Math.max(-10, streakChange * 1.0));
    // 15% Mood Delta (up to +/- 7.5 points)
    const moodWeight = Math.min(7.5, Math.max(-7.5, moodChange * 0.1));

    momentum += scoreWeight + adherenceWeight + streakWeight + moodWeight;

    // Clamp score between 0 and 100
    const momentumScore = Math.min(100, Math.max(0, Math.round(momentum)));

    let direction = 'stable';
    if (momentumScore >= 70) {
        direction = 'improving';
    } else if (momentumScore <= 40) {
        direction = 'declining';
    }

    return {
        momentum_score: momentumScore,
        momentum_direction: direction,
        score_change_30d: scoreChange,
        adherence_change_30d: adherenceChange,
        streak_change_30d: streakChange
    };
}

module.exports = {
    calculateMomentum
};
