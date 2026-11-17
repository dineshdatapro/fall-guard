import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useEventStore } from "../services/EventStoreProvider.tsx";
import type { StoredFallEvent } from "../services/eventStore.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";

type Filter = "all" | "confirmed" | "cancelled";

function formatWhen(ms: number | null): string {
  if (!ms) return "Time pending";
  const delta = Date.now() - ms;
  if (delta < 45_000) return "Just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h ago`;
  return new Date(ms).toLocaleString();
}

export function CareScreen() {
  const store = useEventStore();
  const [filter, setFilter] = useState<Filter>("all");
  const events = useMemo(
    () => store.events.filter((event) => (filter === "all" ? true : event.status === filter)),
    [store.events, filter],
  );
  const confirmed = store.events.filter((event) => event.status === "confirmed").length;
  const cancelled = store.events.filter((event) => event.status === "cancelled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Caregiver desk</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{store.detail}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/">Back to the phone watch</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Confirmed falls" value={store.status === "loading" ? "…" : String(confirmed)} />
        <Stat label="False alarms" value={store.status === "loading" ? "…" : String(cancelled)} />
        <Stat
          label="Latest"
          value={store.events[0] ? formatWhen(store.events[0].createdAt) : "None yet"}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter events">
        {(
          [
            ["all", "All"],
            ["confirmed", "Confirmed"],
            ["cancelled", "False alarms"],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} size="sm" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>
            {label}
          </Button>
        ))}
      </div>

      {store.error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {store.error}
        </p>
      )}

      {store.status === "loading" && <p className="text-sm text-muted-foreground">Connecting to the event log…</p>}

      {store.status === "ready" && events.length === 0 && !store.error && (
        <Card>
          <CardHeader>
            <CardTitle>No events in this view</CardTitle>
            <CardDescription>
              Confirmed falls and cancelled alarms show up here as soon as the phone writes them. Nothing on this page
              is a picture.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/">Run a simulated fall</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <ul className="space-y-3" data-testid="event-list">
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </div>
  );
}

function EventCard({ event }: { event: StoredFallEvent }) {
  const confirmed = event.status === "confirmed";
  return (
    <article className="rounded-3xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={confirmed ? "alert" : "warn"}>{confirmed ? "Confirmed fall" : "False alarm"}</Badge>
            <Badge variant="outline">{event.detector === "tflite" ? "TFLite" : "Heuristic"}</Badge>
            {event.source === "local" && <Badge variant="muted">This browser</Badge>}
            {event.alertStatus && <Badge variant="muted">{event.alertStatus.replaceAll("_", " ")}</Badge>}
          </div>
          <h2 className="mt-2 font-display text-2xl">{event.patientLabel || event.patientId}</h2>
          <p className="text-sm text-muted-foreground">
            {formatWhen(event.createdAt)} · device {event.deviceId}
          </p>
        </div>
        <p className="font-display text-3xl tabular-nums">{Math.round(event.confidence * 100)}%</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Fact term="Hip speed" value={`${event.features.peakHipVelocity.toFixed(2)} /s`} />
        <Fact term="Torso" value={`${Math.round(event.features.torsoAngleDeg)}°`} />
        <Fact term="Shape" value={event.features.aspectRatio.toFixed(2)} />
        <Fact term="Still" value={`${(event.features.inactivityMs / 1000).toFixed(1)} s`} />
      </dl>
    </article>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
