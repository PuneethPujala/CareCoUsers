const cron = require("node-cron");
const { checkSystemHealth } = require("../services/observabilityService");

let jobInstance = null;

function startObservabilityCron() {
  if (jobInstance) return;

  // Run every 15 minutes
  jobInstance = cron.schedule("*/15 * * * *", () => {
    checkSystemHealth().catch((err) => {
      console.error("[ObservabilityJob] Error in evaluation cycle:", err);
    });
  });

  console.log(
    "📊 Observability Metrics Evaluator Cron started (Every 15 minutes).",
  );
}

module.exports = {
  startObservabilityCron,
};
