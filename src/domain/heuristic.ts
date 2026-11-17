import { computeFeatures } from "./features.ts";
import { clamp01 } from "./landmarks.ts";
import type { FallSummary, FrameFeatures, PoseFrame } from "./types.ts";

export interface HeuristicConfig {
  minHistoryMs: number;
  dropVelocity: number;
  dropDisplacement: number;
  dropLookbackMs: number;
  angleRiseDeg: number;
  lyingAngleDeg: number;
  lyingAspect: number;
  aspectRise: number;
  inactivityMs: number;
  inactivityMotion: number;
  confirmDeadlineMs: number;
  recoveryHipRise: number;
  recoveryAngleDeg: number;
  recoveryAspect: number;
}

export const DEFAULT_CONFIG: HeuristicConfig = {
  minHistoryMs: 700,
  dropVelocity: 0.5,
  dropDisplacement: 0.1,
  dropLookbackMs: 700,
  angleRiseDeg: 38,
  lyingAngleDeg: 55,
  lyingAspect: 1.05,
  aspectRise: 0.45,
  inactivityMs: 1100,
  inactivityMotion: 0.15,
  confirmDeadlineMs: 3800,
  recoveryHipRise: 0.08,
  recoveryAngleDeg: 30,
  recoveryAspect: 0.85,
};

export type HeuristicPhase = "idle" | "monitoring" | "suspected" | "confirmed";

export interface HeuristicSnapshot {
  phase: HeuristicPhase;
  person: boolean;
  features: FrameFeatures | null;
  confidence: number;
  reason: string;
  justConfirmed: boolean;
  summary: FallSummary;
}

const EMPTY_SUMMARY: FallSummary = {
  peakHipVelocity: 0,
  torsoAngleDeg: 0,
  aspectRatio: 0,
  inactivityMs: 0,
  hipDrop: 0,
};

/**
 * Rule-based fall detector.
 *
 * A fall is a rapid downward move of the hips (image y increases), together with
 * the torso tipping or the body box becoming wide, followed by the person staying
 * low and still. The assumed camera is a phone propped at table or chest height,
 * looking across the room — not a ceiling camera.
 */
export class HeuristicDetector {
  private config: HeuristicConfig;
  private frames: PoseFrame[] = [];
  private trace: FrameFeatures[] = [];
  private phase: HeuristicPhase = "monitoring";
  private suspectedAt: number | null = null;
  private suspectedHipY = 0;
  private baselineHipY = 0;
  private peakVy = 0;
  private suppressUntil = -Infinity;
  private lastPersonT = -Infinity;

  constructor(config?: Partial<HeuristicConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.frames = [];
    this.trace = [];
    this.phase = "monitoring";
    this.suspectedAt = null;
    this.suspectedHipY = 0;
    this.baselineHipY = 0;
    this.peakVy = 0;
    this.suppressUntil = -Infinity;
    this.lastPersonT = -Infinity;
  }

  /** Reject the current drop so it cannot immediately re-trigger. */
  veto(holdMs = 3000): void {
    const last = this.trace[this.trace.length - 1];
    this.phase = "monitoring";
    this.suspectedAt = null;
    this.suppressUntil = (last?.t ?? 0) + holdMs;
  }

  featureTrace(): FrameFeatures[] {
    return this.trace;
  }

  push(frame: PoseFrame): HeuristicSnapshot {
    this.frames.push(frame);
    const cutoff = frame.t - 6000;
    while (this.frames.length > 0 && this.frames[0].t < cutoff) this.frames.shift();

    const features = computeFeatures(this.frames);
    if (features) {
      this.trace.push(features);
      while (this.trace.length > 0 && this.trace[0].t < cutoff) this.trace.shift();
      this.lastPersonT = frame.t;
    } else if (this.phase === "suspected" && frame.t - this.lastPersonT > 500) {
      this.phase = "monitoring";
      this.suspectedAt = null;
    }

    if (this.phase === "confirmed") {
      return this.snapshot(features, false, "Fall confirmed");
    }

    if (!features) {
      return this.snapshot(null, false, frame.landmarks ? "Pose incomplete" : "No person in frame");
    }

    if (this.phase === "monitoring") {
      if (frame.t >= this.suppressUntil && this.isDrop(features)) {
        this.phase = "suspected";
        this.suspectedAt = frame.t;
        this.suspectedHipY = features.hipY;
        this.baselineHipY = this.featureNear(frame.t - this.config.dropLookbackMs)?.hipY ?? features.hipY;
        this.peakVy = this.maxVySince(frame.t - this.config.dropLookbackMs);
      }
      const reason = this.phase === "suspected" ? "Rapid drop — watching for stillness" : "Watching posture";
      return this.snapshot(features, false, reason);
    }

    this.peakVy = Math.max(this.peakVy, features.hipVy);
    const elapsed = frame.t - (this.suspectedAt ?? frame.t);
    const motion = this.recentMotion(frame.t, this.config.inactivityMs);
    const lying = features.torsoAngle >= this.config.lyingAngleDeg || features.aspect >= this.config.lyingAspect;
    const hipStayedDown = features.hipY >= this.suspectedHipY - 0.05;
    const recovered =
      features.hipY < this.suspectedHipY - this.config.recoveryHipRise &&
      features.torsoAngle < this.config.recoveryAngleDeg &&
      features.aspect < this.config.recoveryAspect;

    if (recovered) {
      this.phase = "monitoring";
      this.suspectedAt = null;
      return this.snapshot(features, false, "Recovered — still watching");
    }

    const still = elapsed >= this.config.inactivityMs && motion < this.config.inactivityMotion;
    const gaveUpWaiting = elapsed >= this.config.confirmDeadlineMs && lying && hipStayedDown;
    if ((still && lying && hipStayedDown) || gaveUpWaiting) {
      this.phase = "confirmed";
      return this.snapshot(features, true, "Fall confirmed");
    }

    if (elapsed >= this.config.confirmDeadlineMs) {
      this.phase = "monitoring";
      this.suspectedAt = null;
      return this.snapshot(features, false, "Drop cleared");
    }

    return this.snapshot(features, false, "Rapid drop — watching for stillness");
  }

