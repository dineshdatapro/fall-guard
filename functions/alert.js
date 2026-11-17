const FORBIDDEN = new Set([
  "image",
  "frame",
  "frames",
  "video",
  "landmarks",
  "pixels",
  "jpeg",
  "png",
  "thumbnail",
  "photo",
  "skeleton",
]);

/**
 * Decide whether a new fallEvents document should page a caregiver.
 * Cancelled events and anything carrying image-like fields are ignored.
 */
export function decideAlert(data) {
  if (!data || typeof data !== "object") return { send: false, reason: "empty" };
  if (data.status !== "confirmed") return { send: false, reason: "not confirmed" };
  if (data.alertStatus === "sent") return { send: false, reason: "already sent" };
  for (const key of Object.keys(data)) {
    if (FORBIDDEN.has(key.toLowerCase())) return { send: false, reason: "forbidden field" };
  }
  return { send: true, reason: "ok" };
}

export function formatAlert(data) {
  const confidence = Number(data?.confidence);
  const pct = Number.isFinite(confidence) ? Math.round(confidence * 100) : 0;
  const when = data?.clientTime ? new Date(data.clientTime).toISOString() : "unknown time";
  const features = data?.features ?? {};
  const velocity = Number(features.peakHipVelocity ?? 0);
  const angle = Number(features.torsoAngleDeg ?? 0);
  return [
    "KinAlert fall warning",
    `Patient: ${data?.patientLabel || data?.patientId || "unknown"}`,
    `Device: ${data?.deviceId || "unknown"}`,
    `Confidence: ${pct}% (${data?.detector || "heuristic"})`,
    `Time: ${when}`,
    `Hip drop velocity: ${velocity.toFixed(2)} /s`,
    `Torso angle: ${Math.round(angle)} deg`,
    "No image was captured or sent.",
  ].join("\n");
}

export function telegramConfigured(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = env.TELEGRAM_CHAT_ID ?? "";
  if (!token || !chatId) return false;
  if (token.startsWith("your-") || token.includes("placeholder")) return false;
  if (chatId.startsWith("your-") || chatId.includes("placeholder")) return false;
  return true;
}
