const cron = require("node-cron");
const axios = require("axios");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");

const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";

/**
 * Poll pending Expo push receipts from the last 24 hours.
 */
const pollPushReceipts = async () => {
  const startTime = Date.now();
  console.log(
    `[Job] Push Receipt Polling started at ${new Date().toISOString()}`,
  );

  try {
    // Find notifications sent in the last 24 hours with pending receipt status and a ticket ID
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notifications = await Notification.find({
      expo_receipt_status: "pending",
      expo_ticket_id: { $exists: true, $ne: null, $ne: "" },
      created_at: { $gte: cutoffTime },
    }).select("_id patient_id expo_ticket_id expo_push_token");

    if (notifications.length === 0) {
      console.log("[Job] No pending push receipts to poll.");
      return;
    }

    // Map and extract unique ticket IDs
    const ticketIdMap = new Map();
    for (const notif of notifications) {
      ticketIdMap.set(notif.expo_ticket_id, notif);
    }
    const ticketIds = Array.from(ticketIdMap.keys());

    console.log(
      `[Job] Polling receipts for ${ticketIds.length} unique ticket(s)...`,
    );

    // Batch ticket IDs (Expo allows up to 1000 at a time)
    const batchSize = 1000;
    for (let i = 0; i < ticketIds.length; i += batchSize) {
      const batchIds = ticketIds.slice(i, i + batchSize);

      try {
        const response = await axios.post(
          EXPO_RECEIPT_URL,
          {
            ids: batchIds,
          },
          {
            headers: {
              Accept: "application/json",
              "Accept-encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            timeout: 10000, // 10 seconds timeout
          },
        );

        const receipts = response.data?.data;
        if (!receipts || typeof receipts !== "object") {
          console.warn(
            "[Job] Malformed or empty receipts response from Expo:",
            response.data,
          );
          continue;
        }

        // Process receipts one by one
        for (const ticketId of batchIds) {
          const receipt = receipts[ticketId];
          if (!receipt) {
            // Not ready yet or not found, leave as pending
            continue;
          }

          const correspondingNotif = ticketIdMap.get(ticketId);
          if (!correspondingNotif) continue;

          if (receipt.status === "ok") {
            // Mark notification as delivered and receipt as OK
            await Notification.updateMany(
              { expo_ticket_id: ticketId },
              {
                $set: {
                  expo_receipt_status: "ok",
                  push_delivered: true,
                  receipt_checked_at: new Date(),
                },
              },
            );

            // Reset push failures for the corresponding patient
            if (correspondingNotif.patient_id) {
              await Patient.findByIdAndUpdate(correspondingNotif.patient_id, {
                $set: { expo_push_token_failures: 0 },
              });
            }
          } else if (receipt.status === "error") {
            const errorMsg =
              receipt.details?.error || receipt.message || "Unknown error";
            console.error(
              `[Job] Receipt error for ticket ${ticketId}: ${errorMsg}`,
            );

            // Mark notification as failed
            await Notification.updateMany(
              { expo_ticket_id: ticketId },
              {
                $set: {
                  expo_receipt_status: "error",
                  expo_receipt_error: errorMsg,
                  receipt_checked_at: new Date(),
                },
              },
            );

            // Handle token failures and pruning for terminal errors
            const terminalErrors = [
              "DeviceNotRegistered",
              "InvalidCredentials",
              "MessageTooBig",
            ];
            if (terminalErrors.includes(receipt.details?.error)) {
              const patientId = correspondingNotif.patient_id;
              const loggedToken = correspondingNotif.expo_push_token;

              if (patientId && loggedToken) {
                const patient = await Patient.findById(patientId).select(
                  "expo_push_token expo_push_token_failures",
                );
                // Only prune or increment if the token hasn't changed since the push was sent
                if (patient && patient.expo_push_token === loggedToken) {
                  const nextFailures =
                    (patient.expo_push_token_failures || 0) + 1;
                  if (nextFailures >= 3) {
                    console.warn(
                      `[Job] Pruning token for patient ${patientId} after 3 consecutive failures.`,
                    );
                    await Patient.findByIdAndUpdate(patientId, {
                      $set: {
                        expo_push_token: null,
                        expo_push_token_failures: 0,
                      },
                    });
                  } else {
                    await Patient.findByIdAndUpdate(patientId, {
                      $set: { expo_push_token_failures: nextFailures },
                    });
                    console.log(
                      `[Job] Incremented token failures for patient ${patientId} to ${nextFailures}.`,
                    );
                  }
                }
              }
            }
          }
        }
      } catch (batchErr) {
        console.error(
          `[Job] Error polling receipt batch starting at index ${i}:`,
          batchErr.message,
        );
      }
    }
  } catch (error) {
    console.error("[Job] Push Receipt Polling failed:", error);
  } finally {
    console.log(
      `[Job] Push Receipt Polling finished in ${Date.now() - startTime}ms`,
    );
  }
};

/**
 * Sweep and prune push tokens from inactive devices (30 days of inactivity).
 */
const pruneDeadDevices = async () => {
  const startTime = Date.now();
  console.log(`[Job] Dead Device Sweep started at ${new Date().toISOString()}`);

  try {
    const thresholdDays = 30;
    const cutoffDate = new Date(
      Date.now() - thresholdDays * 24 * 60 * 60 * 1000,
    );

    // Find active tokens where both lastLoginAt and updated_at are older than cutoffDate
    // (if lastLoginAt does not exist, fall back to updated_at)
    const query = {
      expo_push_token: { $exists: true, $ne: null, $ne: "" },
      $or: [
        { lastLoginAt: { $lt: cutoffDate } },
        { lastLoginAt: { $exists: false }, updated_at: { $lt: cutoffDate } },
      ],
    };

    const result = await Patient.updateMany(query, {
      $set: {
        expo_push_token: null,
        expo_push_token_failures: 0,
      },
    });

    console.log(
      `[Job] Dead Device Sweep completed. Pruned ${result.modifiedCount} inactive device token(s).`,
    );
  } catch (error) {
    console.error("[Job] Dead Device Sweep failed:", error);
  } finally {
    console.log(
      `[Job] Dead Device Sweep finished in ${Date.now() - startTime}ms`,
    );
  }
};

let isReceiptCronStarted = false;

const startReceiptCron = () => {
  if (isReceiptCronStarted) {
    console.warn(
      "⚠️ Push receipt cron already started. Skipping duplicate initialization.",
    );
    return;
  }
  // Poll receipts every 5 minutes
  cron.schedule("*/5 * * * *", pollPushReceipts);

  // Sweep dead devices daily at midnight
  cron.schedule("0 0 * * *", pruneDeadDevices);

  isReceiptCronStarted = true;
  console.log("✅ Push receipt polling & dead device sweeper crons started.");
};

module.exports = {
  pollPushReceipts,
  pruneDeadDevices,
  startReceiptCron,
};
