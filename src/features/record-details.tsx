import { ParticipantProfile } from "./participant-profile";
import { DraftIndicator } from "../components/draft-indicator";
import { StayBoard } from "./stay-board";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { catalog } from "../domain/catalog";
import { title, type Kind, type RecordRow } from "../domain/model";
import { lifecycle, rpc } from "../data/repository";
import { useEvent } from "../app/event";
import { useI18n, formatDate } from "../i18n/provider";
import { RecordValue } from "../components/record-value";
import { Badge, ErrorState } from "../components/states";
import { Records } from "./entity";
import { Activity } from "./operations";
const relations: Partial<Record<Kind, Array<[Kind, string]>>> = {
  person: [
    ["flight_passenger", "person_id"],
    ["accommodation_assignment", "person_id"],
    ["trip_passenger", "person_id"],
    ["payment", "person_id"],
    ["task", "assignee_id"],
  ],
  flight: [
    ["flight_passenger", "flight_id"],
    ["trip", "related_flight_id"],
  ],
  trip: [["trip_passenger", "trip_id"]],
  driver: [["trip", "driver_id"]],
  vehicle: [["trip", "vehicle_id"]],
  apartment: [
    ["room", "apartment_id"],
    ["apartment_issue", "apartment_id"],
  ],
  room: [["sleeping_place", "room_id"]],
  sleeping_place: [["accommodation_assignment", "sleeping_place_id"]],
};
export function Details({ kind, row }: { kind: Kind; row: RecordRow }) {
  const { event, writable } = useEvent();
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState(false);
  const financial = kind === "payment" || kind === "expense";
  const root = "/e/" + event.id + "/" + kind;
  async function archive() {
    if (!window.confirm(t(financial ? "reverseConfirm" : "archiveConfirm")))
      return;
    setPending(true);
    setError(undefined);
    try {
      if (financial)
        await rpc("reverse_" + kind, {
          p_event_id: event.id,
          p_id: row.id,
          p_expected_version: row.version,
        });
      else await lifecycle(event.id, kind, row, !row.is_deleted);
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <Link
            className="eyebrow"
            to={kind === "person" ? `/e/${event.id}/people` : root}
          >
            {t(catalog[kind].label)}
          </Link>
          <h1>{title(kind, row, locale) || t(catalog[kind].label)}</h1>
          <DraftIndicator kind={kind} values={row} details />
          <div className="heading-meta">
            <Badge
              value={
                row.is_deleted
                  ? "ARCHIVED"
                  : row.reversed_at_utc
                    ? "reversed"
                    : (row.status ?? row.passenger_status ?? "ACTIVE")
              }
            />
            <span>
              {t("version")} {row.version}
            </span>
          </div>
        </div>
        <div className="actions">
          {writable && !row.is_deleted && !financial && (
            <Link className="button primary" to={root + "/" + row.id + "/edit"}>
              {t("edit")}
            </Link>
          )}
          {writable && !row.reversed_at_utc && (
            <button disabled={pending} onClick={() => void archive()}>
              {t(
                financial ? "reverse" : row.is_deleted ? "restore" : "archive",
              )}
            </button>
          )}
        </div>
      </div>
      {!!error && <ErrorState error={error} />}
      <article className="card">
        <div className="section-heading">
          <h2>{t(kind === "person" ? "identity" : "overview")}</h2>
          <small className="muted">
            {t("updated")} · {formatDate(row.updated_at_utc, locale, true)}
          </small>
        </div>
        <dl className="detail-grid">
          {catalog[kind].fields
            .filter(
              (f) =>
                (kind !== "person" || f.key !== "notes") &&
                row[f.key] !== null &&
                row[f.key] !== undefined &&
                row[f.key] !== "",
            )
            .map((field) => (
              <div
                className={field.key.includes("passport") ? "sensitive" : ""}
                key={field.key}
              >
                <dt>{t(field.label)}</dt>
                <dd>
                  <RecordValue field={field} row={row} />
                </dd>
              </div>
            ))}
          {financial && (
            <div>
              <dt>{t("baseCurrency")}</dt>
              <dd>
                <bdi>
                  {String(row.base_amount ?? t("conversionPending"))}{" "}
                  {String(row.base_currency ?? "")}
                </bdi>
              </dd>
            </div>
          )}
        </dl>
        {financial && <p className="notice">{t("immutableFinance")}</p>}
      </article>
      {!row.is_deleted && (kind === "apartment" || kind === "room") && (
        <StayBoard
          key={row.id}
          apartmentId={kind === "apartment" ? row.id : undefined}
          roomId={kind === "room" ? row.id : undefined}
        />
      )}
      {kind === "person" && <ParticipantProfile person={row} />}
      {(kind === "person" ? [] : (relations[kind] ?? []))
        .filter(
          ([related]) =>
            !(
              (kind === "apartment" && related === "room") ||
              (kind === "room" && related === "sleeping_place")
            ),
        )
        .map(([related, key]) => (
          <Records
            key={related}
            kind={related}
            compact
            filter={{ key, value: row.id }}
          />
        ))}
      <section className="card">
        <button
          className="quiet"
          aria-expanded={history}
          onClick={() => setHistory(!history)}
        >
          {t("history")}
        </button>
        {history && <Activity entityId={row.id} />}
      </section>
    </section>
  );
}
