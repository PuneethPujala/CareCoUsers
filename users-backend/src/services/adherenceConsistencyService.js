/**
 * Adherence Consistency Service
 *
 * Computes standard deviation and consistency score for medication adherence over historical snapshots.
 */

/**
 * Calculate the standard deviation and consistency of adherence.
 * @param {Array} history snapshots of PatientHealthStateHistory
 * @returns {Object} { adherence_average: Number, adherence_consistency: Number }
 */
function calculateConsistency(history = []) {
  if (!history || history.length === 0) {
    return { adherence_average: 0, adherence_consistency: 100 };
  }

  const adherenceValues = history.map((h) => h.adherence?.today ?? 0);
  const count = adherenceValues.length;

  // Calculate Average
  const sum = adherenceValues.reduce((acc, val) => acc + val, 0);
  const average = Math.round(sum / count);

  if (count < 2) {
    return { adherence_average: average, adherence_consistency: 100 };
  }

  // Calculate Standard Deviation
  const mean = sum / count;
  const varianceSum = adherenceValues.reduce(
    (acc, val) => acc + Math.pow(val - mean, 2),
    0
  );
  const standardDeviation = Math.sqrt(varianceSum / count);

  // Consistency score formula: max(0, 100 - 2 * stdDev)
  const consistency = Math.max(0, Math.round(100 - 2 * standardDeviation));

  return {
    adherence_average: average,
    adherence_consistency: consistency,
  };
}

module.exports = {
  calculateConsistency,
};
