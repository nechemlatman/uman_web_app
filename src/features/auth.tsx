import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { backend, configured } from "../data/client";
import { events, canCreateEvent } from "../data/repository";
import { useSession } from "../app/session";
import { useI18n, formatDate } from "../i18n/provider";
import { Loading, ErrorState, Badge } from "../components/states";
export function LanguageButton() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      className="quiet language"
      onClick={() => setLocale(locale === "he" ? "en" : "he")}
      lang={locale === "he" ? "en" : "he"}
    >
      {locale === "he" ? "English" : "עברית"}
    </button>
  );
}
export function Login() {
  const { t } = useI18n();
  const { session, loading } = useSession();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (loading) return <Loading />;
  if (session) return <Navigate to="/events" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    setPending(true);
    setFailed(false);
    try {
      const { error } = await backend().auth.signInWithPassword({
        email: String(values.get("email")),
        password: String(values.get("password")),
      });
      if (error) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="wordmark">
          UMAN<span>EVENT MANAGER</span>
        </div>
        <div>
          <p className="eyebrow">UMAN · {t("operations")}</p>
          <h1>{t("welcome")}</h1>
          <p>{t("welcomeText")}</p>
          <div className="story-line" />
          <span>{t("location")}</span>
        </div>
        <small>UMAN EVENT MANAGER</small>
      </section>
      <section className="login-panel">
        <div className="login-language">
          <LanguageButton />
        </div>
        <div className="login-form">
          <p className="eyebrow">{t("secureAccess")}</p>
          <h2>{t(configured ? "signIn" : "configure")}</h2>
          <p className="muted">
            {t(configured ? "loginHint" : "configureHelp")}
          </p>
          {configured && (
            <form onSubmit={submit}>
              <label>
                {t("email")}
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  dir="ltr"
                />
              </label>
              <label>
                {t("password")}
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                />
              </label>
              {failed && (
                <p className="notice error" role="alert">
                  {t("authError")}
                </p>
              )}
              <button className="primary" disabled={pending}>
                {t(pending ? "loading" : "signIn")}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
export function EventSelection() {
  const { session, loading } = useSession();
  const { t, locale } = useI18n();
  const q = useQuery({
    queryKey: ["events", session?.user.id],
    queryFn: events,
    enabled: !!session,
  });
  const eligibility = useQuery({
    queryKey: ["event-create-access", session?.user.id],
    queryFn: canCreateEvent,
    enabled: !!session,
    refetchInterval: 20000,
  });
  const [error, setError] = useState<unknown>();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/" replace />;
  return (
    <main className="event-picker">
      <header>
        <div className="wordmark">
          UMAN<span>EVENT MANAGER</span>
        </div>
        <LanguageButton />
      </header>
      <p className="eyebrow">{t("secureAccess")}</p>
      <div className="section-heading">
        <h1>{t("eventAccess")}</h1>
        {eligibility.data && !eligibility.error && (
          <Link className="button primary" to="/events/new">
            {t("createEvent")}
          </Link>
        )}
      </div>
      {!!eligibility.error && (
        <ErrorState
          error={eligibility.error}
          retry={() => void eligibility.refetch()}
        />
      )}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : q.data?.length ? (
        <div className="entity-grid">
          {q.data.map((e) => (
            <Link to={"/e/" + e.id} className="card event-card" key={e.id}>
              <Badge value={e.lifecycle_stage} />
              <h2>
                {locale === "he" && e.hebrew_name ? e.hebrew_name : e.name}
              </h2>
              <p>
                {formatDate(e.start_date, locale)} —{" "}
                {formatDate(e.end_date, locale)}
              </p>
              <span>{t("location")}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty">
          <h2>{t("noEvents")}</h2>
          <p>
            {t(
              eligibility.data ? "createFirstEvent" : "eventCreationRestricted",
            )}
          </p>
        </div>
      )}
      {!!error && <ErrorState error={error} />}
      <button
        className="quiet"
        onClick={() =>
          void backend()
            .auth.signOut()
            .then((r) => {
              if (r.error) setError(r.error);
            })
        }
      >
        {t("signOut")}
      </button>
    </main>
  );
}
