import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { catalog } from "../domain/catalog";
import { title, type Kind, type RecordRow } from "../domain/model";
import { Badge, ErrorState, Loading } from "./states";
import { DraftIndicator } from "./draft-indicator";

export function WorkspaceState({
  pending,
  error,
  retry,
  children,
}: {
  pending: boolean;
  error: unknown;
  retry: () => void;
  children: ReactNode;
}) {
  if (error) return <ErrorState error={error} retry={retry} />;
  if (pending) return <Loading />;
  return <>{children}</>;
}
export function WorkspaceHeader({
  label,
  hint,
  kind,
}: {
  label: string;
  hint: string;
  kind: Kind;
}) {
  const { event, writable } = useEvent();
  const { t } = useI18n();
  const root = `/e/${event.id}`;
  const createLabel =
    kind === "person"
      ? "addPerson"
      : kind === "task"
        ? "addTask"
        : kind === "payment"
          ? "recordPayment"
          : kind === "flight"
            ? "createFlight"
            : "createIssue";
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{t("operationalWorkspace")}</p>
        <h1>{t(label)}</h1>
        <p className="muted">{t(hint)}</p>
      </div>
      <div className="actions">
        <Link className="button" to={`${root}/${kind}`}>
          {t("allRecords")}
        </Link>
        {writable && (
          <Link className="button primary" to={`${root}/${kind}/new`}>
            {t(createLabel)}
          </Link>
        )}
      </div>
    </div>
  );
}
export function WorkspaceEmpty({ kind }: { kind: Kind }) {
  const { event, writable } = useEvent();
  const { t } = useI18n();
  return (
    <div className="workspace-empty">
      <h3>{t("workspaceEmpty")}</h3>
      <p>
        {t("captureFirst")} · {t(catalog[kind].label)}
      </p>
      {writable && (
        <Link className="button primary" to={`/e/${event.id}/${kind}/new`}>
          {t("add")} · {t(catalog[kind].label)}
        </Link>
      )}
    </div>
  );
}
export function RecordLink({ kind, row }: { kind: Kind; row?: RecordRow }) {
  const { event } = useEvent();
  const { t, locale } = useI18n();
  return row ? (
    <Link to={`/e/${event.id}/${kind}/${row.id}`}>
      {title(kind, row, locale)}
    </Link>
  ) : (
    <span className="muted">{t("notSet")}</span>
  );
}
export function ContextActions({ kind, row }: { kind: Kind; row: RecordRow }) {
  const { event, writable } = useEvent();
  const { t } = useI18n();
  const root = `/e/${event.id}`;
  const actions: Array<[Kind, string, string]> =
    kind === "person"
      ? [
          ["flight_passenger", "person_id", "assignFlight"],
          ["trip_passenger", "person_id", "assignTransport"],
          ["accommodation_assignment", "person_id", "assignBed"],
          ["payment", "person_id", "recordPayment"],
        ]
      : kind === "flight"
        ? [["flight_passenger", "flight_id", "addPassenger"]]
        : kind === "trip"
          ? [["trip_passenger", "trip_id", "addPassenger"]]
          : [];
  return (
    <details className="context-actions">
      <summary>{t("actions")}</summary>
      <div>
        <Link to={`${root}/${kind}/${row.id}`}>{t("overview")}</Link>
        {writable && !row.is_deleted && (
          <>
            <Link to={`${root}/${kind}/${row.id}/edit`}>{t("edit")}</Link>
            {actions.map(([k, key, label]) => (
              <Link key={k} to={`${root}/${k}/new?${key}=${row.id}`}>
                {t(label)}
              </Link>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
export function OperationalCard({
  kind,
  row,
  children,
}: {
  kind: Kind;
  row: RecordRow;
  children: ReactNode;
}) {
  return (
    <article className="ops-card">
      <header>
        <h3>
          <RecordLink kind={kind} row={row} />
        </h3>
        <ContextActions kind={kind} row={row} />
      </header>
      <div className="heading-meta">
        <Badge value={row.status} />
        <DraftIndicator kind={kind} values={row} />
      </div>
      {children}
    </article>
  );
}
export function Metric({
  label,
  value,
  to,
}: {
  label: string;
  value: ReactNode;
  to?: string;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <span>{t(label)}</span>
      <strong>{value}</strong>
    </>
  );
  return to ? (
    <Link className="workspace-metric" to={to}>
      {content}
    </Link>
  ) : (
    <div className="workspace-metric">{content}</div>
  );
}