  private isDrop(now: FrameFeatures): boolean {
    const cfg = this.config;
    if (this.trace.length === 0 || now.t - this.trace[0].t < cfg.minHistoryMs) return false;
    const then = this.featureNear(now.t - cfg.dropLookbackMs);
    if (!then) return false;
    const displacement = now.hipY - then.hipY;
    const since = now.t - cfg.dropLookbackMs;
    let peak = 0;
    let minAngle = now.torsoAngle;
    let minAspect = now.aspect;
    for (const sample of this.trace) {
      if (sample.t < since) continue;
      peak = Math.max(peak, sample.hipVy);
      minAngle = Math.min(minAngle, sample.torsoAngle);
      minAspect = Math.min(minAspect, sample.aspect);
    }
    const shapeChange =
      now.torsoAngle - minAngle >= cfg.angleRiseDeg ||
      now.aspect >= cfg.lyingAspect ||
      now.aspect - minAspect >= cfg.aspectRise;
    return peak >= cfg.dropVelocity && displacement >= cfg.dropDisplacement && shapeChange;
  }

  private featureNear(t: number): FrameFeatures | null {
    let best: FrameFeatures | null = null;
    let bestDistance = Infinity;
    for (const sample of this.trace) {
      const distance = Math.abs(sample.t - t);
      if (distance < bestDistance) {
        best = sample;
        bestDistance = distance;
      }
    }
    if (!best || bestDistance > 180) return null;
    return best;
  }

  private maxVySince(t: number): number {
    let peak = 0;
    for (const sample of this.trace) {
      if (sample.t >= t) peak = Math.max(peak, sample.hipVy);
    }
    return peak;
  }

  private recentMotion(now: number, windowMs: number): number {
    const start = now - windowMs;
    const slice = this.trace.filter((sample) => sample.t >= start);
    if (slice.length === 0) return Infinity;
    if (now - slice[0].t < windowMs * 0.8) return Infinity;
    let total = 0;
    for (const sample of slice) total += sample.motion;
    return total / slice.length;
  }

  private summary(features: FrameFeatures | null): FallSummary {
    if (!features) return EMPTY_SUMMARY;
    return {
      peakHipVelocity: this.peakVy,
      torsoAngleDeg: features.torsoAngle,
      aspectRatio: features.aspect,
      inactivityMs: this.suspectedAt == null ? 0 : Math.max(0, features.t - this.suspectedAt),
      hipDrop: features.hipY - this.baselineHipY,
    };
  }

  private confidence(features: FrameFeatures | null): number {
    if (!features) return 0;
    const velocity = clamp01((Math.max(this.peakVy, features.hipVy) - 0.3) / 1);
    const angle = clamp01((features.torsoAngle - 15) / 75);
    const aspect = clamp01((features.aspect - 0.4) / 1.4);
    const stillness = clamp01((0.2 - features.motion) / 0.2);
    const raw = 0.34 * velocity + 0.28 * angle + 0.2 * aspect + 0.18 * stillness;
    if (this.phase === "monitoring") return clamp01(raw * 0.4);
    return clamp01(raw);
  }

  private snapshot(features: FrameFeatures | null, justConfirmed: boolean, reason: string): HeuristicSnapshot {
    const person = features !== null;
    let phase = this.phase;
    if (!person && phase !== "confirmed" && phase !== "suspected") phase = "idle";
    return {
      phase,
      person,
      features,
      confidence: this.confidence(features),
      reason,
      justConfirmed,
      summary: this.summary(features),
    };
  }
}
