#!/usr/bin/env python3
"""Train a small fall-vs-activity classifier and export a .tflite model.

The browser loads that file with LiteRT (TensorFlow Lite for the web). Input
shape and channel order are defined in src/domain/feature_contract.json and
must match featureVector() in src/domain/features.ts.

Channels
  0 hipY             hip midpoint, normalized image y (0 is the top)
  1 hipVy            hip y velocity, positive when moving down the frame
  2 torsoAngleNorm   torso angle from vertical, divided by 90
  3 aspect           bounding-box width / height
  4 motion           mean speed of the major joints
  5 trunkLength      shoulder-to-hip distance

A positive window ends with the person down after a rapid drop. That is the
same decision the on-device heuristic is making.

Datasets this script does not download
  UR Fall Detection, University of Rzeszów
    http://fenix.univ.rzeszow.pl/~mkepski/ds/uf.html
    RGB-D, depth, and accelerometer clips of falls and daily activities.
    Run MediaPipe Pose on the RGB frames, build the six features above, and
    label a window as a fall when the fall happens inside it and the person
    is at rest on the floor at the last step.

  Le2i Fall Detection, Université de Bourgogne
    Home, coffee room, office, and lecture-room videos. Use the copy provided
    by your lab. The same pose-to-window conversion applies. Do not commit the
    videos to this repo.

  Converted windows can be passed as CSV: one row per window, first column
  the label (1 fall, 0 otherwise), then 24 x 6 values in channel order.

The checked-in model is trained on a kinematic simulator plus the fixtures in
training/fixtures/windows.json (dumped from the app's own scenarios). It is a
wiring example, not a clinical model.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def load_contract(path: Path) -> tuple[int, int, list[str], float]:
    data = json.loads(path.read_text())
    return int(data["windowSteps"]), int(data["windowMs"]), list(data["channels"]), float(data["threshold"])


def standing(steps: int, channels: int, rng: np.random.Generator) -> np.ndarray:
    window = np.zeros((steps, channels), dtype=np.float32)
    window[:, 0] = 0.56
    window[:, 1] = 0.0
    window[:, 2] = 0.06
    window[:, 3] = 0.42
    window[:, 4] = 0.04
    window[:, 5] = 0.21
    return window + rng.normal(0, 0.01, window.shape).astype(np.float32)


def fall_window(steps: int, channels: int, rng: np.random.Generator) -> np.ndarray:
    window = standing(steps, channels, rng)
    drop_at = int(steps * 0.40)
    settle = int(steps * 0.62)
    for i in range(drop_at, steps):
        if i < settle:
            u = (i - drop_at) / max(1, settle - drop_at)
            window[i, 0] = 0.56 + 0.26 * u
            window[i, 1] = 0.95 * np.sin(u * np.pi)
            window[i, 2] = 0.06 + 0.90 * u
            window[i, 3] = 0.42 + 1.7 * u
            window[i, 4] = 0.15 + 0.55 * np.sin(u * np.pi)
        else:
            window[i, 0] = 0.82
            window[i, 1] = 0.0
            window[i, 2] = 0.96
            window[i, 3] = 2.15
            window[i, 4] = 0.03
        window[i, 5] = 0.21
    return window + rng.normal(0, 0.012, window.shape).astype(np.float32)


def sit_window(steps: int, channels: int, rng: np.random.Generator) -> np.ndarray:
    window = standing(steps, channels, rng)
    for i in range(steps):
        u = i / (steps - 1)
        window[i, 0] = 0.56 + 0.13 * u
        window[i, 1] = 0.08
        window[i, 2] = 0.06 + 0.28 * u
        window[i, 3] = 0.42 + 0.30 * u
        window[i, 4] = 0.08
        window[i, 5] = 0.20
    return window + rng.normal(0, 0.012, window.shape).astype(np.float32)


def bend_window(steps: int, channels: int, rng: np.random.Generator) -> np.ndarray:
    window = standing(steps, channels, rng)
    for i in range(steps):
        u = i / (steps - 1)
        bell = np.sin(u * np.pi)
        window[i, 0] = 0.57 + 0.03 * bell
        window[i, 1] = 0.05 * bell
        window[i, 2] = 0.06 + 0.75 * bell
        window[i, 3] = 0.42 + 0.45 * bell
        window[i, 4] = 0.08 + 0.2 * bell
        window[i, 5] = 0.21
    return window + rng.normal(0, 0.012, window.shape).astype(np.float32)


def jitter(window: np.ndarray, rng: np.random.Generator, scale: float = 0.02) -> np.ndarray:
    noisy = window + rng.normal(0, scale, window.shape).astype(np.float32)
    return noisy.astype(np.float32)


def load_fixtures(path: Path, channels: list[str], steps: int) -> tuple[np.ndarray, np.ndarray]:
    if not path.exists():
        return np.empty((0, steps, len(channels)), dtype=np.float32), np.empty((0,), dtype=np.float32)
    payload = json.loads(path.read_text())
    if payload.get("channels") != channels or int(payload.get("windowSteps", -1)) != steps:
        raise SystemExit(f"{path} does not match the feature contract. Re-run npm run fixtures.")
    xs = []
    ys = []
    for name, rows in payload["windows"].items():
        array = np.asarray(rows, dtype=np.float32)
        if array.shape != (steps, len(channels)):
            raise SystemExit(f"Fixture {name} has shape {array.shape}")
        xs.append(array)
        ys.append(1.0 if name == "fall" else 0.0)
    return np.stack(xs), np.asarray(ys, dtype=np.float32)


def load_csv(path: Path, steps: int, channels: int) -> tuple[np.ndarray, np.ndarray]:
    rows = np.loadtxt(path, delimiter=",", dtype=np.float32)
    if rows.ndim == 1:
        rows = rows.reshape(1, -1)
    expect = 1 + steps * channels
    if rows.shape[1] != expect:
        raise SystemExit(f"{path} has {rows.shape[1]} columns, expected {expect}")
    labels = rows[:, 0]
    windows = rows[:, 1:].reshape((-1, steps, channels))
    return windows.astype(np.float32), labels.astype(np.float32)


def build_model(steps: int, channels: int):
    import tensorflow as tf

    inputs = tf.keras.Input(shape=(steps, channels), name="pose_window")
    x = tf.keras.layers.Conv1D(16, 5, padding="same", activation="relu")(inputs)
    x = tf.keras.layers.Conv1D(32, 3, padding="same", activation="relu")(x)
    x = tf.keras.layers.GlobalMaxPooling1D()(x)
    x = tf.keras.layers.Dropout(0.15)(x)
    x = tf.keras.layers.Dense(16, activation="relu")(x)
    outputs = tf.keras.layers.Dense(1, activation="sigmoid", name="fall_probability")(x)
    model = tf.keras.Model(inputs, outputs)
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and export the KinAlert fall model.")
    parser.add_argument("--contract", type=Path, default=Path("../src/domain/feature_contract.json"))
    parser.add_argument("--fixtures", type=Path, default=Path("fixtures/windows.json"))
    parser.add_argument("--csv", type=Path, default=None, help="Optional labelled windows, one per row.")
    parser.add_argument("--out", type=Path, default=Path("../public/models/fall_detector.tflite"))
    parser.add_argument("--info", type=Path, default=Path("../public/models/model_info.json"))
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    steps, _window_ms, channels, threshold = load_contract(args.contract)
    rng = np.random.default_rng(args.seed)
    synth_x = []
    synth_y = []
    for _ in range(400):
        synth_x.append(fall_window(steps, len(channels), rng))
        synth_y.append(1.0)
        synth_x.append(standing(steps, len(channels), rng))
        synth_y.append(0.0)
        synth_x.append(sit_window(steps, len(channels), rng))
        synth_y.append(0.0)
        synth_x.append(bend_window(steps, len(channels), rng))
        synth_y.append(0.0)

    fixture_x, fixture_y = load_fixtures(args.fixtures, channels, steps)
    for window, label in zip(fixture_x, fixture_y):
        for _ in range(48):
            synth_x.append(jitter(window, rng))
            synth_y.append(float(label))

    if args.csv:
        csv_x, csv_y = load_csv(args.csv, steps, len(channels))
        synth_x.extend(list(csv_x))
        synth_y.extend(list(csv_y))

    x = np.stack(synth_x).astype(np.float32)
    y = np.asarray(synth_y, dtype=np.float32)
    order = rng.permutation(len(x))
    x, y = x[order], y[order]

    model = build_model(steps, len(channels))
    model.fit(x, y, epochs=args.epochs, batch_size=64, validation_split=0.1, verbose=2)

    if len(fixture_x):
        scores = model.predict(fixture_x, verbose=0).reshape(-1)
        names = list(json.loads(args.fixtures.read_text())["windows"].keys())
        print("Fixture scores:")
        for name, score in zip(names, scores):
            print(f"  {name:10s} {score:.3f}")
        by_name = dict(zip(names, scores))
        if "fall" in by_name and by_name["fall"] < 0.7:
            raise SystemExit(f"Fall fixture scored {by_name['fall']:.3f}, expected >= 0.70")
        for name, score in by_name.items():
            if name != "fall" and score > 0.35:
                raise SystemExit(f"{name} fixture scored {score:.3f}, expected <= 0.35")

    import tensorflow as tf

    # Freeze the batch size at 1. LiteRT.js rejects a dynamic batch (-1) when the
    # browser passes a concrete [1, steps, channels] tensor. Passing the Keras
    # model as the trackable object currently exports NaNs, so convert the
    # concrete function on its own.
    @tf.function
    def serve(pose_window):
        return model(pose_window, training=False)

    signature = serve.get_concrete_function(
        tf.TensorSpec([1, steps, len(channels)], tf.float32, name="pose_window")
    )
    converter = tf.lite.TFLiteConverter.from_concrete_functions([signature])
    tflite_model = converter.convert()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(tflite_model)

    interpreter = tf.lite.Interpreter(model_content=tflite_model)
    interpreter.allocate_tensors()
    details_in = interpreter.get_input_details()[0]
    details_out = interpreter.get_output_details()[0]
    print("TFLite input shape", details_in["shape"].tolist())
    if len(fixture_x):
        print("TFLite fixture scores:")
        for name, window in zip(names, fixture_x):
            interpreter.set_tensor(details_in["index"], window.reshape(1, steps, len(channels)))
            interpreter.invoke()
            score = float(interpreter.get_tensor(details_out["index"]).reshape(-1)[0])
            print(f"  {name:10s} {score:.3f}")
            if not np.isfinite(score):
                raise SystemExit(f"TFLite score for {name} was not finite")
            if name == "fall" and score < 0.7:
                raise SystemExit(f"TFLite fall score {score:.3f} is below 0.70")
            if name != "fall" and score > 0.35:
                raise SystemExit(f"TFLite {name} score {score:.3f} is above 0.35")

    info = {
        "version": "synthetic-v1",
        "threshold": threshold,
        "input": [1, steps, len(channels)],
        "channels": channels,
        "note": "Trained on synthetic kinematics and the simulator fixtures. Replace after training on UR Fall or Le2i.",
    }
    args.info.write_text(json.dumps(info, indent=2) + "\n")
    print(f"Wrote {args.out} ({args.out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
