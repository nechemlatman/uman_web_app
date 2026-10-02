import { developmentSingleton } from "./development-singleton";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, Navigate } from "react-router-dom";
import { events } from "../data/repository";
import { backend } from "../data/client";
import { tables, type EventRow } from "../domain/model";
import { useSession } from "./session";
import { useI18n } from "../i18n/provider";
import { ErrorState, Loading } from "../components/states";
const EventContext = developmentSingleton("event-context", () =>
  createContext<{
    event: EventRow;
    online: boolean;
    writable: boolean;
    sync: string;
  } | null>(null),
);
export function useEvent() {
  const value = useContext(EventContext);
  if (!value) throw new Error("event context");
  return value;
}
export function EventProvider({ children }: { children: ReactNode }) {
  const { eventId } = useParams();
  const { session, loading } = useSession();
  const qc = useQueryClient();
  const { t } = useI18n();
  const userId = session?.user.id;
  const [online, setOnline] = useState(navigator.onLine);
  const [sync, setSync] = useState("syncing");
  const query = useQuery({
    queryKey: ["events", session?.user.id],
    queryFn: events,
    refetchInterval: 20000,
    enabled: !!session,
  });
  useEffect(() => {
    if (!eventId || !userId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let again = false;
    async function reconcile() {
      if (disposed) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["event", eventId] }),
            qc.invalidateQueries({ queryKey: ["events"] }),
          ]);
        } while (again && !disposed);
      } finally {
        running = false;
      }
    }
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reconcile(), 250);
    };
    let channel = backend().channel(
      "web-" + eventId + "-" + crypto.randomUUID(),
    );
    for (const table of [...Object.values(tables), "event_members"])
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: "event_id=eq." + eventId,
        },
        invalidate,
      );
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "events",
        filter: "id=eq." + eventId,
      },
      invalidate,
    );
    channel.subscribe((status) => {
      if (disposed) return;
      setSync(
        status === "SUBSCRIBED"
          ? "connected"
          : status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ? "disconnected"
            : "syncing",
      );
      if (status === "SUBSCRIBED") void reconcile();
    });
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void reconcile();
    };
    const focus = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", focus);
    const poll = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible")
        void reconcile();
    }, 20000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(poll);
      void backend().removeChannel(channel);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", focus);
      void qc.cancelQueries({ queryKey: ["event", eventId] });
      qc.removeQueries({ queryKey: ["event", eventId] });
    };
  }, [eventId, userId, qc]);
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/" replace />;
  if (query.isPending) return <Loading />;
  if (query.error && !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const event = query.data?.find((e) => e.id === eventId);
  if (!event)
    return (
      <div className="access card">
        <h1>{t("noEvents")}</h1>
        <p>{t("noEventsHelp")}</p>
        <Link className="button" to="/events">
          {t("events")}
        </Link>
      </div>
    );
  return (
    <EventContext.Provider
      value={{
        event,
        online,
        writable:
          online && !query.isError && event.lifecycle_stage !== "ARCHIVED",
        sync: online ? sync : "offline",
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
