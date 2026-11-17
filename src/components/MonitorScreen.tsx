import { Camera, CameraOff, Play, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { SCENARIOS, type ScenarioId } from "../domain/scenarios.ts";
import { useFallWatch } from "../hooks/useFallWatch.ts";
import { useEventStore } from "../services/EventStoreProvider.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

function percent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function MonitorScreen() {
  const watch = useFallWatch();
  const store = useEventStore();
  const features = watch.snapshot?.features ?? null;
  const phase = watch.snapshot?.phase ?? "idle";
  const confidence = watch.ui.kind === "countdown" ? watch.ui.decision.confidence : (watch.snapshot?.confidence ?? 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="space-y-4">
        <div className="relative aspect-[3/4] overflow-hidden rounded-[2rem] bg-[#141a22] shadow-xl ring-1 ring-black/10">
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
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge variant={phase === "confirmed" || watch.ui.kind === "countdown" ? "alert" : "default"}>
              <span data-testid="phase">{watch.snapshot?.reason ?? "Ready for a scenario or the camera"}</span>
            </Badge>
          </div>
          <p className="absolute bottom-3 left-3 right-3 rounded-2xl bg-black/45 px-3 py-2 text-xs text-white backdrop-blur">
            {watch.mode === "sim"
              ? "Simulation. No camera, no recording."
              : "The preview is drawn locally. Frames are discarded after pose tracking."}
          </p>
          {watch.ui.kind === "countdown" && (
            <div className="absolute inset-x-3 bottom-16 rounded-3xl bg-card p-4 text-card-foreground shadow-2xl">
              <p className="text-sm font-semibold text-destructive">Possible fall</p>
              <p className="mt-1 font-display text-5xl tabular-nums" data-testid="countdown">
                {Math.ceil(watch.remainMs / 1000)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The caregiver is alerted when this reaches zero. Confidence {percent(watch.ui.decision.confidence)} via{" "}
                {watch.ui.decision.detector === "tflite" ? "the on-device model" : "the heuristic"}.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-destructive transition-[width]"
                  style={{ width: `${(watch.remainMs / (watch.identity.countdownSec * 1000)) * 100}%` }}
                />
              </div>
              <Button
                variant="destructive"
                size="xl"
                className="mt-4 w-full"
                data-testid="cancel-alarm"
                onClick={watch.cancelAlarm}
              >
                Cancel false alarm
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant={watch.mode === "sim" ? "default" : "outline"} onClick={watch.useSimulation}>
            Simulation
          </Button>
          <Button variant={watch.mode === "live" ? "default" : "outline"} onClick={() => void watch.startCamera()} disabled={watch.cameraBusy}>
            {watch.cameraOn ? "Camera live" : "Use camera"}
          </Button>
        </div>
        {watch.cameraError && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {watch.cameraError}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Show a fall without falling</CardTitle>
            <CardDescription>
              Each scenario feeds the same 33-point skeleton the camera would. The heuristic looks for a fast hip drop,
              a tipping torso or a wide body box, then a still moment on the floor.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {SCENARIOS.map((item) => (
              <Button
                key={item.id}
                variant={item.id === "fall" ? "default" : "outline"}
                className="h-auto items-start justify-start whitespace-normal rounded-2xl px-3 py-3 text-left"
                data-testid={item.id === "fall" ? "run-fall" : `run-${item.id}`}
                onClick={() => watch.playScenario(item.id as ScenarioId)}
              >
                <Play className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block">{item.label}</span>
                  <span className="mt-1 block text-xs font-normal opacity-80">{item.detail}</span>
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Downward speed" value={features ? features.hipVy.toFixed(2) : "—"} hint="per second" />
          <Metric label="Torso angle" value={features ? `${Math.round(features.torsoAngle)}°` : "—"} hint="0 upright" />
          <Metric
            label="Body shape"
            value={features ? features.aspect.toFixed(2) : "—"}
            hint={features ? (features.aspect >= 1 ? "wide" : "tall") : "width / height"}
          />
          <Metric
            label="Motion"
            value={features ? features.motion.toFixed(2) : "—"}
            hint={features ? (features.motion < 0.15 ? "still" : "moving") : "joint speed"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detector</CardTitle>
            <CardDescription>{watch.model.detail}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={watch.model.status === "ready" ? "default" : "muted"}>
                {watch.model.status === "ready" ? "TFLite loaded" : watch.model.status === "loading" ? "Checking model" : "Heuristic"}
              </Badge>
              <Badge variant="outline">Confidence {percent(confidence)}</Badge>
              {watch.cameraOn ? (
                <Badge variant="default">
                  <Camera className="h-3 w-3" aria-hidden="true" /> Camera
                </Badge>
              ) : (
                <Badge variant="muted">
                  <CameraOff className="h-3 w-3" aria-hidden="true" /> Camera off
                </Badge>
              )}
            </div>
            <Outcome ui={watch.ui} onResume={watch.resume} />
            <p className="text-sm text-muted-foreground">{store.detail}</p>
            {watch.cameraOn && (
              <Button variant="outline" onClick={watch.stopCamera}>
                Stop camera
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This phone</CardTitle>
            <CardDescription>
              These names are written with the event. The countdown is the false-alarm window before anything is logged
              as a confirmed fall.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Resident id {watch.identity.patientId} · device {watch.identity.deviceId}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              What leaves the phone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>Pose landmarks are computed in the browser and kept for a few seconds so the detector can see the drop.</p>
            <p>A saved event is a timestamp, confidence, resident and device ids, and a handful of numbers: hip speed, torso angle, body shape, and how long the person stayed still.</p>
            <p>The Telegram bot token lives in a Cloud Function. This page never sees it.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
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
  if (ui.kind === "saving") return <p className="text-sm">Saving the event…</p>;
  if (ui.kind === "alerted") {
    return (
      <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm" role="status">
        <p className="font-semibold text-destructive">Fall recorded.</p>
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
      <div className="rounded-2xl bg-accent px-4 py-3 text-sm" role="status">
        <p className="font-semibold text-primary">Marked as a false alarm.</p>
        <p className="mt-1 text-muted-foreground">
          Event {ui.id.slice(0, 8)} is stored as cancelled
          {ui.source === "local" ? " on this phone" : ""}. The Telegram function ignores cancelled events.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onResume}>
          Keep watching
        </Button>
      </div>
    );
  }
  if (ui.kind === "notice") return <p className="text-sm text-muted-foreground">{ui.message}</p>;
  if (ui.kind === "countdown") return <p className="text-sm">Hold the phone, or cancel if this is not a fall.</p>;
  return <p className="text-sm text-muted-foreground">Run the fall scenario to see the cancel window, then the desk.</p>;
}
