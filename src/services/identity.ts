export interface Identity {
  patientId: string;
  patientLabel: string;
  deviceId: string;
  countdownSec: number;
}

const KEY = "kinalert.identity";

function uid(prefix: string): string {
  const raw = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${raw.replace(/-/g, "").slice(0, 8)}`;
}

export function clampCountdown(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(20, Math.max(5, Math.round(value)));
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (parsed.patientId && parsed.deviceId) {
        return {
          patientId: parsed.patientId,
          patientLabel: parsed.patientLabel?.trim() || "Resident",
          deviceId: parsed.deviceId,
          countdownSec: clampCountdown(parsed.countdownSec ?? 10),
        };
      }
    }
  } catch {
    /* Corrupt storage is replaced below. */
  }
  const created: Identity = {
    patientId: uid("resident"),
    patientLabel: "Resident",
    deviceId: uid("phone"),
    countdownSec: 10,
  };
  saveIdentity(created);
  return created;
}

export function saveIdentity(identity: Identity): void {
  const next = { ...identity, countdownSec: clampCountdown(identity.countdownSec) };
  localStorage.setItem(KEY, JSON.stringify(next));
}
