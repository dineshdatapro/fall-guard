import { describe, expect, it } from "vitest";
import { decideAlert, formatAlert, telegramConfigured } from "./alert.js";

const confirmed = {
  status: "confirmed",
  patientId: "patient-1",
  patientLabel: "Mrs Rao",
  deviceId: "phone-abc",
  confidence: 0.86,
  detector: "heuristic",
  clientTime: Date.parse("2026-04-02T08:15:00.000Z"),
  features: { peakHipVelocity: 0.84, torsoAngleDeg: 81 },
};

describe("telegram alert policy", () => {
  it("sends only for a confirmed event", () => {
    expect(decideAlert(confirmed).send).toBe(true);
    expect(decideAlert({ ...confirmed, status: "cancelled" }).send).toBe(false);
    expect(decideAlert(null).send).toBe(false);
    expect(decideAlert({ ...confirmed, alertStatus: "sent" }).send).toBe(false);
  });

  it("refuses events that smuggle an image or landmarks", () => {
    expect(decideAlert({ ...confirmed, image: "nope" }).reason).toBe("forbidden field");
    expect(decideAlert({ ...confirmed, landmarks: [] }).send).toBe(false);
  });

  it("formats a text alert with no media", () => {
    const text = formatAlert(confirmed);
    expect(text).toContain("Mrs Rao");
    expect(text).toContain("86%");
    expect(text).toContain("No image was captured or sent.");
    expect(text).not.toMatch(/data:image|http/);
  });

  it("treats placeholder tokens as unconfigured", () => {
    expect(telegramConfigured({ TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" })).toBe(false);
    expect(
      telegramConfigured({
        TELEGRAM_BOT_TOKEN: "your-telegram-bot-token",
        TELEGRAM_CHAT_ID: "123",
      }),
    ).toBe(false);
    expect(
      telegramConfigured({
        TELEGRAM_BOT_TOKEN: "123456:abc",
        TELEGRAM_CHAT_ID: "-100123",
      }),
    ).toBe(true);
  });
});
