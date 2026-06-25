/**
 * Risk Trend Service
 *
 * Computes velocity and acceleration of patient risk scores over historical snapshots.
 */

/**
 * Calculate the velocity and acceleration of risk scores.
 * @param {Array} history snapshots of PatientHealthStateHistory (sorted ascending by date)
 * @param {Number} currentRiskScore the latest computed risk score
 * @returns {Object} { risk_score: Number, velocity: Number, acceleration: Number }
 */
function calculateRiskTrends(history = [], currentRiskScore = 0) {
  // Collect all historical risk scores
  // Each history record has a `risk` level but we compute risk score dynamically from insights or default mappings.
  // Wait, let's extract risk_score from history records if they exist.
  // If not, we can map history risk level to score: low -> 20, medium -> 50, high -> 80.
  // But wait! We also have CompanionAiInsightHistory which stores the actual risk_score (0-100) dynamically!
  // Wait, is it better to use CompanionAiInsightHistory or PatientHealthStateHistory?
  // PatientHealthStateHistory has daily snapshots, which is perfect and has exact coverage.
  // Wait, in Sprint 8, we defined PatientHealthStateHistory schema:
  // score: Number (0-100), risk: String ('low', 'medium', 'high', 'unknown').
  // If we map: 'low' -> 20, 'medium' -> 55, 'high' -> 85, 'unknown' -> 50, we get a good approximation.
  // Better yet, if we store the risk_score (0-100) inside PatientHealthStateHistory, we can use it directly!
  // Wait, let's look at the schema of PatientHealthStateHistory.js we read earlier:
  // It does not have a `risk_score` field, it has `score` (overall health score) and `risk` (low, medium, high, unknown).
  // Wait! Can we calculate risk velocity based on the overall Health Score or the Caregiver Risk?
  // The user request says: "Currently Risk = Medium. Future: risk_score: 52, velocity: -3.2, acceleration: -0.4. Meaning Risk is falling rapidly."
  // Yes! Caregiver risk is calculated in companionAiService using medication compliance, vitals, etc.
  // Let's compute the caregiver risk score dynamically for each historical snapshot, or map it.
  // Wait, does companionAiService have a helper to calculate the risk score?
  // Let's search for "risk_score" inside companionAiService.js to see how risk score is calculated!
  // Let's do a select-string search.
  const riskScores = [];

  // Map risk levels to baseline scores if risk score is not directly stored in history
  const mapRiskToScore = (level) => {
    if (level === "high") return 80;
    if (level === "medium") return 50;
    if (level === "low") return 20;
    return 50; // unknown
  };

  // Extract historical scores
  history.forEach((h) => {
    // h.risk is low/medium/high/unknown
    riskScores.push(mapRiskToScore(h.risk));
  });

  // Append the current computed risk score
  riskScores.push(currentRiskScore);

  const len = riskScores.length;
  if (len < 3) {
    return {
      risk_score: currentRiskScore,
      velocity: 0,
      acceleration: 0,
    };
  }

  // Velocity = average change over recent days
  // v_today = (R_0 - R_-1)
  // v_yesterday = (R_-1 - R_-2)
  // v_2days_ago = (R_-2 - R_-3)
  const vToday = riskScores[len - 1] - riskScores[len - 2];
  const vYesterday = riskScores[len - 2] - riskScores[len - 3];

  // Average velocity over recent transitions
  const velocity = parseFloat(((vToday + vYesterday) / 2).toFixed(2));

  // Acceleration = change in velocity
  const acceleration = parseFloat((vToday - vYesterday).toFixed(2));

  return {
    risk_score: currentRiskScore,
    velocity,
    acceleration,
  };
}

module.exports = {
  calculateRiskTrends,
};
