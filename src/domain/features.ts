import { CHANNEL_COUNT, WINDOW_MS, WINDOW_STEPS } from "./contract.ts";
import { LM, MAJOR_JOINTS, midpoint } from "./landmarks.ts";
import type { FrameFeatures, Landmark, PoseFrame } from "./types.ts";

export const VELOCITY_WINDOW_MS = 280;
const MIN_VISIBILITY = 0.5;
const BBOX_VISIBILITY = 0.3;

export function personPresent(landmarks: Landmark[] | null | undefined): landmarks is Landmark[] {
  if (!landmarks || landmarks.length < 29) return false;
  const needed = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
  return needed.every((index) => {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    return (point.visibility ?? 1) >= MIN_VISIBILITY;
  });
}

/** Angle of the shoulder→hip axis from vertical, in degrees. */
export function torsoAngleDeg(landmarks: Landmark[]): number {
  const shoulder = midpoint(landmarks[LM.leftShoulder], landmarks[LM.rightShoulder]);
  const hip = midpoint(landmarks[LM.leftHip], landmarks[LM.rightHip]);
  const vx = hip.x - shoulder.x;
  const vy = hip.y - shoulder.y;
  return Math.abs(Math.atan2(vx, vy) * (180 / Math.PI));
}

export function bboxAspect(landmarks: Landmark[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const point of landmarks) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if ((point.visibility ?? 1) < BBOX_VISIBILITY) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    count += 1;
  }
  if (count < 4) return 0;
  const width = Math.max(1e-4, maxX - minX);
  const height = Math.max(1e-4, maxY - minY);
  return width / height;
}

function frameNear(frames: PoseFrame[], t: number): PoseFrame | null {
  let best: PoseFrame | null = null;
  let bestDistance = Infinity;
  for (const frame of frames) {
    if (!personPresent(frame.landmarks)) continue;
    const distance = Math.abs(frame.t - t);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  if (!best || bestDistance > 200) return null;
  return best;
}

function meanJointSpeed(before: Landmark[], after: Landmark[], dtSeconds: number): number {
  let total = 0;
  let count = 0;
  for (const index of MAJOR_JOINTS) {
    const a = before[index];
    const b = after[index];
    if (!a || !b) continue;
    total += Math.hypot(b.x - a.x, b.y - a.y);
    count += 1;
  }
  if (count === 0 || dtSeconds <= 0) return 0;
  return total / count / dtSeconds;
}

export function computeFeatures(frames: PoseFrame[]): FrameFeatures | null {
  const current = frames[frames.length - 1];
  if (!current || !personPresent(current.landmarks)) return null;
  const landmarks = current.landmarks;
  const hip = midpoint(landmarks[LM.leftHip], landmarks[LM.rightHip]);
  const shoulder = midpoint(landmarks[LM.leftShoulder], landmarks[LM.rightShoulder]);
  const previous = frameNear(frames, current.t - VELOCITY_WINDOW_MS);
  let hipVy = 0;
  let motion = 0;
  if (previous && personPresent(previous.landmarks) && current.t - previous.t >= 120) {
    const previousHip = midpoint(previous.landmarks[LM.leftHip], previous.landmarks[LM.rightHip]);
    const dt = (current.t - previous.t) / 1000;
    hipVy = (hip.y - previousHip.y) / dt;
    motion = meanJointSpeed(previous.landmarks, landmarks, dt);
  }
  return {
    t: current.t,
    hipX: hip.x,
    hipY: hip.y,
    hipVy,
    torsoAngle: torsoAngleDeg(landmarks),
    aspect: bboxAspect(landmarks),
    motion,
    trunkLength: Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y),
  };
}

export function featureVector(features: FrameFeatures): number[] {
  return [
    features.hipY,
    features.hipVy,
    Math.min(2, Math.max(0, features.torsoAngle / 90)),
    features.aspect,
    features.motion,
    features.trunkLength,
  ];
}

function interpolate(trace: FrameFeatures[], t: number): FrameFeatures {
  if (t <= trace[0].t) return trace[0];
  const last = trace[trace.length - 1];
  if (t >= last.t) return last;
  let hi = 1;
  while (trace[hi].t < t) hi += 1;
  const a = trace[hi - 1];
  const b = trace[hi];
  const span = b.t - a.t || 1;
  const u = (t - a.t) / span;
  const mix = (left: number, right: number) => left + (right - left) * u;
  return {
    t,
    hipX: mix(a.hipX, b.hipX),
    hipY: mix(a.hipY, b.hipY),
    hipVy: mix(a.hipVy, b.hipVy),
    torsoAngle: mix(a.torsoAngle, b.torsoAngle),
    aspect: mix(a.aspect, b.aspect),
    motion: mix(a.motion, b.motion),
    trunkLength: mix(a.trunkLength, b.trunkLength),
  };
}

/**
 * Resample the last {@link WINDOW_MS} of features to a fixed (steps × channels) vector.
 * Returns null until enough time has been observed.
 */
export function buildModelWindow(trace: FrameFeatures[]): Float32Array | null {
  if (trace.length < 2) return null;
  const end = trace[trace.length - 1].t;
  const start = end - WINDOW_MS;
  if (trace[0].t > start + 250) return null;
  const out = new Float32Array(WINDOW_STEPS * CHANNEL_COUNT);
  for (let step = 0; step < WINDOW_STEPS; step += 1) {
    const ts = start + (WINDOW_MS * step) / (WINDOW_STEPS - 1);
    const vector = featureVector(interpolate(trace, ts));
    for (let channel = 0; channel < CHANNEL_COUNT; channel += 1) {
      out[step * CHANNEL_COUNT + channel] = vector[channel];
    }
  }
  return out;
}
