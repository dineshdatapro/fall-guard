import { useEffect, useRef, useState } from "react";
import { assertMetadataOnly, buildFallEvent } from "../domain/payload.ts";
import { poseAt, scenarioDuration, type ScenarioId } from "../domain/scenarios.ts";
import { FallSession } from "../domain/session.ts";
import type { FallDecision, Landmark } from "../domain/types.ts";
import { containRect, drawRoom, drawSkeleton, prepareCanvas } from "../render/stage.ts";
import { useEventStore } from "../services/EventStoreProvider.tsx";
import { clampCountdown, loadIdentity, saveIdentity, type Identity } from "../services/identity.ts";
import { getFallModel, type ModelHandle } from "../services/model.ts";
import { cameraErrorMessage, createPoseLandmarker, openCamera, type PoseHandle } from "../services/pose.ts";
import type { SessionSnapshot } from "../domain/session.ts";

export type WatchMode = "sim" | "live";

export type WatchUi =
  | { kind: "idle" }
  | { kind: "live" }
  | { kind: "countdown"; decision: FallDecision; startedAt: number }
  | { kind: "saving" }
  | { kind: "alerted"; id: string; source: string; decision: FallDecision }
  | { kind: "cancelled"; id: string; source: string }
  | { kind: "notice"; message: string };

const EMPTY_MODEL: ModelHandle = {
  status: "loading",
  version: null,
  scorer: null,
  detail: "Looking for the on-device TFLite model…",
};

