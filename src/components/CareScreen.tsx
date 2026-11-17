import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useEventStore } from "../services/EventStoreProvider.tsx";
import type { StoredFallEvent } from "../services/eventStore.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";

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
    <div className="space-y-4 px-4 py-4 lg:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Caregiver desk</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{store.detail}</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Falls" value={store.status === "loading" ? "…" : String(confirmed)} tone="alert" />
        <Stat label="Cancelled" value={store.status === "loading" ? "…" : String(cancelled)} tone="cancel" />
        <Stat label="Latest" value={store.events[0] ? formatWhen(store.events[0].createdAt) : "None"} tone="safe" />
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1" role="tablist" aria-label="Filter events">
        {(
          [
            ["all", "All"],
            ["confirmed", "Falls"],
            ["cancelled", "Cancelled"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-11 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === id ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {store.error && (
        <p className="rounded-2xl bg-alert-bg px-4 py-3 text-sm text-alert" role="alert">
          {store.error}
        </p>
      )}

      {store.status === "loading" && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="text-sm text-muted-foreground">Connecting to the event log…</p>
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-secondary" />
          ))}
        </div>
      )}

      {store.status === "ready" && events.length === 0 && !store.error && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center shadow-card">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">No events in this view</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Confirmed falls and cancelled alarms show up here as soon as the phone writes them. Nothing on this page is
            a picture.
          </p>
          <Button className="mt-4" asChild>
            <Link to="/">Run a simulated fall</Link>
          </Button>
        </div>
      )}

      <ul className="grid gap-3 lg:grid-cols-2" data-testid="event-list">
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Prototype for an M.Tech demonstration. KinAlert is not a medical device and must not be the only way someone
        calls for help.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "alert" | "cancel" | "safe" }) {
  const toneClass = tone === "alert" ? "text-alert" : tone === "cancel" ? "text-cancel" : "text-safe";
  return (
    <div className="rounded-2xl bg-card px-3 py-3 shadow-card ring-1 ring-border">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold leading-tight ${toneClass}`}>{value}</p>
    </div>
  );
}

function EventCard({ event }: { event: StoredFallEvent }) {
  const confirmed = event.status === "confirmed";
  return (
    <article
      className={`rounded-2xl border border-border bg-card px-4 py-4 shadow-card border-l-4 ${
        confirmed ? "border-l-alert" : "border-l-cancel"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={confirmed ? "alert" : "cancel"}>{confirmed ? "Confirmed fall" : "False alarm"}</Badge>
            <Badge variant="outline">{event.detector === "tflite" ? "TFLite" : "Heuristic"}</Badge>
            {event.source === "local" && <Badge variant="muted">This browser</Badge>}
            {event.alertStatus && <Badge variant="muted">{event.alertStatus.replaceAll("_", " ")}</Badge>}
          </div>
          <h2 className="mt-2 truncate text-xl font-semibold">{event.patientLabel || event.patientId}</h2>
          <p className="text-sm text-muted-foreground">
            {formatWhen(event.createdAt)} · {event.deviceId}
          </p>
        </div>
        <p className={`font-display text-3xl tabular-nums ${confirmed ? "text-alert" : "text-cancel"}`}>
          {Math.round(event.confidence * 100)}%
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
        <Fact term="Hip" value={event.features.peakHipVelocity.toFixed(2)} />
        <Fact term="Torso" value={`${Math.round(event.features.torsoAngleDeg)}°`} />
        <Fact term="Shape" value={event.features.aspectRatio.toFixed(2)} />
        <Fact term="Still" value={`${(event.features.inactivityMs / 1000).toFixed(1)}s`} />
      </dl>
    </article>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-2 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
