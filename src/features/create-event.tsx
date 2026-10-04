import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useBlocker, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../app/session";
import { useI18n } from "../i18n/provider";
import { canCreateEvent, createEvent } from "../data/repository";
import {
  eventValues,
  eventPayload,
  validateEvent,
} from "../domain/event-setup";
import { errorCode } from "../domain/validation";
import { EventFields } from "../components/event-fields";
import { ErrorState, Loading } from "../components/states";
import { LanguageButton } from "./auth";
export default function CreateEvent() {
  const { session, loading } = useSession();
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const eligibility = useQuery({
    queryKey: ["event-create-access", session?.user.id],
    queryFn: canCreateEvent,
    enabled: !!session,
    refetchInterval: 20000,
  });
  const [draft, setDraft] = useState(() => eventValues());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState<unknown>(),
    [created, setCreated] = useState<string>();
  const request = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const dirty =
    !created &&
    (JSON.stringify(draft) !== JSON.stringify(eventValues()) ||
      uncertain ||
      pending);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm(t("unsaved"))) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, t]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (created) navigate("/e/" + created, { replace: true });
  }, [created, navigate]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current || !eligibility.data || eligibility.error) return;
    const found = validateEvent(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      const id = await createEvent(request.current, eventPayload(draft));
      await qc.invalidateQueries({ queryKey: ["events"] });
      setCreated(id);
    } catch (err) {
      setError(err);
      if (["network", "unknown"].includes(errorCode(err))) setUncertain(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/" replace />;
  return (
    <main className="event-picker event-setup">
      <header>
        <Link to="/events">{t("backToEvents")}</Link>
        <LanguageButton />
      </header>
      <h1>{t("createEvent")}</h1>
      {eligibility.isPending ? (
        <Loading />
      ) : !eligibility.data ? (
        <>
          {eligibility.error ? (
            <ErrorState
              error={eligibility.error}
              retry={() => void eligibility.refetch()}
            />
          ) : (
            <p className="notice">{t("eventCreationRestricted")}</p>
          )}
        </>
      ) : (
        <form className="card" data-dirty={dirty} onSubmit={submit}>
          <EventFields
            draft={draft}
            errors={errors}
            disabled={pending || uncertain}
            onChange={(k, v) => {
              setDraft((d) => ({ ...d, [k]: v }));
              setErrors({});
            }}
          />
          {uncertain && (
            <p className="notice" role="status">
              {t("eventCreateUncertain")}
            </p>
          )}
          {!!error && <ErrorState error={error} />}
          {!!eligibility.error && (
            <ErrorState
              error={eligibility.error}
              retry={() => void eligibility.refetch()}
            />
          )}
          <div className="form-actions">
            <button
              className="primary"
              disabled={pending || !!eligibility.error}
            >
              {t(pending ? "saving" : uncertain ? "retry" : "createEvent")}
            </button>
            <Link to="/events">{t("cancel")}</Link>
          </div>
        </form>
      )}
    </main>
  );
}