export function useFallWatch() {
  const store = useEventStore();
  const [identity, setIdentity] = useState<Identity>(() => loadIdentity());
  const [mode, setMode] = useState<WatchMode>("sim");
  const [scenario, setScenario] = useState<ScenarioId>("fall");
  const [playing, setPlaying] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [ui, setUi] = useState<WatchUi>({ kind: "idle" });
  const [model, setModel] = useState<ModelHandle>(EMPTY_MODEL);
  const [now, setNow] = useState(() => performance.now());

  const sessionRef = useRef(new FallSession(null));
  const identityRef = useRef(identity);
  const modeRef = useRef(mode);
  const playingRef = useRef(false);
  const cameraOnRef = useRef(false);
  const scenarioRef = useRef<ScenarioId>("fall");
  const uiRef = useRef<WatchUi>({ kind: "idle" });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseHandle | null>(null);
  const simClockRef = useRef(0);
  const lastUiPaint = useRef(0);
  const busyRef = useRef(false);
  const finishingRef = useRef(false);
  const modelVersionRef = useRef<string | null>(null);
  const modelStatusRef = useRef<ModelHandle["status"]>("loading");
  const playStartedRef = useRef(0);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const setWatch = (next: WatchUi) => {
    uiRef.current = next;
    setUi(next);
  };

  const paint = (landmarks: Landmark[] | null, live: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    if (live) ctx.clearRect(0, 0, width, height);
    else drawRoom(ctx, width, height);
    let view = { x: 0, y: 0, w: width, h: height };
    const video = videoRef.current;
    if (live && video && video.videoWidth > 0) {
      view = containRect(width, height, video.videoWidth, video.videoHeight);
    }
    if (landmarks) drawSkeleton(ctx, landmarks, view);
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;

  const stopCamera = () => {
    cameraOnRef.current = false;
    setCameraOn(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
  };

  const finishRef = useRef<(status: "confirmed" | "cancelled", decision: FallDecision) => Promise<void>>(
    async () => {},
  );
  finishRef.current = async (status, decision) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    playingRef.current = false;
    setPlaying(false);
    setWatch({ kind: "saving" });
    const idn = identityRef.current;
    try {
      const event = buildFallEvent({
        patientId: idn.patientId,
        patientLabel: idn.patientLabel,
        deviceId: idn.deviceId,
        confidence: decision.confidence,
        status,
        detector: decision.detector,
        modelVersion: decision.detector === "tflite" ? modelVersionRef.current : null,
        features: decision.summary,
        countdownMs: idn.countdownSec * 1000,
        clientTime: Date.now(),
      });
      assertMetadataOnly(event);
      const stored = await store.publish(event);
      setWatch(
        status === "confirmed"
          ? { kind: "alerted", id: stored.id, source: stored.source, decision }
          : { kind: "cancelled", id: stored.id, source: stored.source },
      );
    } catch (error) {
      setWatch({
        kind: "notice",
        message: error instanceof Error ? error.message : "The event could not be saved.",
      });
    } finally {
      sessionRef.current.reset();
      finishingRef.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    getFallModel().then((handle) => {
      if (cancelled) return;
      modelVersionRef.current = handle.version;
      modelStatusRef.current = handle.status;
      sessionRef.current.setScorer(handle.scorer);
      setModel(handle);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ui.kind !== "countdown") return;
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [ui.kind]);

  useEffect(() => {
    if (ui.kind !== "countdown") return;
    const remain = identity.countdownSec * 1000 - (now - ui.startedAt);
    if (remain > 0) return;
    void finishRef.current("confirmed", ui.decision);
  }, [ui, now, identity.countdownSec]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && uiRef.current.kind === "countdown") {
        const current = uiRef.current;
        void finishRef.current("cancelled", current.decision);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  const accept = (snap: SessionSnapshot): boolean => {
    if (snap.justConfirmed && snap.decision) {
      playingRef.current = false;
      setPlaying(false);
      setSnapshot(snap);
      const startedAt = performance.now();
      setNow(startedAt);
      setWatch({ kind: "countdown", decision: snap.decision, startedAt });
      return true;
    }
    const wall = performance.now();
    if (wall - lastUiPaint.current > 90) {
      lastUiPaint.current = wall;
      setSnapshot(snap);
      if (uiRef.current.kind === "idle" || uiRef.current.kind === "notice") setWatch({ kind: "live" });
    }
    return false;
  };

  useEffect(() => {
    const active = playing || cameraOn;
    if (!active) return;
    let stopped = false;
    let raf = 0;
    const tick = async () => {
      if (stopped) return;
      raf = requestAnimationFrame(() => {
        void tick();
      });
      if (busyRef.current) return;
      const phase = uiRef.current.kind;
      if (phase === "countdown" || phase === "saving") return;

      if (modeRef.current === "sim") {
        if (!playingRef.current) return;
        if (modelStatusRef.current === "loading" && performance.now() - playStartedRef.current < 8000) {
          paintRef.current(poseAt(scenarioRef.current, 0), false);
          return;
        }
        busyRef.current = true;
        try {
          simClockRef.current += 1000 / 30;
          const t = simClockRef.current;
          const landmarks = poseAt(scenarioRef.current, t);
          paintRef.current(landmarks, false);
          const snap = await sessionRef.current.push({ t, landmarks });
          const countdownStarted = accept(snap);
          if (t >= scenarioDuration(scenarioRef.current) && !snap.justConfirmed && !countdownStarted) {
            playingRef.current = false;
            setPlaying(false);
            if (uiRef.current.kind === "live") {
              setWatch({ kind: "notice", message: "Scenario finished. The detector did not confirm a fall." });
            }
          }
        } finally {
          busyRef.current = false;
        }
        return;
      }

      if (!cameraOnRef.current) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;
      busyRef.current = true;
      try {
        const result = landmarker.detect(video, performance.now());
        const raw = result.landmarks[0] ?? null;
        const landmarks: Landmark[] | null = raw
          ? raw.map((point) => ({
              x: point.x,
              y: point.y,
              z: point.z,
              visibility: point.visibility,
            }))
          : null;
        paintRef.current(landmarks, true);
        const snap = await sessionRef.current.push({ t: performance.now(), landmarks });
        accept(snap);
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Pose tracking stopped");
        cameraOnRef.current = false;
        setCameraOn(false);
      } finally {
        busyRef.current = false;
      }
    };
    raf = requestAnimationFrame(() => {
      void tick();
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [playing, cameraOn]);

  useEffect(() => {
    if (mode !== "sim" || playing) return;
    const frame = requestAnimationFrame(() => paintRef.current(poseAt(scenario, 0), false));
    return () => cancelAnimationFrame(frame);
  }, [mode, playing, scenario]);

  const useSimulation = () => {
    stopCamera();
    setCameraError(null);
    modeRef.current = "sim";
    setMode("sim");
    playingRef.current = false;
    setPlaying(false);
    if (uiRef.current.kind === "countdown" || uiRef.current.kind === "saving") return;
    setWatch({ kind: "idle" });
  };

  const playScenario = (id: ScenarioId) => {
    stopCamera();
    setCameraError(null);
    modeRef.current = "sim";
    setMode("sim");
    scenarioRef.current = id;
    setScenario(id);
    simClockRef.current = 0;
    playStartedRef.current = performance.now();
    sessionRef.current.reset();
    setSnapshot(null);
    finishingRef.current = false;
    setWatch({ kind: "live" });
    playingRef.current = true;
    setPlaying(true);
  };

  const startCamera = async () => {
    setCameraError(null);
    playingRef.current = false;
    setPlaying(false);
    modeRef.current = "live";
    setMode("live");
    setCameraBusy(true);
    sessionRef.current.reset();
    setWatch({ kind: "live" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose a camera. Use the simulation.");
      }
      const stream = await openCamera();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("The preview is not on screen yet.");
      video.srcObject = stream;
      await video.play();
      const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      setMirrored(facing !== "environment");
      landmarkerRef.current = await createPoseLandmarker();
      cameraOnRef.current = true;
      setCameraOn(true);
    } catch (error) {
      stopCamera();
      setCameraError(cameraErrorMessage(error));
    } finally {
      setCameraBusy(false);
    }
  };

  const updateIdentity = (patch: Partial<Identity>) => {
    const next: Identity = {
      ...identityRef.current,
      ...patch,
      countdownSec: clampCountdown(patch.countdownSec ?? identityRef.current.countdownSec),
    };
    identityRef.current = next;
    setIdentity(next);
    saveIdentity(next);
  };

  const remainMs =
    ui.kind === "countdown" ? Math.max(0, identity.countdownSec * 1000 - (now - ui.startedAt)) : 0;

  return {
    identity,
    updateIdentity,
    mode,
    scenario,
    playing,
    cameraOn,
    cameraBusy,
    cameraError,
    mirrored,
    snapshot,
    ui,
    model,
    remainMs,
    videoRef,
    canvasRef,
    useSimulation,
    playScenario,
    startCamera,
    stopCamera: () => {
      stopCamera();
      setWatch({ kind: "idle" });
    },
    cancelAlarm: () => {
      if (uiRef.current.kind !== "countdown") return;
      void finishRef.current("cancelled", uiRef.current.decision);
    },
    resume: () => {
      sessionRef.current.reset();
      setSnapshot(null);
      setWatch({ kind: "idle" });
      if (modeRef.current === "sim") paintRef.current(poseAt(scenarioRef.current, 0), false);
    },
  };
}
