import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { rpc } from "../data/repository";
import { type EventRow } from "../domain/model";
import { errorCode } from "../domain/validation";
import { ErrorState, Badge } from "../components/states";
const fields = [
  ["name", "eventName", "text"],
  ["hebrew_name", "hebrewName", "text"],
  ["year", "year", "number"],
  ["start_date", "startDate", "date"],
  ["end_date", "endDate", "date"],
  ["base_currency", "baseCurrency", "text"],
  ["description", "description", "textarea"],
  ["manager_notes", "managerNotes", "textarea"],
];
const values = (event: EventRow) =>
  Object.fromEntries(
    fields.map(([key]) => [key, String(event[key as keyof EventRow] ?? "")]),
  );
export default function Settings() {
  const { event, writable } = useEvent();
  const { t, locale, setLocale } = useI18n();
  const qc = useQueryClient();
  const [base, setBase] = useState(event);
  const [draft, setDraft] = useState(() => values(event));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const [compare, setCompare] = useState(false);
  const original = useRef(JSON.stringify(values(event)));
  const dirty = JSON.stringify(draft) !== original.current;
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm(t("unsaved"))) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, t]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const [theme, setTheme] = useState(
    localStorage.getItem("uman.theme") || "light",
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setSaved(false);
    setError(undefined);
    try {
      const args: Record<string, unknown> = {
        p_id: event.id,
        p_expected_version: base.version,
      };
      for (const [key] of fields) {
        const val = draft[key];
        args["p_" + key] = val ? (key === "year" ? Number(val) : val) : null;
      }
      const fresh = await rpc<EventRow>("edit_event_details", args);
      setBase(fresh);
      original.current = JSON.stringify(draft);
      await qc.invalidateQueries({ queryKey: ["events"] });
      setSaved(true);
    } catch (err) {
      setError(err);
      await qc.invalidateQueries({ queryKey: ["events"] });
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <h1>{t("settings")}</h1>
      <section className="card">
        <div className="section-heading">
          <h2>{t("currentEvent")}</h2>
          <Badge value={event.lifecycle_stage} />
        </div>
        <form data-dirty={dirty} onSubmit={submit}>
          <div className="form-grid">
            {fields.map(([key, label, type]) => (
              <label key={key}>
                {t(label)}
                {type === "textarea" ? (
                  <textarea
                    name={key}
                    rows={4}
                    value={draft[key]}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, [key]: e.target.value }));
                      setSaved(false);
                    }}
                    disabled={pending || !writable}
                  />
                ) : (
                  <input
                    name={key}
                    type={type}
                    value={draft[key]}
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, [key]: e.target.value }));
                      setSaved(false);
                    }}
                    required={key === "name"}
                    disabled={pending || !writable}
                  />
                )}
              </label>
            ))}
          </div>
          {!!error && <ErrorState error={error} />}
          {!!error && errorCode(error) === "conflict" && (
            <button type="button" onClick={() => setCompare(true)}>
              {t("compare")}
            </button>
          )}
          {compare && (
            <div className="notice">
              <h3>{t("latest")}</h3>
              <dl className="detail-grid">
                {fields.map(([key, label]) => (
                  <div key={key}>
                    <dt>{t(label)}</dt>
                    <dd>{values(event)[key] || "—"}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={() => {
                  const old = values(base),
                    next = values(event);
                  setDraft((d) =>
                    Object.fromEntries(
                      fields.map(([key]) => [
                        key,
                        d[key] === old[key] ? next[key] : d[key],
                      ]),
                    ),
                  );
                  setBase(event);
                  setCompare(false);
                  setError(undefined);
                }}
              >
                {t("acceptLatest")}
              </button>
            </div>
          )}
          <div className="form-actions">
            {saved && <span role="status">{t("saved")}</span>}
            <button className="primary" disabled={!writable || pending}>
              {t(pending ? "saving" : "save")}
            </button>
          </div>
        </form>
      </section>
      <section className="card">
        <h2>{t("appearance")}</h2>
        <div className="form-grid">
          <label>
            {t("language")}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as "he" | "en")}
            >
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            {t("appearance")}
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                localStorage.setItem("uman.theme", e.target.value);
                document.documentElement.dataset.theme = e.target.value;
              }}
            >
              <option value="light">{t("light")}</option>
              <option value="dark">{t("dark")}</option>
            </select>
          </label>
        </div>
      </section>
    </section>
  );
}
