import { describe, expect, it } from "vitest";
import { FallSession } from "./session.ts";
import { synthesizePose } from "./landmarks.ts";
import { poseAt, scenarioDuration } from "./scenarios.ts";
import type { FallScorer, PoseFrame } from "./types.ts";

const DT = 1000 / 30;

async function play(session: FallSession, frames: PoseFrame[]) {
  let confirmed: Awaited<ReturnType<FallSession["push"]>> | null = null;
  const reasons: string[] = [];
  let last = await session.push(frames[0]);
  for (const frame of frames) {
    last = await session.push(frame);
    reasons.push(last.reason);
    if (last.justConfirmed) confirmed = last;
  }
  return { last, confirmed, reasons };
}

function scenarioFrames(id: "fall" | "sit"): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let t = 0; t <= scenarioDuration(id); t += DT) {
    frames.push({ t, landmarks: poseAt(id, t) });
  }
  return frames;
}

/** A drop that finishes before a full 2.4s model window exists. */
function shortFallFrames(): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let t = 0; t <= 2200; t += DT) {
    let hipY = 0.56;
    let angle = 4;
    if (t >= 400 && t < 750) {
      const u = (t - 400) / 350;
      hipY = 0.56 + (0.82 - 0.56) * u;
      angle = 4 + (86 - 4) * u;
    } else if (t >= 750) {
      hipY = 0.82;
      angle = 86;
    }
    frames.push({ t, landmarks: synthesizePose({ hipY, angleDeg: angle, cx: 0.5 }) });
  }
  return frames;
}

describe("fall session model gate", () => {
  it("confirms with the heuristic when no model is loaded", async () => {
    const { confirmed } = await play(new FallSession(null), scenarioFrames("fall"));
    expect(confirmed).not.toBeNull();
    expect(confirmed!.decision?.detector).toBe("heuristic");
    expect(confirmed!.decision?.confidence).toBeGreaterThan(0.65);
  });

  it("uses the TFLite score when the model accepts the window", async () => {
    const scorer: FallScorer = { id: "tflite", score: async () => 0.91 };
    const { confirmed } = await play(new FallSession(scorer), scenarioFrames("fall"));
    expect(confirmed?.decision?.detector).toBe("tflite");
    expect(confirmed?.decision?.confidence).toBe(0.91);
    expect(confirmed?.modelScore).toBe(0.91);
  });

  it("vetoes a heuristic fall when the model score is low", async () => {
    let calls = 0;
    const scorer: FallScorer = {
      id: "tflite",
      score: async () => {
        calls += 1;
        return 0.12;
      },
    };
    const session = new FallSession(scorer);
    const { confirmed, last, reasons } = await play(session, scenarioFrames("fall"));
    expect(calls).toBe(1);
    expect(confirmed).toBeNull();
    expect(last.phase).not.toBe("confirmed");
    expect(reasons).toContain("On-device model rejected this drop");
  });

  it("falls back to the heuristic if the model throws", async () => {
    const scorer: FallScorer = {
      id: "tflite",
      score: async () => {
        throw new Error("wasm failed");
      },
    };
    const { confirmed } = await play(new FallSession(scorer), scenarioFrames("fall"));
    expect(confirmed?.decision?.detector).toBe("heuristic");
  });

  it("does not call the model until a full window is available", async () => {
    let calls = 0;
    const scorer: FallScorer = {
      id: "tflite",
      score: async () => {
        calls += 1;
        return 0.99;
      },
    };
    const { confirmed } = await play(new FallSession(scorer), shortFallFrames());
    expect(confirmed?.decision?.detector).toBe("heuristic");
    expect(calls).toBe(0);
  });

  it("does not confirm a sit even with an eager model", async () => {
    const scorer: FallScorer = { id: "tflite", score: async () => 0.99 };
    const { confirmed } = await play(new FallSession(scorer), scenarioFrames("sit"));
    expect(confirmed).toBeNull();
  });
});
