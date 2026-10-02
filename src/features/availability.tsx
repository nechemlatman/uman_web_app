import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEvent } from "../app/event";
import { useI18n, formatDate } from "../i18n/provider";
import { availability } from "../data/repository";
import { Loading, ErrorState, Empty, Badge } from "../components/states";
export default function Availability() {
  const { event, writable } = useEvent();
  const { t, locale } = useI18n();
  const [start, setStart] = useState(event.start_date ?? "");
  const [end, setEnd] = useState(event.end_date ?? "");
  const [only, setOnly] = useState(false);
  const [page, setPage] = useState(0);
  const valid = !!start && !!end && end > start;
  const root = "/e/" + event.id;
  const q = useQuery({
    queryKey: ["event", event.id, "availability", start, end, only, page],
    queryFn: () => availability(event.id, start, end, page, only),
    enabled: valid,
  });
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("stay")}</p>
          <h1>{t("availability")}</h1>
        </div>
        <Link className="button" to={root + "/apartment"}>
          {t("apartments")}
        </Link>
      </div>
      <p className="notice">{t("stayHint")}</p>
      <div className="toolbar card">
        <label>
          {t("checkIn")}
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          {t("checkOut")}
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={only}
            onChange={(e) => {
              setOnly(e.target.checked);
              setPage(0);
            }}
          />
          {t("availableOnly")}
        </label>
      </div>
      {!valid ? (
        <p className="notice">{t("chooseStayDates")}</p>
      ) : q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data?.length ? (
        <Empty />
      ) : (
        <div className="entity-grid">
          {q.data.map((b) => (
            <article className="card bed-card" key={b.id}>
              <p className="eyebrow">
                <Link to={root + "/apartment/" + b.apartment_id}>
                  {b.apartment}
                </Link>{" "}
                · <Link to={root + "/room/" + b.room_id}>{b.room}</Link>
              </p>
              <h2>
                <Link to={root + "/sleeping_place/" + b.id}>
                  {b.label || t("sleepingPlace")}
                </Link>
              </h2>
              <Badge value={b.available ? "AVAILABLE" : "occupied"} />
              {b.occupants.map((o) => (
                <div className="occupant" key={o.assignment_id}>
                  <Link to={root + "/person/" + o.person_id}>{o.name}</Link>
                  <p>
                    {formatDate(o.start_date, locale)} —{" "}
                    {formatDate(o.end_date, locale)}
                  </p>
                  <Link
                    to={root + "/accommodation_assignment/" + o.assignment_id}
                  >
                    {t("details")} · {t(o.status)}
                  </Link>
                </div>
              ))}
              {writable && (
                <Link
                  className="button quiet"
                  to={
                    root +
                    "/accommodation_assignment/new?" +
                    new URLSearchParams({
                      sleeping_place_id: b.id,
                      start_date: start,
                      end_date: end,
                    })
                  }
                >
                  {t("assignBed")}
                </Link>
              )}
            </article>
          ))}
        </div>
      )}
      {valid && (page > 0 || (q.data?.length ?? 0) === 40) && (
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
      )}
    </section>
  );
}
