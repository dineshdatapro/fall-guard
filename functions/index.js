import { initializeApp } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { decideAlert, formatAlert, telegramConfigured } from "./alert.js";

initializeApp();

/**
 * Pages the caregiver when a confirmed fall is written.
 * The bot token is read from the function environment, never from the client.
 * Cancelled events are ignored.
 */
export const notifyCaregiver = onDocumentCreated("fallEvents/{eventId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const data = snapshot.data();
  const decision = decideAlert(data);
  if (!decision.send) {
    logger.info("No Telegram alert", { eventId: event.params.eventId, reason: decision.reason });
    return;
  }

  if (!telegramConfigured()) {
    logger.warn("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set. Alert was not sent.");
    await snapshot.ref.update({ alertStatus: "skipped_unconfigured" });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: formatAlert(data),
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("Telegram request failed", { status: response.status, body });
    await snapshot.ref.update({ alertStatus: "failed" });
    return;
  }

  await snapshot.ref.update({
    alertStatus: "sent",
    alertSentAt: FieldValue.serverTimestamp(),
  });
});
