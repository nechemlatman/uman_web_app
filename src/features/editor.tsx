import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { catalog, encodeFields, initialFields } from "../domain/catalog";
import { type Fields, type Kind, type RecordRow } from "../domain/model";
import { validate, errorCode } from "../domain/validation";
import { read, rpc, save } from "../data/repository";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { RelationPicker } from "../components/relation-picker";
import { ErrorState } from "../components/states";
type Warning = { id: string; rule: string; label: string };
export function Editor({
  kind,
  row,
  preset = {},
}: {
  kind: Kind;
  row?: RecordRow;
  preset?: Fields;
}) {
  const { event, writable } = useEvent();
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [uncertain, setUncertain] = useState(false);
  const [base, setBase] = useState(row);
  const [fields, setFields] = useState(() => initialFields(kind, row, preset));
  const [error, setError] = useState<unknown>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [latest, setLatest] = useState<RecordRow>();
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const request = useRef(crypto.randomUUID());
  const leaving = useRef(false);
  const original = useRef(JSON.stringify(initialFields(kind, row, preset)));
  const dirty = JSON.stringify(fields) !== original.current;
  const blocker = useBlocker(() => dirty && !leaving.current);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm(t("unsaved"))) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, t]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && !leaving.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const change = (key: string, value: Fields[string]) => {
    setFields((old) => ({ ...old, [key]: value }));
    setReviewed(false);
    setWarnings([]);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!writable || pending) return;
    const encoded = encodeFields(kind, fields, base);
    const issues = validate(kind, encoded);
    setErrors(issues);
    if (Object.keys(issues).length) return;
    setPending(true);
    setError(undefined);
    try {
      if (uncertain && !base) {
        const confirmed = await rpc<string | null>("web_request_status", {
          p_event_id: event.id,
          p_kind: kind,
          p_request_id: request.current,
        });
        if (confirmed) {
          leaving.current = true;
          await qc.invalidateQueries({ queryKey: ["event", event.id] });
          navigate("/e/" + event.id + "/" + kind + "/" + confirmed, {
            replace: true,
          });
          return;
        }
      }
      if (
        ["accommodation_assignment", "trip", "trip_passenger"].includes(kind) &&
        !reviewed
      ) {
        const found = await rpc<Warning[]>("web_assignment_review", {
          p_event_id: event.id,
          p_kind: kind,
          p_id: base?.id ?? null,
          p_fields: encoded,
        });
        if (found.length) {
          setWarnings(found);
          setPending(false);
          return;
        }
      }
      if (kind === "person" && !reviewed) {
        const duplicates = await rpc<RecordRow[]>("person_duplicates", {
          p_event_id: event.id,
          p_fields: encoded,
          p_exclude: base?.id ?? null,
        });
        if (duplicates.length) {
          setWarnings(
            duplicates.map((r) => ({
              id: r.id,
              rule: "duplicate",
              label: [r.first_name, r.last_name].join(" "),
            })),
          );
          setPending(false);
          return;
        }
      }
      const id = await save(event.id, kind, encoded, request.current, base);
      leaving.current = true;
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
      navigate("/e/" + event.id + "/" + kind + "/" + id, { replace: true });
    } catch (err) {
      if (!base && errorCode(err) === "network") setUncertain(true);
      setError(err);
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
    } finally {
      setPending(false);
    }
  }
  async function compare() {
    if (!base) return;
    try {
      setLatest(await read(event.id, kind, base.id));
    } catch (err) {
      setError(err);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t(catalog[kind].label)}</p>
          <h1>{t(row ? "edit" : "newRecord")}</h1>
        </div>
        <button onClick={() => navigate(-1)}>{t("back")}</button>
      </div>
      {["trip", "flight", "task"].includes(kind) && (
        <p className="notice">{t("utcHint")}</p>
      )}
      {kind === "accommodation_assignment" && (
        <p className="notice">{t("stayHint")}</p>
      )}
      {["payment", "expense"].includes(kind) && (
        <p className="notice">
          {t("financeHint")} {t("immutableFinance")}
        </p>
      )}
      {uncertain && (
        <p className="notice warning" role="alert">
          {t("uncertainSave")}
        </p>
      )}
      <form data-dirty={dirty} className="card editor" onSubmit={submit}>
        <div className="form-grid">
          {catalog[kind].fields.map((field) => {
            const immutable =
              !!base &&
              ((["flight_passenger", "trip_passenger"].includes(kind) &&
                ["person_id", "flight_id", "trip_id"].includes(field.key)) ||
                (kind === "room" &&
                  field.key === "apartment_id" &&
                  !!base.apartment_id) ||
                (kind === "sleeping_place" &&
                  field.key === "room_id" &&
                  !!base.room_id) ||
                (kind === "accommodation_assignment" &&
                  !!base.has_been_operational &&
                  ["person_id", "sleeping_place_id"].includes(field.key)));
            const id = "field-" + field.key;
            const value = fields[field.key];
            return (
              <Fragment key={field.key}>
                {field.section && (
                  <h2 className="form-section">{t(field.section)}</h2>
                )}
                <div
                  className={
                    "field " + (field.type === "textarea" ? "wide" : "")
                  }
                  key={field.key}
                >
                  <label htmlFor={id}>
                    {t(field.label)}
                    {field.required && (
                      <span aria-label={t("requiredMark")}> *</span>
                    )}
                  </label>
                  {field.relation ? (
                    <RelationPicker
                      id={id}
                      kind={field.relation}
                      value={String(value ?? "")}
                      disabled={immutable || pending || uncertain}
                      required={field.required}
                      onChange={(v) => change(field.key, v)}
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={id}
                      required={field.required}
                      rows={4}
                      value={String(value ?? "")}
                      onChange={(e) => change(field.key, e.target.value)}
                      maxLength={field.max ?? 10000}
                      disabled={pending || uncertain}
                    />
                  ) : field.type === "select" ? (
                    <select
                      id={id}
                      value={String(value ?? "")}
                      onChange={(e) => change(field.key, e.target.value)}
                      disabled={pending || uncertain}
                    >
                      {!field.default && (
                        <option value="">{t("select")}</option>
                      )}
                      {field.options?.map((o) => (
                        <option key={o} value={o}>
                          {t(o)}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input
                      id={id}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => change(field.key, e.target.checked)}
                      disabled={pending || uncertain}
                    />
                  ) : (
                    <input
                      id={id}
                      type={
                        field.type === "decimal"
                          ? "text"
                          : (field.type ?? "text")
                      }
                      inputMode={
                        field.type === "decimal" ? "decimal" : undefined
                      }
                      dir={
                        [
                          "tel",
                          "number",
                          "decimal",
                          "date",
                          "datetime-local",
                          "email",
                        ].includes(field.type ?? "")
                          ? "ltr"
                          : "auto"
                      }
                      value={String(value ?? "")}
                      onChange={(e) => change(field.key, e.target.value)}
                      required={field.required}
                      aria-invalid={!!errors[field.key]}
                      aria-describedby={
                        errors[field.key] ? id + "-error" : undefined
                      }
                      maxLength={
                        field.max ?? (field.key.includes("notes") ? 10000 : 320)
                      }
                      disabled={pending || uncertain}
                    />
                  )}
                  {errors[field.key] && (
                    <small id={id + "-error"} className="field-error">
                      {t(errors[field.key])}
                    </small>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
        {!!error && <ErrorState error={error} />}{" "}
        {!!error && errorCode(error) === "conflict" && base && (
          <button type="button" onClick={() => void compare()}>
            {t("compare")}
          </button>
        )}
        {latest && (
          <section className="conflict-panel">
            <h2>{t("latest")}</h2>
            <dl className="detail-grid">
              {catalog[kind].fields
                .filter(
                  (f) =>
                    JSON.stringify(latest[f.key]) !==
                    JSON.stringify(fields[f.key]),
                )
                .map((f) => (
                  <div key={f.key}>
                    <dt>{t(f.label)}</dt>
                    <dd>{String(latest[f.key] ?? "—")}</dd>
                    <dd className="muted">
                      {t("yourDraft")}: {String(fields[f.key] ?? "—")}
                    </dd>
                  </div>
                ))}
            </dl>
            <button
              type="button"
              onClick={() => {
                const old = initialFields(kind, base),
                  fresh = initialFields(kind, latest);
                setFields((current) =>
                  Object.fromEntries(
                    Object.keys(fresh).map((key) => [
                      key,
                      JSON.stringify(current[key]) === JSON.stringify(old[key])
                        ? fresh[key]
                        : current[key],
                    ]),
                  ),
                );
                original.current = JSON.stringify(fresh);
                setBase(latest);
                setLatest(undefined);
                setError(undefined);
                setReviewed(false);
                setWarnings([]);
              }}
            >
              {t("acceptLatest")}
            </button>
          </section>
        )}
        {warnings.length > 0 && (
          <div className="notice warning" role="alert">
            <p>{t("operationalWarning")}</p>
            <ul>
              {warnings.map((w) => (
                <li key={w.id}>
                  {t(w.rule)} · {w.label}
                </li>
              ))}
            </ul>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              {t("override")}
            </label>
          </div>
        )}
        <footer className="form-actions">
          <span className="muted">
            {dirty ? t("unsaved").split(".")[0] : ""}
          </span>
          <button type="button" onClick={() => navigate(-1)}>
            {t("cancel")}
          </button>
          <button
            className="primary"
            disabled={
              pending || !writable || (warnings.length > 0 && !reviewed)
            }
          >
            {t(pending ? "saving" : row ? "save" : "create")}
          </button>
        </footer>
      </form>
    </section>
  );
}
