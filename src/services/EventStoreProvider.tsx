import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FallEventInput } from "../domain/payload.ts";
import { getEventStore, type EventStore, type StoreMode, type StoredFallEvent } from "./eventStore.ts";

interface EventStoreValue {
  status: "loading" | "ready";
  mode: StoreMode | "loading";
  detail: string;
  events: StoredFallEvent[];
  error: string | null;
  publish: (input: FallEventInput) => Promise<StoredFallEvent>;
}

const Ctx = createContext<EventStoreValue | null>(null);

export function EventStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<EventStore | null>(null);
  const [mode, setMode] = useState<StoreMode | "loading">("loading");
  const [detail, setDetail] = useState("Connecting to the event log…");
  const [events, setEvents] = useState<StoredFallEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    getEventStore().then((store) => {
      storeRef.current = store;
      if (cancelled) return;
      setMode(store.mode);
      setDetail(store.detail);
      unsubscribe = store.subscribe((rows, subscribeError) => {
        setEvents((current) => {
          if (store.mode === "local") return rows;
          const extras = current.filter((item) => item.source === "local" && !rows.some((row) => row.id === item.id));
          return [...extras, ...rows].slice(0, 50);
        });
        setError(subscribeError);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<EventStoreValue>(
    () => ({
      status: mode === "loading" ? "loading" : "ready",
      mode,
      detail,
      events,
      error,
      publish: async (input) => {
        const store = storeRef.current ?? (await getEventStore());
        const stored = await store.publish(input);
        if (stored.source === "local" && store.mode !== "local") {
          setEvents((current) => [stored, ...current.filter((item) => item.id !== stored.id)].slice(0, 50));
        }
        return stored;
      },
    }),
    [mode, detail, events, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEventStore(): EventStoreValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useEventStore must be used inside EventStoreProvider");
  return value;
}
