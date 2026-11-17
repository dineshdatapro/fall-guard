import { describe, expect, it } from "vitest";
import { CHANNEL_COUNT, WINDOW_STEPS } from "./contract.ts";
import { bboxAspect, buildModelWindow, torsoAngleDeg } from "./features.ts";
import { HeuristicDetector } from "./heuristic.ts";
import { synthesizePose } from "./landmarks.ts";
import { poseAt, scenarioDuration, type ScenarioId } from "./scenarios.ts";
import type { PoseFrame } from "./types.ts";

const DT = 1000 / 30;

function framesFor(id: ScenarioId): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let t = 0; t <= scenarioDuration(id); t += DT) {
    frames.push({ t, landmarks: poseAt(id, t) });
  }
  return frames;
}

function run(id: ScenarioId, detector = new HeuristicDetector()) {
  const phases: string[] = [];
  let confirmedAt: number | null = null;
  let last = detector.push({ t: 0, landmarks: null });
  for (const frame of framesFor(id)) {
    last = detector.push(frame);
    phases.push(last.phase);
    if (last.justConfirmed && confirmedAt === null) confirmedAt = frame.t;
  }
  return { last, phases, confirmedAt, detector };
}

describe("pose features", () => {
  it("reads an upright body as tall and a lying body as wide", () => {
    const standing = synthesizePose({ hipY: 0.56, angleDeg: 0 });
    const lying = synthesizePose({ hipY: 0.8, angleDeg: 90 });
    expect(standing).toHaveLength(33);
    expect(torsoAngleDeg(standing)).toBeLessThan(12);
    expect(torsoAngleDeg(lying)).toBeGreaterThan(75);
    expect(bboxAspect(standing)).toBeLessThan(0.8);
    expect(bboxAspect(lying)).toBeGreaterThan(1.4);
  });

  it("builds a fixed-length model window once enough time has passed", () => {
    const { detector, confirmedAt } = run("fall");
    expect(confirmedAt).not.toBeNull();
    const window = buildModelWindow(detector.featureTrace());
    expect(window).not.toBeNull();
    expect(window).toHaveLength(WINDOW_STEPS * CHANNEL_COUNT);
  });
});

describe("heuristic fall detector", () => {
  it("confirms a rapid drop followed by stillness", () => {
    const { confirmedAt, last } = run("fall");
    expect(confirmedAt).not.toBeNull();
    expect(confirmedAt!).toBeGreaterThan(2000);
    expect(confirmedAt!).toBeLessThan(4000);
    expect(last.phase).toBe("confirmed");
    expect(last.summary.peakHipVelocity).toBeGreaterThan(0.5);
    expect(last.summary.torsoAngleDeg).toBeGreaterThan(70);
    expect(last.summary.aspectRatio).toBeGreaterThan(1.2);
    expect(last.summary.hipDrop).toBeGreaterThan(0.15);
    expect(last.confidence).toBeGreaterThan(0.65);
  });

  it("does not confirm quiet standing", () => {
    const { phases, confirmedAt } = run("stand");
    expect(confirmedAt).toBeNull();
    expect(phases).not.toContain("confirmed");
    expect(phases).not.toContain("suspected");
  });

  it("does not confirm a slow sit", () => {
    const { phases, confirmedAt } = run("sit");
    expect(confirmedAt).toBeNull();
    expect(phases).not.toContain("confirmed");
  });

  it("does not confirm a bend that leaves the hips in place", () => {
    const { phases, confirmedAt } = run("bend");
    expect(confirmedAt).toBeNull();
    expect(phases).not.toContain("confirmed");
  });

  it("notices a stumble and clears it when the person stands back up", () => {
    const { phases, confirmedAt } = run("stumble");
    expect(phases).toContain("suspected");
    expect(confirmedAt).toBeNull();
    expect(phases.at(-1)).not.toBe("confirmed");
  });

  it("ignores empty frames and incomplete poses", () => {
    const detector = new HeuristicDetector();
    expect(detector.push({ t: 0, landmarks: null }).phase).toBe("idle");
    expect(detector.push({ t: 30, landmarks: [] }).reason).toBe("Pose incomplete");
    const hidden = synthesizePose({ visibility: 0 });
    expect(detector.push({ t: 60, landmarks: hidden }).person).toBe(false);
  });
});
