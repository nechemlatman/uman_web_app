import { useState } from "react";
import { useSession } from "../app/session";
import { tables } from "../domain/model";
import { useDebounced } from "../app/use-debounced";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { summary, activity, list, type Summary } from "../data/repository";
import { useEvent } from "../app/event";
import { useI18n, formatDate } from "../i18n/provider";
import { catalog } from "../domain/catalog";
import { title, type Kind } from "../domain/model";
import { Icon } from "../components/icon";
import { Badge, Empty, ErrorState, Loading } from "../components/states";
function auditLabel(table: string) {
  const kind = (Object.keys(tables) as Kind[]).find((k) => tables[k] === table);
  return kind
    ? catalog[kind].label
    : ["Event", "event", "events"].includes(table)
      ? "events"
      : table;
}
export function Activity({ entityId }: { entityId?: string }) {
  const { session } = useSession();
  const { event } = useEvent();
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["event", event.id, "activity", page, entityId],
    queryFn: () => activity(event.id, page, entityId),
  });
  if (q.isPending) return <Loading />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  return (
    <>
      {!q.data?.length ? (
        <p className="muted">{t("emptyActivity")}</p>
      ) : (
        <ol className="activity-list">
          {q.data.map((r) => (
            <li key={r.id}>
              <span className="activity-mark" />
              <div>
                <strong>
                  {t(r.operation)} · {t(auditLabel(r.entity_type))}
                </strong>
                <p>
                  {formatDate(r.timestamp_utc, locale, true)} ·{" "}
                  <span title={r.actor_user_id}>
                    {r.actor_user_id === session?.user.id
                      ? t("you")
                      : t("manager") + " " + r.actor_user_id.slice(0, 8)}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          {t("previous")}
        </button>
        <span>{page + 1}</span>
        <button
          disabled={(q.data?.length ?? 0) < 40}
          onClick={() => setPage(page + 1)}
        >
          {t("next")}
        </button>
      </div>
    </>
  );
}
function AlertList({ data, limit = 100 }: { data: Summary; limit?: number }) {
  const { event } = useEvent();
  const { t } = useI18n();
  const [severity, setSeverity] = useState("");
  const rows = data.alerts
    .filter((a) => !severity || a.severity === severity)
    .slice(0, limit);
  return (
    <>
      {limit > 8 && (
        <select
          aria-label={t("priority")}
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">{t("all")}</option>
          {["CRITICAL", "HIGH", "MEDIUM"].map((s) => (
            <option key={s} value={s}>
              {t(s)}
            </option>
          ))}
        </select>
      )}
      <div className="operational-list">
        {rows.length ? (
          rows.map((a) => (
            <Link
              key={a.id}
              className={"operational-row alert-" + a.severity.toLowerCase()}
              to={"/e/" + event.id + "/" + a.kind + "/" + a.entity_id}
            >
              <span className="row-icon">
                <Icon name="alerts" />
              </span>
              <div>
                <strong>{t(a.rule)}</strong>
                <p>{a.label}</p>
              </div>
              <Badge value={a.severity} />
            </Link>
          ))
        ) : (
          <p className="empty-inline">{t("noAlerts")}</p>
        )}
      </div>
    </>
  );
}
function Schedule({ data, limit = 100 }: { data: Summary; limit?: number }) {
  const { event } = useEvent();
  const { t, locale } = useI18n();
  const [kind, setKind] = useState("");
  const [date, setDate] = useState("");
  const rows = data.schedule
    .filter(
      (s) =>
        (!kind || s.kind === kind) &&
        (!date || (s.civil_date ?? s.at.slice(0, 10)) === date),
    )
    .slice(0, limit);
  const days = [
    ...new Set(rows.map((s) => s.civil_date ?? s.at.slice(0, 10))),
  ].sort();
  return (
    <>
      {limit > 8 && (
        <div className="toolbar">
          <select
            aria-label={t("filter")}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">{t("all")}</option>
            {(
              ["flight", "trip", "task", "accommodation_assignment"] as Kind[]
            ).map((k) => (
              <option key={k} value={k}>
                {t(catalog[k].label)}
              </option>
            ))}
          </select>
          <label>
            {t("date")}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      )}
      {!rows.length ? (
        <p className="empty-inline">{t("nothingScheduled")}</p>
      ) : (
        days.map((day) => (
          <section key={day}>
            {limit > 8 && (
              <h2 className="schedule-day">{formatDate(day, locale)}</h2>
            )}
            <div className="operational-list">
              {rows
                .filter((s) => (s.civil_date ?? s.at.slice(0, 10)) === day)
                .map((s, i) => (
                  <Link
                    className="operational-row"
                    to={"/e/" + event.id + "/" + s.kind + "/" + s.id}
                    key={s.kind + s.id + i}
                  >
                    <span className="row-icon">
                      <Icon name={catalog[s.kind].group} />
                    </span>
                    <div>
                      <strong>{s.label}</strong>
                      <p>
                        {s.milestone && t(s.milestone)} ·{" "}
                        <bdi>
                          {formatDate(
                            s.civil_date ?? s.at,
                            locale,
                            !s.civil_date,
                          )}
                        </bdi>
                      </p>
                    </div>
                    <span className="muted">{t(catalog[s.kind].label)}</span>
                  </Link>
                ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
function Search() {
  const { event } = useEvent();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const settled = useDebounced(query);
  const kinds: Kind[] = [
    "person",
    "flight",
    "apartment",
    "room",
    "driver",
    "vehicle",
    "task",
  ];
  const queries = useQueries({
    queries: kinds.map((kind) => ({
      queryKey: ["event", event.id, "search", kind, settled],
      queryFn: () => list(event.id, kind, settled),
      enabled: settled.trim().length >= 2,
    })),
  });
  return (
    <>
      <label className="search-field global-search">
        <Icon name="search" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("globalSearch")}
          aria-label={t("searchAll")}
        />
      </label>
      {query.length < 2 ? (
        <p className="muted">{t("searchPrompt")}</p>
      ) : (
        queries.map((q, i) => (
          <section key={kinds[i]} className="search-results">
            <h2>{t(catalog[kinds[i]].label)}</h2>
            {q.isPending ? (
              <Loading />
            ) : q.error ? (
              <ErrorState error={q.error} />
            ) : !q.data?.length ? (
              <p className="muted">{t("noMatch")}</p>
            ) : (
              q.data.map((row) => (
                <Link
                  className="search-result"
                  key={row.id}
                  to={"/e/" + event.id + "/" + kinds[i] + "/" + row.id}
                >
                  {title(kinds[i], row)}
                </Link>
              ))
            )}
          </section>
        ))
      )}
    </>
  );
}
export default function Operations() {
  const location = useLocation();
  const { event, writable } = useEvent();
  const { t, locale } = useI18n();
  const root = "/e/" + event.id;
  const section =
    location.pathname.slice(root.length).replace("/", "") || "dashboard";
  const q = useQuery({
    queryKey: ["event", event.id, "summary"],
    queryFn: () => summary(event.id),
    enabled: !["activity", "search"].includes(section),
  });
  if (section === "activity")
    return (
      <section>
        <h1>{t("activity")}</h1>
        <div className="card">
          <Activity />
        </div>
      </section>
    );
  if (section === "search")
    return (
      <section>
        <h1>{t("searchAll")}</h1>
        <Search />
      </section>
    );
  if (q.isPending) return <Loading />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <Empty />;
  const data = q.data;
  if (section === "alerts")
    return (
      <section>
        <h1>{t("alerts")}</h1>
        <div className="card">
          <AlertList data={data} />
          {data.alerts.length === 100 && (
            <p className="notice">{t("limitedResults")}</p>
          )}
        </div>
      </section>
    );
  if (section === "schedule")
    return (
      <section>
        <h1>{t("schedule")}</h1>
        <p className="notice">{t("utcHint")}</p>
        <div className="card">
          <Schedule data={data} />
          {data.schedule.length === 100 && (
            <p className="notice">{t("limitedResults")}</p>
          )}
        </div>
      </section>
    );
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Kyiv",
  });
  const days = event.start_date
    ? Math.ceil(
        (Date.parse(event.start_date + "T00:00:00Z") -
          Date.parse(today + "T00:00:00Z")) /
          86400000,
      )
    : null;
  return (
    <section className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("location")}</p>
          <h1>{t("dashboard")}</h1>
        </div>
        <span className="muted">{formatDate(today, locale)}</span>
      </div>
      <section className="event-banner">
        <div>
          <p className="eyebrow">UMAN · {event.year ?? ""}</p>
          <h2>
            {locale === "he" && event.hebrew_name
              ? event.hebrew_name
              : event.name}
          </h2>
          <p>
            {formatDate(event.start_date, locale)} —{" "}
            {formatDate(event.end_date, locale)}
          </p>
          <Badge value={event.lifecycle_stage} />
        </div>
        <div className="countdown">
          {days !== null && days > 0 ? (
            <>
              <strong>{days}</strong>
              <span>{t("days")}</span>
            </>
          ) : (
            <span>
              {t(
                days === null
                  ? "notSet"
                  : event.end_date && today > event.end_date
                    ? "eventEnded"
                    : "inProgress",
              )}
            </span>
          )}
          <span className="banner-rule" />
        </div>
      </section>
      <div className="stat-grid">
        {[
          ["people", "participants", "person", "people"],
          ["assignments", "bedAssignments", "availability", "stay"],
          ["tasks", "openTasks", "task", "operations"],
          ["issues", "openIssues", "apartment_issue", "alerts"],
        ].map(([key, label, kind, icon]) => (
          <Link
            className="stat-card"
            key={key}
            to={
              root +
              "/" +
              kind +
              (kind === "task" || kind === "apartment_issue"
                ? "?status=OPEN_ITEMS"
                : kind === "person"
                  ? "?status=ACTIVE"
                  : "")
            }
          >
            <span className="stat-top">
              <Icon name={icon} />
              <Icon name="arrow" size={16} />
            </span>
            <strong>{data.counts[key] ?? "—"}</strong>
            <span>{t(label)}</span>
          </Link>
        ))}
      </div>
      {writable && (
        <section>
          <div className="section-heading">
            <h2>{t("quickActions")}</h2>
          </div>
          <div className="quick-grid">
            {[
              ["person", "addPerson", "people"],
              ["accommodation_assignment", "assignBed", "stay"],
              ["task", "addTask", "operations"],
              ["payment", "recordPayment", "finance"],
            ].map(([kind, label, icon]) => (
              <Link
                className="quick-action"
                key={kind}
                to={root + "/" + kind + "/new"}
              >
                <Icon name={icon} />
                <span>{t(label)}</span>
                <Icon name="plus" size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="dashboard-columns">
        <section className="card">
          <div className="section-heading">
            <h2>{t("alerts")}</h2>
            <Link to={root + "/alerts"}>{t("all")}</Link>
          </div>
          <AlertList data={data} limit={5} />
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>{t("nextUp")}</h2>
            <Link to={root + "/schedule"}>{t("all")}</Link>
          </div>
          <Schedule data={data} limit={5} />
        </section>
      </div>
      <div className="dashboard-columns">
        <section className="card">
          <div className="section-heading">
            <h2>{t("finance")}</h2>
            <Link to={root + "/payment"}>{t("review")}</Link>
          </div>
          <div className="finance-totals">
            <div>
              <span>{t("paymentsTotal")}</span>
              <strong>
                <bdi>
                  {data.finance.payments ?? "—"} {data.finance.currency}
                </bdi>
              </strong>
            </div>
            <div>
              <span>{t("expensesTotal")}</span>
              <strong>
                <bdi>
                  {data.finance.expenses ?? "—"} {data.finance.currency}
                </bdi>
              </strong>
            </div>
          </div>
          <p className="muted">{t("financeHint")}</p>
          {data.finance.unconverted > 0 && (
            <p className="notice warning">
              {data.finance.unconverted} · {t("unconverted")}
            </p>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>{t("activity")}</h2>
            <Link to={root + "/activity"}>{t("all")}</Link>
          </div>
          <Activity />
        </section>
      </div>
    </section>
  );
}
