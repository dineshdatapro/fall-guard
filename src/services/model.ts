import { CHANNEL_COUNT, MODEL_INFO_URL, MODEL_THRESHOLD, MODEL_URL, WINDOW_STEPS } from "../domain/contract.ts";
import type { FallScorer } from "../domain/types.ts";

export interface ModelHandle {
  status: "loading" | "ready" | "absent" | "error";
  version: string | null;
  detail: string;
  scorer: FallScorer | null;
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@litertjs/core@2.6.0/wasm/";

interface LiteTensor {
  accelerator: string;
  toTypedArray(): ArrayLike<number>;
  moveTo(destination: "wasm"): Promise<LiteTensor>;
  delete(): void;
}

let pending: Promise<ModelHandle> | null = null;

export function getFallModel(): Promise<ModelHandle> {
  if (!pending) pending = loadFallModel();
  return pending;
}

async function readVersion(): Promise<string | null> {
  try {
    const response = await fetch(MODEL_INFO_URL);
    if (!response.ok) return null;
    const json = (await response.json()) as { version?: unknown };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}

/**
 * Load public/models/fall_detector.tflite with LiteRT.js (the current browser
 * runtime for TensorFlow Lite). Missing file or a runtime error leaves the
 * heuristic in charge.
 */
async function loadFallModel(): Promise<ModelHandle> {
  try {
    const response = await fetch(MODEL_URL);
    if (!response.ok) {
      return {
        status: "absent",
        version: null,
        scorer: null,
        detail: "No TFLite file on this device. The heuristic detector is active.",
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 64) {
      return {
        status: "absent",
        version: null,
        scorer: null,
        detail: "The model file was empty. The heuristic detector is active.",
      };
    }
    const version = await readVersion();
    const { loadLiteRt, loadAndCompile, Tensor } = await import("@litertjs/core");
    await loadLiteRt(WASM_URL);
    const model = await loadAndCompile(bytes, { accelerator: "wasm" });
    const scorer: FallScorer = {
      id: "tflite",
      async score(window) {
        const input = new Tensor(window, [1, WINDOW_STEPS, CHANNEL_COUNT]);
        try {
          const outputs = await model.run(input);
          const list = (Array.isArray(outputs) ? outputs : Object.values(outputs)) as LiteTensor[];
          const tensor = list[0];
          if (!tensor) throw new Error("Model returned no output");
          const host = tensor.accelerator === "wasm" ? tensor : await tensor.moveTo("wasm");
          const value = Number(host.toTypedArray()[0]);
          if (host !== tensor) host.delete();
          tensor.delete();
          if (!Number.isFinite(value)) throw new Error("Model score was not a number");
          return value;
        } finally {
          input.delete();
        }
      },
    };
    return {
      status: "ready",
      version,
      scorer,
      detail: `LiteRT model${version ? ` ${version}` : ""} is running on this phone. A score under ${MODEL_THRESHOLD} cancels the alert.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      status: "error",
      version: null,
      scorer: null,
      detail: `The TFLite runtime did not start (${message}). The heuristic detector is active.`,
    };
  }
}
