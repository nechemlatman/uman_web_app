import { useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { catalog, isKind } from "../domain/catalog";
import { title, type Kind, type Fields } from "../domain/model";
import { list, read, PAGE_SIZE } from "../data/repository";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { Loading, Empty, ErrorState } from "../components/states";
import { ColumnValue } from "../components/record-value";
import { Editor } from "./editor";
import { Details } from "./record-details";
import { useDebounced } from "../app/use-debounced";
import { Icon } from "../components/icon";
export function ModuleTabs({ kind }: { kind: Kind }) {
  const { event } = useEvent();
  const { t } = useI18n();
  const group = catalog[kind].group;
  const keys = Object.keys(catalog)
    .filter(isKind)
    .filter(
      (k) =>
        catalog[k].group === group &&
        !["flight_passenger", "trip_passenger"].includes(k),
    );
  return keys.length > 1 ? (
    <nav className="tabs">
      {group === "stay" && (
        <Link to={"/e/" + event.id + "/availability"}>{t("availability")}</Link>
      )}
      {keys.map((k) => (
        <Link
          className={kind === k ? "selected" : ""}
          to={"/e/" + event.id + "/" + k}
          key={k}
        >
          {t(catalog[k].label)}
        </Link>
      ))}
    </nav>
  ) : null;
}
export function Records({
  kind,
  filter,
  compact = false,
}: {
  kind: Kind;
  filter?: { key: string; value: string };
  compact?: boolean;
}) {
  const { event, writable } = useEvent();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [localPage, setLocalPage] = useState(0);
  const [query, setQuery] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [view, setView] = useState("list");
  const [sort, setSort] = useState("newest");
  const [direction, setDirection] = useState("");
  const page = compact
    ? localPage
    : Math.max(0, Number(params.get("page")) || 0);
  const selectedStatus = compact ? "" : params.get("status") || "";
  const setPage = (n: number) =>
    compact
      ? setLocalPage(n)
      : setParams((p) => {
          p.set("page", String(n));
          return p;
        });
  const statusField = catalog[kind].fields.find(
    (f) => f.key === "status" || f.key === "passenger_status",
  );
  const effectiveFilter =
    filter ??
    (selectedStatus && statusField
      ? { key: statusField.key, value: selectedStatus }
      : undefined);
  const settled = useDebounced(query);
  const q = useQuery({
    queryKey: [
      "event",
      event.id,
      "list",
      kind,
      settled,
      page,
      deleted,
      effectiveFilter,
      sort,
      direction,
    ],
    queryFn: () =>
      list(
        event.id,
        kind,
        settled,
        page,
        deleted,
        effectiveFilter,
        sort,
        direction,
      ),
  });
  const data = q.data ?? [];
  const rows = data;
  const root = "/e/" + event.id + "/" + kind;
  const add =
    root +
    "/new" +
    (filter ? "?" + new URLSearchParams({ [filter.key]: filter.value }) : "");
  return (
    <section className={compact ? "related-section" : ""}>
      {!compact && (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{t(catalog[kind].group)}</p>
              <h1>{t(catalog[kind].label)}</h1>
            </div>
            <div className="actions page-actions">
              <button type="button" onClick={() => window.print()}>
                {t("print")}
              </button>
              {writable && (
                <Link className="button primary" to={add}>
                  <Icon name="plus" />
                  {t("add")}
                </Link>
              )}
            </div>
          </div>
          <ModuleTabs kind={kind} />
        </>
      )}
      {compact && (
        <div className="section-heading">
          <h3>{t(catalog[kind].label)}</h3>
          {writable && (
            <Link className="button quiet" to={add}>
              {t("add")}
            </Link>
          )}
        </div>
      )}
      <div className="toolbar">
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label={t("search")}
            placeholder={t("searchHint")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {!compact && ["flight", "trip"].includes(kind) && (
          <select
            aria-label={t("direction")}
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("all")}</option>
            {(kind === "trip"
              ? ["INBOUND", "OUTBOUND", "LOCAL"]
              : ["INBOUND", "OUTBOUND"]
            ).map((d) => (
              <option key={d} value={d}>
                {t(d)}
              </option>
            ))}
          </select>
        )}
        {!compact && statusField && (
          <select
            aria-label={t("status")}
            value={selectedStatus}
            onChange={(e) =>
              setParams((p) => {
                p.set("status", e.target.value);
                p.set("page", "0");
                return p;
              })
            }
          >
            <option value="">{t("allStatuses")}</option>
            {["task", "apartment_issue"].includes(kind) && (
              <option value="OPEN_ITEMS">
                {t(kind === "task" ? "openTasks" : "openIssues")}
              </option>
            )}
            {statusField.options?.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        )}
        {!["payment", "expense"].includes(kind) && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={deleted}
              onChange={(e) => {
                setDeleted(e.target.checked);
                setPage(0);
              }}
            />
            {t("showArchived")}
          </label>
        )}
        {!compact && (
          <>
            {!["payment", "expense"].includes(kind) && (
              <select
                aria-label={t("sort")}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(0);
                }}
              >
                <option value="newest">{t("newest")}</option>
                <option value="name">{t("nameOrder")}</option>
              </select>
            )}
            <button
              aria-pressed={view === "cards"}
              onClick={() => setView(view === "list" ? "cards" : "list")}
            >
              {t(view === "list" ? "cards" : "list")}
            </button>
          </>
        )}
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : !rows.length ? (
        <Empty searched={!!query || !!selectedStatus} />
      ) : view === "cards" ? (
        <div className="entity-grid">
          {rows.map((r) => (
            <article className="card entity-card" key={r.id}>
              <h3>
                <Link to={root + "/" + r.id}>
                  {title(kind, r) || t(catalog[kind].label)}
                </Link>
              </h3>
              {catalog[kind].columns.map((c) => (
                <p key={c}>
                  <ColumnValue kind={kind} column={c} row={r} />
                </p>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("name")}</th>
                {catalog[kind].columns.map((c) => (
                  <th key={c}>
                    {t(
                      catalog[kind].fields.find((f) => f.key === c)?.label ?? c,
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="record-title" to={root + "/" + r.id}>
                      {title(kind, r) || t(catalog[kind].label)}
                    </Link>
                  </td>
                  {catalog[kind].columns.map((c) => (
                    <td
                      key={c}
                      data-label={t(
                        catalog[kind].fields.find((f) => f.key === c)?.label ??
                          c,
                      )}
                    >
                      <ColumnValue kind={kind} column={c} row={r} />
                      {c === catalog[kind].columns[0] &&
                        !!r.reversed_at_utc && (
                          <span className="notice">{t("reversed")}</span>
                        )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 0 || data.length === PAGE_SIZE) && (
        <div className="pagination">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            {t("previous")}
          </button>
          <span>
            {t("page")} {page + 1}
          </span>
          <button
            disabled={data.length < PAGE_SIZE}
            onClick={() => setPage(page + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
    </section>
  );
}
export default function Entity() {
  const { kind: raw = "", id } = useParams();
  const location = useLocation();
  const { event } = useEvent();
  const [params] = useSearchParams();
  const kind = isKind(raw) ? raw : null;
  const q = useQuery({
    queryKey: ["event", event.id, "record", kind, id],
    queryFn: () => read(event.id, kind!, id!),
    enabled: !!kind && !!id && id !== "new",
  });
  if (!kind) return <Empty />;
  if (!id) return <Records kind={kind} />;
  const preset: Fields = {};
  for (const field of catalog[kind].fields)
    if (params.has(field.key)) preset[field.key] = params.get(field.key);
  if (id === "new") return <Editor kind={kind} preset={preset} />;
  if (q.isPending) return <Loading />;
  if (!q.data) return <ErrorState error={q.error} />;
  if (location.pathname.endsWith("/edit"))
    return <Editor kind={kind} row={q.data} />;
  return <Details kind={kind} row={q.data} />;
}
