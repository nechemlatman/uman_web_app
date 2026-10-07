import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEvent } from "../app/event";
import { useI18n, formatDate } from "../i18n/provider";
import { list, save, summary } from "../data/repository";
import {
  useWorkspace,
  linkedPeople,
  relationStates,
  liveLink,
  missingIdentity,
  overdue,
  openTask,
} from "../data/workspace";
import { title, type Kind, type RecordRow } from "../domain/model";
import { catalog, encodeFields, initialFields } from "../domain/catalog";
import { Badge, ErrorState } from "../components/states";
import {
  WorkspaceHeader,
  WorkspaceEmpty,
  WorkspaceState,
  RecordLink,
  OperationalCard,
  Metric,
  ContextActions,
  ActiveFilters,
} from "../components/workspace";

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  const { t } = useI18n();
  return (
    <label>
      {t(label)}
      <select
        aria-label={t(label)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PeopleWorkspace() {
  const { event } = useEvent();
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(params.get("filter") ?? "all"),
    [search, setSearch] = useState("");
  const q = useWorkspace([
    "person",
    "flight",
    "flight_passenger",
    "trip",
    "trip_passenger",
    "accommodation_assignment",
    "payment",
  ]);
  const r = q.rows,
    people = r.person ?? [];
  const flights = linkedPeople(
    r.flight_passenger ?? [],
    r.flight ?? [],
    "flight_id",
  );
  const trips = linkedPeople(r.trip_passenger ?? [], r.trip ?? [], "trip_id");
  const stays = new Set(
    (r.accommodation_assignment ?? [])
      .filter((a) => ["ACTIVE", "TEMPORARY"].includes(String(a.status)))
      .map((a) => String(a.person_id)),
  );
  const flightStates = relationStates(
    r.flight_passenger ?? [],
    r.flight ?? [],
    "flight_id",
  );
  const tripStates = relationStates(
    r.trip_passenger ?? [],
    r.trip ?? [],
    "trip_id",
  );
  const visible = people.filter(
    (p) =>
      (filter === "all" ||
        (filter === "active" && p.status === "ACTIVE") ||
        (filter === "incomplete" && missingIdentity(p)) ||
        (filter === "noFlight" && !flights.has(p.id)) ||
        (filter === "noTransport" && !trips.has(p.id)) ||
        (filter === "noStay" && !stays.has(p.id))) &&
      [title("person", p, locale), p.phone, p.whatsapp_phone, p.display_label]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );

  const activeFilters = [
    { key: "search", label: "search", value: search },
    { key: "filter", label: "filter", value: filter === "all" ? "" : filter },
  ];

  return (
    <section>
      <WorkspaceHeader
        label="participantCommand"
        hint="peopleWorkspaceHint"
        kind="person"
      />
      <WorkspaceState {...q}>
        <div className="workspace-metrics">
          <Metric label="participants" value={people.length} />
          <Metric
            label="identityToComplete"
            value={people.filter(missingIdentity).length}
          />
          <Metric
            label="noStay"
            value={people.filter((p) => !stays.has(p.id)).length}
          />
        </div>
        <div className="workspace-filters">
          <label>
            {t("search")}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("peopleSearchHint")}
            />
          </label>
          <Filter
            label="filter"
            value={filter}
            onChange={setFilter}
            options={[
              "all",
              "active",
              "incomplete",
              "noFlight",
              "noTransport",
              "noStay",
            ].map((v) => [v, v])}
          />
        </div>
        <ActiveFilters
          filters={activeFilters}
          onClearFilter={(key) =>
            key === "search" ? setSearch("") : setFilter("all")
          }
          onClearAll={() => {
            setSearch("");
            setFilter("all");
          }}
        />
        <p className="muted">{t("relationDefinitions")}</p>
        {!people.length ? (
          <WorkspaceEmpty kind="person" />
        ) : !visible.length ? (
          <div className="workspace-empty">
            <p>{t("noMatch")}</p>
            <p className="muted">{t("filteredEmptyHelp")}</p>
            <button
              className="button"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              {t("clearFilters")}
            </button>
          </div>
        ) : (
          <div className="participant-list">
            {visible.map((p) => (
              <article className="participant-row" key={p.id}>
                <div className="participant-identity">
                  <span className="avatar" aria-hidden="true">
                    {title("person", p, locale).slice(0, 1)}
                  </span>
                  <div>
                    <h2>
                      <RecordLink kind="person" row={p} />
                    </h2>
                    <div className="contact-links">
                      {!!p.phone && (
                        <a
                          href={`tel:${String(p.phone).replace(/[^+0-9]/g, "")}`}
                        >
                          <bdi>{String(p.phone)}</bdi>
                        </a>
                      )}
                      {!!p.whatsapp_phone && (
                        <a
                          href={`https://wa.me/${String(p.whatsapp_phone).replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("whatsapp")}
                        </a>
                      )}
                    </div>
                    <Badge value={p.status} />
                    {missingIdentity(p) && (
                      <span className="badge tone-waiting">
                        {t("identityToComplete")}
                      </span>
                    )}
                  </div>
                </div>
                <dl className="participant-context">
                  {[
                    ["flights", flights.has(p.id)],
                    ["trips", trips.has(p.id)],
                    ["stay", stays.has(p.id)],
                  ].map(([k, yes]) => (
                    <div key={String(k)}>
                      <dt>{t(String(k))}</dt>
                      <dd className="relation-states">
                        {yes
                          ? (k === "flights"
                              ? flightStates.get(p.id)
                              : k === "trips"
                                ? tripStates.get(p.id)
                                : [
                                    ...new Set(
                                      (r.accommodation_assignment ?? [])
                                        .filter(
                                          (a) =>
                                            a.person_id === p.id &&
                                            ["ACTIVE", "TEMPORARY"].includes(
                                              String(a.status),
                                            ),
                                        )
                                        .map((a) => String(a.status)),
                                    ),
                                  ]
                            )?.map((s) => <Badge key={s} value={s} />)
                          : t("notAssigned")}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt>{t("payments")}</dt>
                    <dd>
                      <Link
                        to={`/e/${event.id}/person/${p.id}#profile-finance`}
                      >
                        {
                          (r.payment ?? []).filter(
                            (a) => a.person_id === p.id && !a.reversed_at_utc,
                          ).length
                        }{" "}
                        · {t("sourceRecords")}
                      </Link>
                    </dd>
                  </div>
                </dl>
                <ContextActions kind="person" row={p} />
              </article>
            ))}
          </div>
        )}
      </WorkspaceState>
    </section>
  );
}

export function TravelWorkspace() {
  const { event, writable } = useEvent();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState("flights"),
    [direction, setDirection] = useState("");
  const q = useWorkspace([
    "flight",
    "flight_passenger",
    "trip",
    "trip_passenger",
    "driver",
    "vehicle",
  ]);
  const r = q.rows;
  const alerts = useQuery({
    queryKey: ["event", event.id, "summary"],
    queryFn: () => summary(event.id),
  });
  const kind = tab === "flights" ? "flight" : "trip";
  const rows = (r[kind] ?? [])
    .filter((a) => !direction || a.direction === direction)
    .sort((a, b) =>
      String(a.scheduled_departure_utc ?? "9999").localeCompare(
        String(b.scheduled_departure_utc ?? "9999"),
      ),
    );

  const activeFilters = [
    { key: "direction", label: "direction", value: direction },
  ];

  return (
    <section>
      <WorkspaceHeader
        label="travelOperations"
        hint="travelWorkspaceHint"
        kind="flight"
      />
      <nav className="tabs">
        {["flights", "groundTransport", "resources"].map((v) => (
          <button
            key={v}
            className={tab === v ? "selected" : ""}
            aria-pressed={tab === v}
            onClick={() => setTab(v)}
          >
            {t(v)}
          </button>
        ))}
        <Link to={`/e/${event.id}/trip/new`}>{t("addTrip")}</Link>
      </nav>
      <WorkspaceState
        {...q}
        pending={q.pending || alerts.isPending}
        error={q.error || alerts.error}
        retry={() => {
          q.retry();
          void alerts.refetch();
        }}
      >
        <div className="workspace-metrics">
          <Metric label="flights" value={(r.flight ?? []).length} />
          <Metric label="trips" value={(r.trip ?? []).length} />
          <Metric
            label="availableDrivers"
            value={
              (r.driver ?? []).filter((a) => a.status === "AVAILABLE").length
            }
          />
        </div>
        {tab === "resources" ? (
          <div className="profile-grid">
            {(["driver", "vehicle"] as Kind[]).map((k) => (
              <section key={k} className="card">
                <div className="section-heading">
                  <h2>{t(catalog[k].label)}</h2>
                  {writable && (
                    <Link to={`/e/${event.id}/${k}/new`}>{t("add")}</Link>
                  )}
                </div>
                {!(r[k] ?? []).length ? (
                  <WorkspaceEmpty kind={k} />
                ) : (
                  (r[k] ?? []).map((a) => (
                    <div className="resource-row" key={a.id}>
                      <RecordLink kind={k} row={a} />
                      <Badge value={a.status} />
                      {k === "vehicle" && (
                        <span>
                          {t("capacity")}: {String(a.capacity ?? "—")}
                        </span>
                      )}
                      <Link to={`/e/${event.id}/${k}/${a.id}/edit`}>
                        {t("edit")}
                      </Link>
                    </div>
                  ))
                )}
              </section>
            ))}
          </div>
        ) : (
          <>
            <div className="workspace-filters">
              <Filter
                label="direction"
                value={direction}
                onChange={setDirection}
                options={[
                  ["", "all"],
                  ["INBOUND", "INBOUND"],
                  ["OUTBOUND", "OUTBOUND"],
                  ...(kind === "trip"
                    ? [["LOCAL", "LOCAL"] as [string, string]]
                    : []),
                ]}
              />
              <Link className="button" to={`/e/${event.id}/${kind}`}>
                {t("allRecords")}
              </Link>
            </div>
            <ActiveFilters
              filters={activeFilters}
              onClearFilter={() => setDirection("")}
              onClearAll={() => setDirection("")}
            />
            {!rows.length ? (
              <div className="workspace-empty">
                <p>{t("noMatch")}</p>
                {direction && (
                  <button className="button" onClick={() => setDirection("")}>
                    {t("clearFilters")}
                  </button>
                )}
              </div>
            ) : (
              <div className="ops-grid">
                {rows.map((a) => {
                  const count = (
                    r[
                      kind === "flight" ? "flight_passenger" : "trip_passenger"
                    ] ?? []
                  ).filter(
                    (p) => p[`${kind}_id`] === a.id && liveLink(p),
                  ).length;

                  let flightTransportStatus = null;
                  if (kind === "flight") {
                    const isInbound = !a.direction || a.direction === "INBOUND";
                    const flightPassengers = (r.flight_passenger ?? []).filter(
                      (p) => p.flight_id === a.id && liveLink(p),
                    );
                    const passengerCount = flightPassengers.length;
                    const flightPersonIds = new Set(
                      flightPassengers.map((p) => String(p.person_id)),
                    );
                    const liveTrips = new Set(
                      (r.trip ?? []).filter(liveLink).map((t) => t.id),
                    );
                    const transportedPersonIds = new Set(
                      (r.trip_passenger ?? [])
                        .filter(
                          (tp) =>
                            liveLink(tp) && liveTrips.has(String(tp.trip_id)),
                        )
                        .map((tp) => String(tp.person_id)),
                    );
                    const assignedCount = [...flightPersonIds].filter((id) =>
                      transportedPersonIds.has(id),
                    ).length;
                    const missingCount = Math.max(
                      0,
                      passengerCount - assignedCount,
                    );

                    if (isInbound && passengerCount > 0) {
                      flightTransportStatus = {
                        assignedCount,
                        passengerCount,
                        missingCount,
                        ready: missingCount === 0,
                      };
                    }
                  }

                  const warnings =
                    alerts.data?.alerts.filter(
                      (v) => v.kind === kind && v.entity_id === a.id,
                    ) ?? [];
                  return (
                    <OperationalCard key={a.id} kind={kind} row={a}>
                      <p className="route-line">
                        <bdi>
                          {String(a.departure_airport || a.origin || "—")} →{" "}
                          {String(a.arrival_airport || a.destination || "—")}
                        </bdi>
                      </p>
                      <dl className="ops-facts">
                        <div>
                          <dt>{t("direction")}</dt>
                          <dd>{t(String(a.direction ?? "notSet"))}</dd>
                        </div>
                        <div>
                          <dt>{t("departure")}</dt>
                          <dd>
                            <bdi>
                              {formatDate(
                                a.scheduled_departure_utc,
                                locale,
                                true,
                              )}
                            </bdi>
                          </dd>
                        </div>
                        <div>
                          <dt>{t("arrival")}</dt>
                          <dd>
                            <bdi>
                              {formatDate(
                                a.scheduled_arrival_utc,
                                locale,
                                true,
                              )}
                            </bdi>
                          </dd>
                        </div>
                        <div>
                          <dt>{t("passengers")}</dt>
                          <dd>
                            {count} · {t("nonCancelled")}
                          </dd>
                        </div>
                        {kind === "trip" ? (
                          <>
                            <div>
                              <dt>{t("driver")}</dt>
                              <dd>
                                <RecordLink
                                  kind="driver"
                                  row={r.driver?.find(
                                    (v) => v.id === a.driver_id,
                                  )}
                                />
                              </dd>
                            </div>
                            <div>
                              <dt>{t("vehicle")}</dt>
                              <dd>
                                <RecordLink
                                  kind="vehicle"
                                  row={r.vehicle?.find(
                                    (v) => v.id === a.vehicle_id,
                                  )}
                                />
                              </dd>
                            </div>
                            <div>
                              <dt>{t("capacity")}</dt>
                              <dd>
                                {String(
                                  r.vehicle?.find((v) => v.id === a.vehicle_id)
                                    ?.capacity ?? "—",
                                )}
                              </dd>
                            </div>
                          </>
                        ) : (
                          <div>
                            <dt>{t("airline")}</dt>
                            <dd>{String(a.airline ?? "—")}</dd>
                          </div>
                        )}
                      </dl>
                      {flightTransportStatus && (
                        <p
                          className={`notice ${flightTransportStatus.ready ? "success" : "warning"}`}
                        >
                          {flightTransportStatus.ready
                            ? `${t("transportReady")} · ${flightTransportStatus.assignedCount}/${flightTransportStatus.passengerCount} ${t("assignedCount")}`
                            : `${flightTransportStatus.assignedCount}/${flightTransportStatus.passengerCount} ${t("assignedCount")} · ${flightTransportStatus.missingCount} ${t("missingTransport")}`}
                        </p>
                      )}
                      {Number(a.delay_minutes) > 0 && (
                        <p className="notice warning">
                          {t("delayMinutes")}: {String(a.delay_minutes)}
                        </p>
                      )}
                      {warnings.map((w) => (
                        <p className="notice warning" key={w.id}>
                          {t(w.rule)}
                        </p>
                      ))}
                      <Link
                        className="button"
                        to={`/e/${event.id}/${kind}/${a.id}`}
                      >
                        {t("viewPassengers")}
                      </Link>
                    </OperationalCard>
                  );
                })}
              </div>
            )}
          </>
        )}
      </WorkspaceState>
    </section>
  );
}

export function WorkBoard({ kind }: { kind: "task" | "apartment_issue" }) {
  const { t, locale } = useI18n();
  const { event, writable } = useEvent();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("filter") ?? "open"),
    [priority, setPriority] = useState(params.get("priority") ?? ""),
    [context, setContext] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<{
    id: string;
    error: unknown;
  } | null>(null);

  const q = useWorkspace([
    kind,
    "person",
    ...(kind === "apartment_issue" ? ["apartment" as Kind] : []),
  ]);
  const r = q.rows;
  const issue = kind === "apartment_issue";
  const all = r[kind] ?? [];
  const contextKind = issue ? "apartment" : "person";
  const contextKey = issue ? "apartment_id" : "assignee_id";

  const rows = all.filter(
    (a) =>
      (mode === "all" ||
        (mode === "open" &&
          (issue
            ? !["RESOLVED", "CLOSED"].includes(String(a.status))
            : openTask(a))) ||
        (mode === "overdue" && overdue(a)) ||
        a.status === mode) &&
      (!priority ||
        a.priority === priority ||
        (priority === "urgent" &&
          ["HIGH", "CRITICAL"].includes(String(a.priority)))) &&
      (!context || a[contextKey] === context),
  );

  const statuses = catalog[kind].fields.find(
    (f) => f.key === "status",
  )!.options!;

  async function handleQuickStatus(row: RecordRow, newStatus: string) {
    setSavingId(row.id);
    setStatusError(null);
    try {
      const encoded = encodeFields(
        kind,
        { ...initialFields(kind, row), status: newStatus },
        row,
      );
      await save(event.id, kind, encoded, crypto.randomUUID(), row);
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
    } catch (err) {
      setStatusError({ id: row.id, error: err });
    } finally {
      setSavingId(null);
    }
  }

  const activeFilters = [
    { key: "filter", label: "filter", value: mode === "open" ? "" : mode },
    { key: "priority", label: "priority", value: priority },
    {
      key: "context",
      label: issue ? "apartment" : "assignee",
      value: context
        ? (() => {
            const ctxRow = (r[contextKind] ?? []).find((a) => a.id === context);
            return ctxRow ? title(contextKind, ctxRow, locale) : context;
          })()
        : "",
    },
  ];

  const clearAllFilters = () => {
    setMode("open");
    setPriority("");
    setContext("");
  };

  return (
    <section>
      <WorkspaceHeader
        label={issue ? "issuesBoard" : "taskBoard"}
        hint={issue ? "issuesWorkspaceHint" : "tasksWorkspaceHint"}
        kind={kind}
      />
      <WorkspaceState {...q}>
        <div className="workspace-metrics">
          <Metric
            label={issue ? "openIssues" : "openTasks"}
            value={
              all.filter((a) =>
                issue
                  ? !["RESOLVED", "CLOSED"].includes(String(a.status))
                  : openTask(a),
              ).length
            }
          />
          <Metric
            label="highOrCritical"
            value={
              all.filter(
                (a) =>
                  ["HIGH", "CRITICAL"].includes(String(a.priority)) &&
                  (issue
                    ? !["RESOLVED", "CLOSED"].includes(String(a.status))
                    : openTask(a)),
              ).length
            }
          />
          {!issue && (
            <Metric
              label="overdue"
              value={all.filter((a) => overdue(a)).length}
            />
          )}
        </div>
        <div className="workspace-filters">
          <Filter
            label="filter"
            value={mode}
            onChange={setMode}
            options={[
              ["open", "openItems"],
              ["all", "all"],
              ...(!issue ? [["overdue", "overdue"] as [string, string]] : []),
              ...statuses.map((s) => [s, s] as [string, string]),
            ]}
          />
          <Filter
            label="priority"
            value={priority}
            onChange={setPriority}
            options={[
              ["", "all"],
              ["urgent", "highOrCritical"],
              ...["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(
                (s) => [s, s] as [string, string],
              ),
            ]}
          />
          <Filter
            label={issue ? "apartment" : "assignee"}
            value={context}
            onChange={setContext}
            options={[
              ["", "all"],
              ...(r[contextKind] ?? []).map(
                (a) =>
                  [a.id, title(contextKind, a, locale)] as [string, string],
              ),
            ]}
          />
        </div>
        <ActiveFilters
          filters={activeFilters}
          onClearFilter={(key) => {
            if (key === "filter") setMode("open");
            if (key === "priority") setPriority("");
            if (key === "context") setContext("");
          }}
          onClearAll={clearAllFilters}
        />
        {!all.length ? (
          <WorkspaceEmpty kind={kind} />
        ) : !rows.length ? (
          <div className="workspace-empty">
            <p>{t("noMatch")}</p>
            <p className="muted">{t("filteredEmptyHelp")}</p>
            <button className="button" onClick={clearAllFilters}>
              {t("clearFilters")}
            </button>
          </div>
        ) : (
          <div className="work-board">
            {statuses
              .filter((s) => rows.some((a) => a.status === s))
              .map((s) => (
                <section className="board-lane" key={s}>
                  <h2>
                    <Badge value={s} />
                    <span>{rows.filter((a) => a.status === s).length}</span>
                  </h2>
                  {rows
                    .filter((a) => a.status === s)
                    .sort(
                      (a, b) =>
                        ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(
                          String(a.priority),
                        ) -
                        ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(
                          String(b.priority),
                        ),
                    )
                    .map((a) => (
                      <OperationalCard kind={kind} row={a} key={a.id}>
                        <Badge value={a.priority} />
                        <dl className="ops-facts">
                          <div className={issue ? "issue-location" : ""}>
                            <dt>{t(issue ? "apartment" : "assignee")}</dt>
                            <dd>
                              <RecordLink
                                kind={contextKind}
                                row={r[contextKind]?.find(
                                  (p) => p.id === a[contextKey],
                                )}
                              />
                            </dd>
                          </div>
                          <div>
                            <dt>{t(issue ? "reporter" : "deadline")}</dt>
                            <dd>
                              {issue ? (
                                <RecordLink
                                  kind="person"
                                  row={r.person?.find(
                                    (p) => p.id === a.reporter_id,
                                  )}
                                />
                              ) : (
                                <bdi>
                                  {formatDate(a.due_date_utc, locale, true)}
                                </bdi>
                              )}
                            </dd>
                          </div>
                        </dl>
                        {!issue && overdue(a) && (
                          <p className="notice error">{t("overdue")}</p>
                        )}
                        {issue && (
                          <>
                            <p className="muted">
                              {t("updated")} ·{" "}
                              <bdi>
                                {formatDate(a.updated_at_utc, locale, true)}
                              </bdi>
                            </p>
                            {!!a.resolution_notes && (
                              <p className="resolution-note">
                                {String(a.resolution_notes)}
                              </p>
                            )}
                          </>
                        )}
                        {writable && (
                          <div className="quick-status-actions">
                            {!issue && a.status === "NEW" && (
                              <>
                                <button
                                  className="button"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "IN_PROGRESS")
                                  }
                                >
                                  {t("markInProgress")}
                                </button>
                                <button
                                  className="button"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "WAITING")
                                  }
                                >
                                  {t("markWaiting")}
                                </button>
                                <button
                                  className="button primary"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "COMPLETED")
                                  }
                                >
                                  {t("markComplete")}
                                </button>
                              </>
                            )}
                            {!issue && a.status === "IN_PROGRESS" && (
                              <>
                                <button
                                  className="button"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "WAITING")
                                  }
                                >
                                  {t("markWaiting")}
                                </button>
                                <button
                                  className="button primary"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "COMPLETED")
                                  }
                                >
                                  {t("markComplete")}
                                </button>
                              </>
                            )}
                            {!issue && a.status === "WAITING" && (
                              <>
                                <button
                                  className="button"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "IN_PROGRESS")
                                  }
                                >
                                  {t("markInProgress")}
                                </button>
                                <button
                                  className="button primary"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "COMPLETED")
                                  }
                                >
                                  {t("markComplete")}
                                </button>
                              </>
                            )}
                            {issue && a.status === "OPEN" && (
                              <>
                                <button
                                  className="button"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "IN_PROGRESS")
                                  }
                                >
                                  {t("markInProgress")}
                                </button>
                                <button
                                  className="button primary"
                                  disabled={savingId === a.id}
                                  onClick={() =>
                                    void handleQuickStatus(a, "RESOLVED")
                                  }
                                >
                                  {t("resolve")}
                                </button>
                              </>
                            )}
                            {issue && a.status === "IN_PROGRESS" && (
                              <button
                                className="button primary"
                                disabled={savingId === a.id}
                                onClick={() =>
                                  void handleQuickStatus(a, "RESOLVED")
                                }
                              >
                                {t("resolve")}
                              </button>
                            )}
                            <Link
                              className="button"
                              to={`/e/${event.id}/${kind}/${a.id}/edit`}
                            >
                              {t("updateStatus")}
                            </Link>
                          </div>
                        )}
                        {statusError?.id === a.id && (
                          <ErrorState error={statusError.error} />
                        )}
                      </OperationalCard>
                    ))}
                </section>
              ))}
          </div>
        )}
      </WorkspaceState>
    </section>
  );
}

