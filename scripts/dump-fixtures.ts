import { mkdirSync, writeFileSync } from "node:fs";
import { CHANNELS, WINDOW_STEPS } from "../src/domain/contract.ts";
import { buildModelWindow } from "../src/domain/features.ts";
import { HeuristicDetector } from "../src/domain/heuristic.ts";
import { poseAt, scenarioDuration, type ScenarioId } from "../src/domain/scenarios.ts";

const ids: ScenarioId[] = ["fall", "sit", "stumble", "bend", "stand"];
const windows: Record<string, number[][]> = {};

for (const id of ids) {
  const detector = new HeuristicDetector();
  let captured: Float32Array | null = null;
  for (let t = 0; t <= scenarioDuration(id); t += 1000 / 30) {
    const snap = detector.push({ t, landmarks: poseAt(id, t) });
    if (snap.justConfirmed && !captured) {
      captured = buildModelWindow(detector.featureTrace());
    }
  }
  const window = captured ?? buildModelWindow(detector.featureTrace());
  if (!window) {
    console.error(`No model window for ${id}`);
    continue;
  }
  const rows: number[][] = [];
  for (let step = 0; step < WINDOW_STEPS; step += 1) {
    rows.push(Array.from(window.slice(step * CHANNELS.length, (step + 1) * CHANNELS.length)));
  }
  windows[id] = rows;
  console.log(`${id}: ${captured ? "captured at confirmation" : "captured at the end"}`);
}

mkdirSync("training/fixtures", { recursive: true });
writeFileSync(
  "training/fixtures/windows.json",
  `${JSON.stringify({ channels: [...CHANNELS], windowSteps: WINDOW_STEPS, windows }, null, 2)}\n`,
);
