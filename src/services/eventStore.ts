import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { assertMetadataOnly, buildFallEvent, type FallEventInput } from "../domain/payload.ts";

export type StoreMode = "firestore" | "emulator" | "local";

export interface StoredFallEvent extends FallEventInput {
  id: string;
  createdAt: number | null;
  alertStatus?: string;
  source: StoreMode;
}

export interface EventStore {
  mode: StoreMode;
  detail: string;
  publish(input: FallEventInput): Promise<StoredFallEvent>;
  subscribe(listener: (events: StoredFallEvent[], error: string | null) => void): () => void;
}

const LOCAL_KEY = "kinalert.events";
const LOCAL_EVENT = "kinalert-events";

let emulatorConnected = false;

function firebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  };
}

function app(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig());
}

function database(mode: StoreMode): Firestore {
  const db = getFirestore(app());
  if (mode === "emulator" && !emulatorConnected) {
    const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || "127.0.0.1";
    const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "8099");
    connectFirestoreEmulator(db, host, port);
    emulatorConnected = true;
  }
  return db;
}

async function emulatorReachable(): Promise<boolean> {
  const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || "127.0.0.1";
  const port = import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "8099";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(`http://${host}:${port}/`, { signal: controller.signal });
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readLocal(): StoredFallEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredFallEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(events: StoredFallEvent[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(events.slice(0, 50)));
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

function localStore(detail: string): EventStore {
  return {
    mode: "local",
    detail,
    async publish(input) {
      const event = buildFallEvent(input);
      assertMetadataOnly(event);
      const stored: StoredFallEvent = {
        ...event,
        id: globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}`,
        createdAt: event.clientTime,
        alertStatus: "local_only",
        source: "local",
      };
      writeLocal([stored, ...readLocal()]);
      return stored;
    },
    subscribe(listener) {
      const emit = () => listener(readLocal(), null);
      emit();
      window.addEventListener(LOCAL_EVENT, emit);
      window.addEventListener("storage", emit);
      return () => {
        window.removeEventListener(LOCAL_EVENT, emit);
        window.removeEventListener("storage", emit);
      };
    },
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function fromDocument(id: string, data: Record<string, unknown>, mode: StoreMode): StoredFallEvent | null {
  if (data.status !== "confirmed" && data.status !== "cancelled") return null;
  if (data.detector !== "heuristic" && data.detector !== "tflite") return null;
  const features = (data.features ?? {}) as Partial<StoredFallEvent["features"]>;
  return {
    id,
    patientId: String(data.patientId ?? ""),
    patientLabel: String(data.patientLabel ?? ""),
    deviceId: String(data.deviceId ?? ""),
    confidence: Number(data.confidence ?? 0),
    status: data.status,
    detector: data.detector,
    modelVersion: typeof data.modelVersion === "string" ? data.modelVersion : null,
    features: {
      peakHipVelocity: Number(features.peakHipVelocity ?? 0),
      torsoAngleDeg: Number(features.torsoAngleDeg ?? 0),
      aspectRatio: Number(features.aspectRatio ?? 0),
      inactivityMs: Number(features.inactivityMs ?? 0),
      hipDrop: Number(features.hipDrop ?? 0),
    },
    countdownMs: Number(data.countdownMs ?? 0),
    clientTime: Number(data.clientTime ?? 0),
    createdAt: asNumber(data.createdAt) ?? asNumber(data.clientTime),
    alertStatus: typeof data.alertStatus === "string" ? data.alertStatus : undefined,
    source: mode,
  };
}

function remoteStore(mode: "firestore" | "emulator", detail: string): EventStore {
  const db = database(mode);
  const events = collection(db, "fallEvents");
  return {
    mode,
    detail,
    async publish(input) {
      const event = buildFallEvent(input);
      assertMetadataOnly(event);
      try {
        const ref = await addDoc(events, { ...event, createdAt: serverTimestamp() });
        return { ...event, id: ref.id, createdAt: event.clientTime, source: mode };
      } catch {
        const fallback = localStore("Firestore rejected the write. The event was kept in this browser.");
        return fallback.publish(input);
      }
    },
    subscribe(listener) {
      const q = query(events, orderBy("clientTime", "desc"), limit(50));
      return onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs
            .map((doc) => fromDocument(doc.id, doc.data() as Record<string, unknown>, mode))
            .filter((row): row is StoredFallEvent => row !== null);
          listener(rows, null);
        },
        (error) => listener([], error.message),
      );
    },
  };
}

let singleton: Promise<EventStore> | null = null;

export function getEventStore(): Promise<EventStore> {
  if (!singleton) singleton = createEventStore();
  return singleton;
}

export async function createEventStore(): Promise<EventStore> {
  const config = firebaseConfig();
  const configured = config.projectId.length > 0 && config.apiKey.length > 0 && config.apiKey !== "your-api-key";
  const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";
  if (!configured) {
    return localStore("Firebase config is empty. Events stay in this browser until you add a project or start the emulator.");
  }
  if (useEmulator) {
    if (await emulatorReachable()) {
      return remoteStore("emulator", "Live from the Firestore emulator. Confirmed events can trigger the Telegram function.");
    }
    return localStore("The Firestore emulator is not running. Events stay in this browser. Start it with npm run emulators:firestore.");
  }
  return remoteStore("firestore", "Live from Cloud Firestore. Confirmed events trigger the caregiver function.");
}
