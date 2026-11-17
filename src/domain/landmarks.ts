import type { Landmark } from "./types.ts";

/** MediaPipe Pose landmark indices used by the detector. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Pairs drawn as the skeleton. Matches BlazePose / MediaPipe Pose topology. */
export const POSE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

export const MAJOR_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/**
 * Local offsets from the hip center, in body-heights.
 * Y is positive downward (image space) so an upright person has the head at negative y.
 */
const LOCAL: ReadonlyArray<readonly [number, number]> = [
  [0, -0.48],
  [-0.03, -0.5],
  [-0.05, -0.5],
  [-0.07, -0.49],
  [0.03, -0.5],
  [0.05, -0.5],
  [0.07, -0.49],
  [-0.09, -0.48],
  [0.09, -0.48],
  [-0.02, -0.45],
  [0.02, -0.45],
  [-0.12, -0.34],
  [0.12, -0.34],
  [-0.16, -0.18],
  [0.16, -0.18],
  [-0.18, -0.02],
  [0.18, -0.02],
  [-0.2, 0],
  [0.2, 0],
  [-0.19, 0.02],
  [0.19, 0.02],
  [-0.17, 0.01],
  [0.17, 0.01],
  [-0.08, 0],
  [0.08, 0],
  [-0.08, 0.22],
  [0.08, 0.22],
  [-0.08, 0.46],
  [0.08, 0.46],
  [-0.09, 0.49],
  [0.09, 0.49],
  [-0.04, 0.5],
  [0.04, 0.5],
];

export interface BodyParams {
  cx?: number;
  hipY?: number;
  /** 0 is upright, 90 is lying flat. Clockwise in the image. */
  angleDeg?: number;
  /** Body height in normalized image units. */
  height?: number;
  visibility?: number;
}

/** Build a 33-point pose. Used by the simulator and the detector tests. */
export function synthesizePose(params: BodyParams = {}): Landmark[] {
  const cx = params.cx ?? 0.5;
  const hipY = params.hipY ?? 0.56;
  const height = params.height ?? 0.62;
  const visibility = params.visibility ?? 1;
  const rad = ((params.angleDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return LOCAL.map(([lx, ly]) => ({
    x: cx + (lx * cos - ly * sin) * height,
    y: hipY + (lx * sin + ly * cos) * height,
    z: 0,
    visibility,
  }));
}

export function midpoint(a: Landmark, b: Landmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
