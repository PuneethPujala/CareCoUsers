/**
 * Trajectory Forecast Service
 * 
 * Computes deterministic trend projections (slopes) and projects health score 14 days out.
 */

/**
 * Calculates the linear regression slope of a series of values.
 * @param {Array} values numeric values
 * @returns {Number} slope value
 */
function calculateSlope(values = []) {
    const N = values.length;
    if (N < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < N; i++) {
        const x = i + 1;
        const y = values[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    }

    const numerator = N * sumXY - sumX * sumY;
    const denominator = N * sumXX - sumX * sumX;

    if (denominator === 0) return 0;
    return numerator / denominator;
}

/**
 * Project health score and trajectory 14 days into the future.
 * @param {Array} history snapshots of PatientHealthStateHistory (sorted ascending by date)
 * @param {Number} currentScore the latest computed health score
 * @returns {Object} { projected_score_14d: Number, trajectory: String }
 */
function forecastTrajectory(history = [], currentScore = 82) {
    const scores = history.map(h => h.score);
    scores.push(currentScore);

    const m7 = calculateSlope(scores.slice(-7));
    const m14 = calculateSlope(scores.slice(-14));
    const m30 = calculateSlope(scores.slice(-30));

    // Weighted slope combining short, medium, and long-term trend
    const weightedSlope = 0.5 * m7 + 0.3 * m14 + 0.2 * m30;

    let trajectory = 'stable';
    if (weightedSlope > 0.25) {
        trajectory = 'positive';
    } else if (weightedSlope < -0.25) {
        trajectory = 'negative';
    }

    // Project 14 days out: if stable, project no change from current score
    const projectionDelta = trajectory === 'stable' ? 0 : weightedSlope * 14;
    const projectedScore = Math.min(100, Math.max(0, Math.round(currentScore + projectionDelta)));

    return {
        projected_score_14d: projectedScore,
        trajectory
    };
}

module.exports = {
    calculateSlope,
    forecastTrajectory
};
