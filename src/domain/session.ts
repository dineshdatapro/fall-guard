import { MODEL_THRESHOLD } from "./contract.ts";
import { buildModelWindow } from "./features.ts";
import { HeuristicDetector } from "./heuristic.ts";
import type { FallDecision, FallScorer, FrameFeatures, PoseFrame } from "./types.ts";

export interface SessionSnapshot {
  phase: "idle" | "monitoring" | "suspected" | "confirmed";
  person: boolean;
  features: FrameFeatures | null;
  confidence: number;
  reason: string;
  justConfirmed: boolean;
  decision: FallDecision | null;
  modelScore: number | null;
}

/**
 * Heuristic state machine plus an optional on-device model.
 * The model is asked only when the heuristic is ready to confirm.
 * A low score vetoes the alert. A thrown error, or a window that is still
 * too short, keeps the heuristic decision.
 */
export class FallSession {
  private detector: HeuristicDetector;
  private scorer: FallScorer | null;
  private deciding = false;
  private decided = false;

  constructor(scorer: FallScorer | null = null, detector?: HeuristicDetector) {
    this.scorer = scorer;
    this.detector = detector ?? new HeuristicDetector();
  }

  setScorer(scorer: FallScorer | null): void {
    this.scorer = scorer;
  }

  reset(): void {
    this.detector.reset();
    this.deciding = false;
    this.decided = false;
  }

  async push(frame: PoseFrame): Promise<SessionSnapshot> {
    const snap = this.detector.push(frame);
    if (!snap.justConfirmed || this.decided || this.deciding) {
      return {
        phase: snap.phase,
        person: snap.person,
        features: snap.features,
        confidence: snap.confidence,
        reason: snap.reason,
        justConfirmed: false,
        decision: null,
        modelScore: null,
      };
    }

    this.deciding = true;
    const heuristicDecision: FallDecision = {
      detector: "heuristic",
      confidence: snap.confidence,
      modelScore: null,
      summary: snap.summary,
    };

    if (!this.scorer) {
      this.decided = true;
      this.deciding = false;
      return confirmed(snap, heuristicDecision, null);
    }

    const window = buildModelWindow(this.detector.featureTrace());
    if (!window) {
      this.decided = true;
      this.deciding = false;
      return confirmed(snap, heuristicDecision, null);
    }

    try {
      const probability = await this.scorer.score(window);
      if (!Number.isFinite(probability)) throw new Error("Model returned a non-finite score");
      if (probability < MODEL_THRESHOLD) {
        this.detector.veto();
        this.deciding = false;
        return {
          phase: "monitoring",
          person: snap.person,
          features: snap.features,
          confidence: probability,
          reason: "On-device model rejected this drop",
          justConfirmed: false,
          decision: null,
          modelScore: probability,
        };
      }
      this.decided = true;
      this.deciding = false;
      return confirmed(
        snap,
        {
          detector: "tflite",
          confidence: probability,
          modelScore: probability,
          summary: snap.summary,
        },
        probability,
      );
    } catch (error) {
      console.warn("Fall model failed, using the heuristic.", error);
      this.decided = true;
      this.deciding = false;
      return confirmed(snap, heuristicDecision, null);
    }
  }
}

function confirmed(
  snap: { person: boolean; features: FrameFeatures | null; reason: string },
  decision: FallDecision,
  modelScore: number | null,
): SessionSnapshot {
  return {
    phase: "confirmed",
    person: snap.person,
    features: snap.features,
    confidence: decision.confidence,
    reason: snap.reason,
    justConfirmed: true,
    decision,
    modelScore,
  };
}
