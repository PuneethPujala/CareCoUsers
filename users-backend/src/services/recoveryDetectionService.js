/**
 * Recovery Detection Service
 *
 * Analyzes historical snapshots to determine if a patient is on a recovery trajectory.
 */

/**
 * Check if a patient is in recovery status.
 * @param {Array} history snapshots of PatientHealthStateHistory (sorted ascending by date)
 * @param {Number} currentRiskScore the latest computed risk score
 * @param {Array} recentAlerts list of recent alert documents
 * @param {Number} careVisibility care visibility coverage score (0-100)
 * @returns {Object} { recovery_status: Boolean, recovery_days: Number, confidence: Number }
 */
function detectRecovery(
  history = [],
  currentRiskScore = 0,
  recentAlerts = [],
  careVisibility = 100,
) {
  const mapRiskToScore = (level) => {
    if (level === "high") return 80;
    if (level === "medium") return 50;
    if (level === "low") return 20;
    return 50;
  };

  const riskScores = history.map((h) => mapRiskToScore(h.risk));
  riskScores.push(currentRiskScore);

  const len = riskScores.length;
  let recoveryDays = 0;

  // Count consecutive days of risk decline or stability
  for (let i = len - 1; i > 0; i--) {
    if (riskScores[i] < riskScores[i - 1]) {
      recoveryDays++;
    } else if (riskScores[i] === riskScores[i - 1]) {
      recoveryDays++;
    } else {
      break;
    }
  }

  // Rule 1: Risk decline streak >= 2 days and has a net risk reduction
  const hasNetDecline =
    len > 1 &&
    riskScores[len - 1] < riskScores[Math.max(0, len - 1 - recoveryDays)];
  const isDeclining = recoveryDays >= 2 && hasNetDecline;

  // Rule 2: No critical vital alerts in the last 7 days
  const hasCriticalAlerts = recentAlerts.some((alert) => {
    const isRecent =
      new Date(alert.created_at) >
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const isCritical =
      alert.severity === "critical" || alert.type === "critical_vital";
    return isRecent && isCritical;
  });

  // Rule 3: Average adherence over last 7 days >= 75%
  const recentHistory = history.slice(-7);
  const adherenceSum = recentHistory.reduce(
    (acc, h) => acc + (h.adherence?.today ?? 0),
    0,
  );
  const adherenceAvg =
    recentHistory.length > 0 ? adherenceSum / recentHistory.length : 100;
  const isAdherenceHigh = adherenceAvg >= 75;

  const recoveryStatus = isDeclining && !hasCriticalAlerts && isAdherenceHigh;

  // Calculate confidence score (0-100)
  // Decreases if Care Visibility is low or adherence is moderate
  const confidence = recoveryStatus
    ? Math.round(careVisibility * (adherenceAvg / 100))
    : 0;

  return {
    recovery_status: recoveryStatus,
    recovery_days: recoveryStatus ? recoveryDays : 0,
    confidence: Math.min(100, Math.max(0, confidence)),
  };
}

module.exports = {
  detectRecovery,
};
