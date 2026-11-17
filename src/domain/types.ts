export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** One pose sample. `landmarks` is null when nobody is tracked. */
export interface PoseFrame {
  t: number;
  landmarks: Landmark[] | null;
}

export interface FrameFeatures {
  t: number;
  hipX: number;
  hipY: number;
  /** Image-y velocity of the hip midpoint. Positive means downward in the frame. */
  hipVy: number;
  /** Degrees from upright. 0 is vertical, 90 is horizontal. */
  torsoAngle: number;
  /** Bounding-box width / height. Standing is below 1, lying is above 1. */
  aspect: number;
  /** Mean speed of the major joints, normalized image units per second. */
  motion: number;
  /** Shoulder-midpoint to hip-midpoint distance. */
  trunkLength: number;
}

export interface FallSummary {
  peakHipVelocity: number;
  torsoAngleDeg: number;
  aspectRatio: number;
  inactivityMs: number;
  hipDrop: number;
}

export type DetectorKind = "heuristic" | "tflite";

export interface FallDecision {
  detector: DetectorKind;
  confidence: number;
  modelScore: number | null;
  summary: FallSummary;
}

export interface FallScorer {
  readonly id: "tflite";
  score(window: Float32Array): Promise<number>;
}
