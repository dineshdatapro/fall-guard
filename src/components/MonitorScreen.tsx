import { Camera, CameraOff, Play, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { SCENARIOS, type ScenarioId } from "../domain/scenarios.ts";
import { useFallWatch } from "../hooks/useFallWatch.ts";
import { useEventStore } from "../services/EventStoreProvider.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

function percent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function MonitorScreen() {
  const watch = useFallWatch();
  const store = useEventStore();
  const features = watch.snapshot?.features ?? null;
  const confidence = watch.ui.kind === "countdown" ? watch.ui.decision.confidence : (watch.snapshot?.confidence ?? 0);
  const urgent = watch.ui.kind === "countdown" && watch.remainMs <= 3000;
  const seconds = watch.ui.kind === "countdown" ? Math.ceil(watch.remainMs / 1000) : 0;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-6 lg:pt-4">
      <section className="px-4 pt-3 lg:sticky lg:top-20 lg:px-0">
        <div className="relative h-[52dvh] min-h-[280px] overflow-hidden rounded-2xl bg-stage shadow-card sm:h-[58dvh] lg:h-[min(70dvh,680px)]">
          <video
            ref={watch.videoRef}
            className={`absolute inset-0 h-full w-full object-contain ${watch.mode === "live" ? "" : "hidden"} ${watch.mirrored ? "-scale-x-100" : ""}`}
            playsInline
            muted
            autoPlay
          />
          <canvas
            ref={watch.canvasRef}
            className={`absolute inset-0 h-full w-full ${watch.mode === "live" && watch.mirrored ? "-scale-x-100" : ""}`}
          />
          <div className="absolute left-3 top-3 max-w-[85%]">
            <p
              data-testid="phase"
              className="inline-flex rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"
            >
              {watch.snapshot?.reason ?? "Ready for a scenario or the camera"}
            </p>
          </div>
          <p className="absolute inset-x-3 bottom-3 rounded-xl bg-black/50 px-3 py-2 text-xs text-white backdrop-blur">
            {watch.mode === "sim"
              ? "Simulation. No camera, no recording."
              : "Preview stays on this phone. Frames are discarded after pose tracking."}
          </p>
        </div>
      </section>

      <section className="space-y-3 px-4 py-3 lg:px-0">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
          <Button variant={watch.mode === "sim" ? "default" : "ghost"} onClick={watch.useSimulation}>
            Simulate
          </Button>
          <Button
            variant={watch.mode === "live" ? "default" : "ghost"}
            onClick={() => void watch.startCamera()}
            disabled={watch.cameraBusy}
          >
            {watch.cameraBusy ? "Opening camera…" : watch.cameraOn ? "Camera live" : "Use camera"}
          </Button>
        </div>

        {watch.cameraError && (
          <p className="rounded-2xl bg-alert-bg px-3 py-3 text-sm text-alert" role="alert">
            {watch.cameraError}
          </p>
        )}

        {watch.mode === "sim" && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenarios</p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 snap-x lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
              {SCENARIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={item.id === "fall" ? "run-fall" : `run-${item.id}`}
                  onClick={() => watch.playScenario(item.id as ScenarioId)}
                  className={`flex min-h-16 w-[15.5rem] shrink-0 snap-start items-start gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-auto ${
                    item.id === "fall"
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  <Play className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`mt-0.5 block text-xs leading-snug ${item.id === "fall" ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                      {item.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1.5">
          <Metric label="Speed" value={features ? features.hipVy.toFixed(2) : "—"} />
          <Metric label="Angle" value={features ? `${Math.round(features.torsoAngle)}°` : "—"} />
          <Metric label="Shape" value={features ? features.aspect.toFixed(2) : "—"} />
          <Metric label="Motion" value={features ? (features.motion < 0.15 ? "Still" : features.motion.toFixed(2)) : "—"} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={watch.model.status === "ready" ? "default" : watch.model.status === "error" ? "alert" : "muted"}>
            {watch.model.status === "ready"
              ? "TFLite loaded"
              : watch.model.status === "loading"
                ? "Checking model"
                : "Heuristic"}
          </Badge>
          <Badge variant="outline">Confidence {percent(confidence)}</Badge>
          {watch.cameraOn ? (
            <Badge variant="default">
              <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Camera
            </Badge>
          ) : (
            <Badge variant="muted">
              <CameraOff className="h-3.5 w-3.5" aria-hidden="true" /> Camera off
            </Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{watch.model.detail}</p>
        <p className="text-sm text-muted-foreground">{store.detail}</p>

        <Outcome ui={watch.ui} onResume={watch.resume} />

        {watch.cameraOn && (
          <Button variant="outline" onClick={watch.stopCamera}>
            Stop camera
          </Button>
        )}

        <details className="rounded-2xl border border-border bg-card shadow-card">
          <summary className="min-h-12 cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Resident and alert window
          </summary>
          <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="patient-label">Resident name</Label>
              <Input
                id="patient-label"
                value={watch.identity.patientLabel}
                maxLength={80}
                onChange={(event) => watch.updateIdentity({ patientLabel: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countdown">Cancel window (seconds)</Label>
              <Input
                id="countdown"
                type="number"
                min={5}
                max={20}
                value={watch.identity.countdownSec}
                onChange={(event) => watch.updateIdentity({ countdownSec: Number(event.target.value) })}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
              Resident {watch.identity.patientId} · device {watch.identity.deviceId}. These names travel with the event.
              The window is how long someone can cancel before a confirmed fall is logged.
            </p>
          </div>
        </details>

        <details className="rounded-2xl border border-border bg-card shadow-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <ShieldCheck className="h-4 w-4 text-safe" aria-hidden="true" />
            What leaves the phone
          </summary>
          <div className="space-y-2 border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
            <p>Pose landmarks are computed in the browser and kept for a few seconds so the detector can see the drop.</p>
            <p>
              A saved event is a timestamp, confidence, resident and device ids, and a few numbers: hip speed, torso
              angle, body shape, and how long the person stayed still.
            </p>
            <p>The Telegram bot token lives in a Cloud Function. This page never sees it.</p>
            <p>Prototype for an M.Tech demonstration. KinAlert is not a medical device.</p>
          </div>
        </details>
      </section>

      {watch.ui.kind === "countdown" && (
        <CountdownSheet
          seconds={seconds}
          urgent={urgent}
          remainMs={watch.remainMs}
          totalMs={watch.identity.countdownSec * 1000}
          confidence={percent(watch.ui.decision.confidence)}
          detector={watch.ui.decision.detector}
          onCancel={watch.cancelAlarm}
        />
      )}
    </div>
  );
}

function CountdownSheet({
  seconds,
  urgent,
  remainMs,
  totalMs,
  confidence,
  detector,
  onCancel,
}: {
  seconds: number;
  urgent: boolean;
  remainMs: number;
  totalMs: number;
  confidence: string;
  detector: "heuristic" | "tflite";
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="sheet-rise fixed inset-x-0 z-50 border-t px-4 pb-4 pt-4 shadow-card"
      style={{
        bottom: "calc(3.5rem + 1px + env(safe-area-inset-bottom))",
        background: urgent ? "var(--alert-bg)" : "var(--warn-bg)",
        color: urgent ? "var(--alert)" : "var(--warn)",
        borderColor: urgent ? "var(--alert)" : "var(--warn)",
      }}
      role="status"
      aria-live="assertive"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide">Possible fall</p>
        <div className="flex items-end justify-between gap-4">
          <p className="font-display text-7xl leading-none tabular-nums" data-testid="countdown">
            {seconds}
          </p>
          <p className="max-w-[14rem] pb-1 text-sm leading-snug">
            Caregiver is alerted at zero. {confidence} via {detector === "tflite" ? "the on-device model" : "the heuristic"}.
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full"
          style={{ background: "color-mix(in srgb, currentColor 25%, transparent)" }}
        >
          <div className="h-full rounded-full bg-current" style={{ width: `${(remainMs / totalMs) * 100}%` }} />
        </div>
        <Button size="xl" className="w-full" data-testid="cancel-alarm" onClick={onCancel}>
          Cancel false alarm
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-2 py-2 text-center shadow-card ring-1 ring-border">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Outcome({
  ui,
  onResume,
}: {
  ui: ReturnType<typeof useFallWatch>["ui"];
  onResume: () => void;
}) {
  if (ui.kind === "saving") {
    return (
      <p className="rounded-2xl bg-secondary px-4 py-3 text-sm" role="status">
        Saving the event…
      </p>
    );
  }
  if (ui.kind === "alerted") {
    return (
      <div className="rounded-2xl bg-alert-bg px-4 py-3 text-sm text-alert" role="status">
        <p className="font-semibold">Fall recorded.</p>
        <p className="mt-1 text-muted-foreground">
          Event {ui.id.slice(0, 8)} was saved {ui.source === "local" ? "in this browser" : "to Firestore"}. A confirmed
          Firestore event is what asks the Cloud Function to message the caregiver.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onResume}>
            Keep watching
          </Button>
          <Button size="sm" asChild>
            <Link to="/care">Open caregiver desk</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (ui.kind === "cancelled") {
    return (
      <div className="rounded-2xl bg-cancel-bg px-4 py-3 text-sm text-cancel" role="status">
        <p className="font-semibold">Marked as a false alarm.</p>
        <p className="mt-1">
          Event {ui.id.slice(0, 8)} is stored as cancelled
          {ui.source === "local" ? " on this phone" : ""}. The Telegram function ignores cancelled events.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onResume}>
          Keep watching
        </Button>
      </div>
    );
  }
  if (ui.kind === "notice") {
    return <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{ui.message}</p>;
  }
  return null;
}
