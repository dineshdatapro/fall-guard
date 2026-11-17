import { describe, expect, it } from "vitest";
import { assertMetadataOnly, buildFallEvent } from "./payload.ts";

describe("fall event payload", () => {
  it("keeps only event metadata", () => {
    const event = buildFallEvent({
      patientId: "  patient-1 ",
      patientLabel: "Mrs Rao",
      deviceId: "phone-abc",
      confidence: 1.4,
      status: "confirmed",
      detector: "heuristic",
      modelVersion: null,
      features: {
        peakHipVelocity: 0.82346,
        torsoAngleDeg: 84.2,
        aspectRatio: 2.134,
        inactivityMs: 1100.4,
        hipDrop: 0.24111,
      },
      countdownMs: 10000,
      clientTime: 1_700_000_000_000,
    });
    expect(event.confidence).toBe(1);
    expect(event.patientId).toBe("patient-1");
    expect(event.features.inactivityMs).toBe(1100);
    expect(event.features.peakHipVelocity).toBe(0.8235);
    expect(JSON.stringify(event)).not.toMatch(/landmark|image|pixel|video/i);
    expect(() => assertMetadataOnly(event)).not.toThrow();
  });

  it("rejects images, landmark arrays, and nested frames", () => {
    expect(() => assertMetadataOnly({ status: "confirmed", image: "abc" })).toThrow(/Forbidden/);
    expect(() => assertMetadataOnly({ landmarks: [{ x: 0, y: 0 }] })).toThrow(/Forbidden/);
    expect(() => assertMetadataOnly({ notes: ["raw", "trace"] })).toThrow(/Arrays are not allowed/);
    expect(() =>
      assertMetadataOnly({ features: { photo: [1, 2, 3] } }),
    ).toThrow(/Forbidden|Arrays/);
  });
});
