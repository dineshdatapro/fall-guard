import type { DetectorKind, FallSummary } from "./types.ts";

export const FORBIDDEN_EVENT_KEYS = [
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
] as const;

export interface FallEventInput {
  patientId: string;
  patientLabel: string;
  deviceId: string;
  confidence: number;
  status: "confirmed" | "cancelled";
  detector: DetectorKind;
  modelVersion: string | null;
  features: FallSummary;
  countdownMs: number;
  clientTime: number;
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/** Whitelist the fields that are allowed to leave the phone. */
export function buildFallEvent(input: FallEventInput): FallEventInput {
  const confidence = Math.min(1, Math.max(0, input.confidence));
  return {
    patientId: clip(input.patientId, 80),
    patientLabel: clip(input.patientLabel, 80),
    deviceId: clip(input.deviceId, 80),
    confidence: round4(confidence),
    status: input.status,
    detector: input.detector,
    modelVersion: input.modelVersion,
    features: {
      peakHipVelocity: round4(input.features.peakHipVelocity),
      torsoAngleDeg: round4(input.features.torsoAngleDeg),
      aspectRatio: round4(input.features.aspectRatio),
      inactivityMs: Math.round(input.features.inactivityMs),
      hipDrop: round4(input.features.hipDrop),
    },
    countdownMs: Math.round(input.countdownMs),
    clientTime: Math.round(input.clientTime),
  };
}

export function assertMetadataOnly(value: unknown, path = "event"): void {
  if (Array.isArray(value)) {
    throw new Error(`Arrays are not allowed on fall events (${path})`);
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if ((FORBIDDEN_EVENT_KEYS as readonly string[]).includes(key.toLowerCase())) {
      throw new Error(`Forbidden fall-event field "${key}"`);
    }
    assertMetadataOnly(child, `${path}.${key}`);
  }
}