export function FinanceWorkspace() {
  const { event, writable } = useEvent();
  const { t, locale } = useI18n();
  const q = useQuery({
    queryKey: ["event", event.id, "summary"],
    queryFn: () => summary(event.id),
  });
  const payments = useQuery({
    queryKey: ["event", event.id, "recent", "payment"],
    queryFn: () => list(event.id, "payment"),
  });
  const expenses = useQuery({
    queryKey: ["event", event.id, "recent", "expense"],
    queryFn: () => list(event.id, "expense"),
  });
  return (
    <section className="finance-workspace">
      <WorkspaceHeader
        label="managerLedger"
        hint="financeWorkspaceHint"
        kind="payment"
      />
      <WorkspaceState
        pending={q.isPending || payments.isPending || expenses.isPending}
        error={q.error || payments.error || expenses.error}
        retry={() => {
          void q.refetch();
          void payments.refetch();
          void expenses.refetch();
        }}
      >
        <div className="workspace-metrics">
          <Metric
            label="paymentsTotal"
            value={
              <bdi>
                {q.data?.finance.payments ?? "—"} {q.data?.finance.currency}
              </bdi>
            }
          />
          <Metric
            label="expensesTotal"
            value={
              <bdi>
                {q.data?.finance.expenses ?? "—"} {q.data?.finance.currency}
              </bdi>
            }
          />
          <Metric
            label="unconverted"
            value={q.data?.finance.unconverted ?? "—"}
          />
        </div>
        <p className="notice">{t("financeHint")}</p>
        <div className="profile-grid">
          {(["payment", "expense"] as const).map((kind) => (
            <section className="card" key={kind}>
              <div className="section-heading">
                <h2>
                  {t(kind === "payment" ? "recentPayments" : "recentExpenses")}
                </h2>
                <Link to={`/e/${event.id}/${kind}`}>{t("all")}</Link>
              </div>
              {writable && (
                <Link className="button" to={`/e/${event.id}/${kind}/new`}>
                  {t(kind === "payment" ? "recordPayment" : "recordExpense")}
                </Link>
              )}
              {!(kind === "payment" ? payments.data : expenses.data)?.length ? (
                <WorkspaceEmpty kind={kind} />
              ) : (
                <div className="ledger-list">
                  {(kind === "payment" ? payments.data : expenses.data)
                    ?.slice(0, 8)
                    .map((a) => (
                      <div key={a.id} className="ledger-entry">
                        <div>
                          {kind === "payment" ? (
                            <Link to={`/e/${event.id}/payment/${a.id}`}>
                              {String(a.reference || t("payment"))}
                            </Link>
                          ) : (
                            <RecordLink kind={kind} row={a} />
                          )}
                          <p>
                            <bdi>
                              {formatDate(
                                a.payment_date ?? a.expense_date,
                                locale,
                              )}
                            </bdi>
                          </p>
                          {!!a.reversed_at_utc && <Badge value="reversed" />}
                        </div>
                        <strong>
                          <bdi>
                            {String(a.amount ?? a.original_amount ?? "—")}{" "}
                            {String(a.currency ?? a.original_currency ?? "")}
                          </bdi>
                        </strong>
                      </div>
                    ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </WorkspaceState>
    </section>
  );
}

export default function ManagerWorkspace() {
  const path = useLocation().pathname.split("/").pop();
  return path === "people" ? (
    <PeopleWorkspace />
  ) : path === "travel" ? (
    <TravelWorkspace />
  ) : path === "tasks" ? (
    <WorkBoard key="task" kind="task" />
  ) : path === "issues" ? (
    <WorkBoard key="issue" kind="apartment_issue" />
  ) : (
    <FinanceWorkspace />
  );
}
