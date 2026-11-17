import featureContract from "./feature_contract.json" with { type: "json" };

/** Sliding-window contract shared with training/train_fall_model.py. */
export const WINDOW_STEPS = featureContract.windowSteps;
export const WINDOW_MS = featureContract.windowMs;
export const MODEL_THRESHOLD = featureContract.threshold;
export const CHANNELS = featureContract.channels;
export const CHANNEL_COUNT = CHANNELS.length;

export const MODEL_URL = "/models/fall_detector.tflite";
export const MODEL_INFO_URL = "/models/model_info.json";
