import { lerp, synthesizePose } from "./landmarks.ts";
import type { Landmark } from "./types.ts";

export type ScenarioId = "fall" | "sit" | "stumble" | "bend" | "stand";

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  detail: string;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: "fall",
    label: "Fall and lie still",
    detail: "A fast drop, the torso goes horizontal, then the body stays on the floor.",
  },
  {
    id: "stumble",
    label: "Stumble and recover",
    detail: "A sharp dip, then the person is upright again before the stillness window.",
  },
  {
    id: "sit",
    label: "Slow sit",
    detail: "The hips lower gently and the torso stays mostly upright.",
  },
  {
    id: "bend",
    label: "Bend to the floor",
    detail: "The torso tips as if picking something up, without the hips dropping away.",
  },
  {
    id: "stand",
    label: "Quiet standing",
    detail: "Small sway only.",
  },
];

interface Keyframe {
  t: number;
  hipY: number;
  angle: number;
  cx: number;
}

const SCRIPTS: Record<ScenarioId, Keyframe[]> = {
  fall: [
    { t: 0, hipY: 0.56, angle: 3, cx: 0.48 },
    { t: 1200, hipY: 0.57, angle: 6, cx: 0.5 },
    { t: 1550, hipY: 0.82, angle: 86, cx: 0.58 },
    { t: 4600, hipY: 0.82, angle: 86, cx: 0.58 },
  ],
  stumble: [
    { t: 0, hipY: 0.56, angle: 4, cx: 0.5 },
    { t: 800, hipY: 0.56, angle: 5, cx: 0.5 },
    { t: 1120, hipY: 0.76, angle: 62, cx: 0.56 },
    { t: 1650, hipY: 0.57, angle: 8, cx: 0.5 },
    { t: 3400, hipY: 0.56, angle: 4, cx: 0.5 },
  ],
  sit: [
    { t: 0, hipY: 0.56, angle: 4, cx: 0.5 },
    { t: 400, hipY: 0.56, angle: 4, cx: 0.5 },
    { t: 2600, hipY: 0.7, angle: 32, cx: 0.5 },
    { t: 4400, hipY: 0.7, angle: 32, cx: 0.5 },
  ],
  bend: [
    { t: 0, hipY: 0.56, angle: 4, cx: 0.5 },
    { t: 500, hipY: 0.56, angle: 5, cx: 0.5 },
    { t: 1000, hipY: 0.6, angle: 72, cx: 0.5 },
    { t: 1700, hipY: 0.56, angle: 6, cx: 0.5 },
    { t: 2800, hipY: 0.56, angle: 5, cx: 0.5 },
  ],
  stand: [
    { t: 0, hipY: 0.56, angle: 4, cx: 0.5 },
    { t: 4000, hipY: 0.57, angle: 7, cx: 0.52 },
  ],
};

export function scenarioDuration(id: ScenarioId): number {
  const keys = SCRIPTS[id];
  return keys[keys.length - 1].t;
}

function smoothstep(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

function sampleKeys(keys: Keyframe[], t: number): Keyframe {
  if (t <= keys[0].t) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;
  let index = 1;
  while (keys[index].t < t) index += 1;
  const a = keys[index - 1];
  const b = keys[index];
  const u = smoothstep((t - a.t) / (b.t - a.t));
  return {
    t,
    hipY: lerp(a.hipY, b.hipY, u),
    angle: lerp(a.angle, b.angle, u),
    cx: lerp(a.cx, b.cx, u),
  };
}

/** Deterministic pose at time `t` (milliseconds) for a named scenario. */
export function poseAt(id: ScenarioId, t: number): Landmark[] {
  const key = sampleKeys(SCRIPTS[id], t);
  const sway = Math.sin(t / 180) * 0.004;
  const angleJitter = Math.sin(t / 220) * 1.2;
  return synthesizePose({
    cx: key.cx,
    hipY: key.hipY + sway,
    angleDeg: key.angle + angleJitter,
  });
}
