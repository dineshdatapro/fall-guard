export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseHandle {
  detect(video: HTMLVideoElement, timestamp: number): { landmarks: PoseLandmark[][] };
  close(): void;
}

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/** MediaPipe Pose, on-device. Frames are passed in and discarded; nothing is uploaded. */
export async function createPoseLandmarker(): Promise<PoseHandle> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const shared = {
    runningMode: "VIDEO" as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  let landmarker;
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      ...shared,
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
    });
  } catch {
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      ...shared,
      baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
    });
  }
  let lastTimestamp = -1;
  return {
    detect(video, timestamp) {
      const next = timestamp <= lastTimestamp ? lastTimestamp + 1 : timestamp;
      lastTimestamp = next;
      const result = landmarker.detectForVideo(video, next);
      return {
        landmarks: result.landmarks.map((pose) =>
          pose.map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z,
            visibility: point.visibility ?? 0,
          })),
        ),
      };
    },
    close() {
      landmarker.close();
    },
  };
}

export async function openCamera(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Camera is unavailable");
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow it in the browser, or run a simulated fall instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No usable camera was found. The simulation still runs the full detector.";
  }
  if (name === "SecurityError") {
    return "The camera is only available on HTTPS or localhost.";
  }
  return error instanceof Error ? error.message : "The camera could not be opened.";
}
