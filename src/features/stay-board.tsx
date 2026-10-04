import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { readStay, save } from "../data/repository";
import { boardBeds, staySummary, type BoardBed } from "../domain/stay";
import { encodeFields, initialFields } from "../domain/catalog";
import type { Kind, RecordRow } from "../domain/model";
import { Badge, Empty, ErrorState, Loading } from "../components/states";
import { BulkBeds, MoveStay } from "./stay-actions";

function Totals({ beds }: { beds: BoardBed[] }) {
  const { t } = useI18n(),
    { event } = useEvent(),
    s = staySummary(beds);
  return (
    <dl className="stay-totals">
      {(
        [
          ["totalBeds", s.total],
          ["occupied", s.occupied],
          ["available", s.available],
          ["reserved", s.reserved],
          ["inactive", s.inactive],
        ] as const
      ).map(([key, value]) => (
        <div key={key}>
          <dt>{t(key)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {(
        [
          ["listedTotal", s.listed],
          ["agreedTotal", s.agreed],
        ] as const
      ).map(([key, value]) => (
        <div key={key}>
          <dt>{t(key)}</dt>
          <dd>
            <bdi>
              {value.total ?? "—"} {event.base_currency}
            </bdi>
            {value.missing > 0 && (
              <small>
                {value.missing} {t("pricesMissing")}
              </small>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function StayBoard({
  apartmentId,
  roomId,
}: {
  apartmentId?: string;
  roomId?: string;
}) {
  const { event, writable } = useEvent(),
    { t } = useI18n(),
    qc = useQueryClient();
  const [query, setQuery] = useState(""),
    [state, setState] = useState("all"),
    [apartment, setApartment] = useState(apartmentId ?? "");
  const [bulk, setBulk] = useState<string>(),
    [move, setMove] = useState<RecordRow>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const root = "/e/" + event.id;
  const q = useQuery({
    queryKey: ["event", event.id, "stay-board"],
    queryFn: () => readStay(event.id),
  });
  const canWrite = writable && !q.error;
  async function change(
    kind: Kind,
    row: RecordRow,
    fields: Record<string, boolean | string>,
  ) {
    if (!canWrite || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await save(
        event.id,
        kind,
        { ...encodeFields(kind, initialFields(kind, row), row), ...fields },
        crypto.randomUUID(),
        row,
      );
      await qc.invalidateQueries({ queryKey: ["event", event.id] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  if (q.isPending) return <Loading />;
  if (!q.data)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const data = q.data;
  const apartments = data.apartments.filter(
    (a) => !a.is_deleted && (!apartment || a.id === apartment),
  );
  const rooms = data.rooms.filter(
    (r) =>
      !r.is_deleted &&
      (!roomId || r.id === roomId) &&
      (!apartment || r.apartment_id === apartment) &&
      (!r.apartment_id || apartments.some((a) => a.id === r.apartment_id)),
  );
  const allBeds = boardBeds(data).filter(
    (b) =>
      rooms.some((r) => r.id === b.row.room_id) ||
      (!apartment && !roomId && !b.row.room_id),
  );
  const person = (id: unknown) =>
    data.people.find((p) => p.id === id)?.label ?? t("notSet");
  const match = (b: BoardBed) =>
    (state === "all" || b.state === state) &&
    [
      b.row.bed_code,
      b.row.label,
      ...b.assignments.map((a) => person(a.person_id)),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase());
  const renderRoom = (room: RecordRow | null) => {
    const beds = allBeds.filter((b) =>
        room ? b.row.room_id === room.id : !b.row.room_id,
      ),
      visible = beds.filter(match);
    if ((query || state !== "all") && !visible.length) return null;
    return (
      <section
        className="card stay-room"
        key={room?.id ?? "unplaced"}
        aria-label={String(room?.name_or_number ?? t("unplacedBeds"))}
      >
        <div className="section-heading">
          <h3>
            {room ? (
              <Link to={root + "/room/" + room.id}>
                {String(room.name_or_number)}
              </Link>
            ) : (
              t("unplacedBeds")
            )}
          </h3>
          {room && canWrite && (
            <div className="actions">
              <Link
                className="button"
                to={root + "/sleeping_place/new?room_id=" + room.id}
              >
                {t("addBed")}
              </Link>
              <button
                disabled={!!bulk || !!move}
                onClick={() => setBulk(room.id)}
              >
                {t("bulkBeds")}
              </button>
            </div>
          )}
        </div>
        <Totals beds={beds} />
        {!visible.length ? (
          <p>{t("noBeds")}</p>
        ) : (
          <div className="stay-bed-grid">
            {visible.map((b) => (
              <article className={"stay-bed state-" + b.state} key={b.row.id}>
                <div className="section-heading">
                  <h4>
                    <Link to={root + "/sleeping_place/" + b.row.id}>
                      {t("bed")}{" "}
                      {String(b.row.bed_code ?? b.row.id.slice(0, 8))}
                    </Link>
                  </h4>
                  <Badge value={b.state} />
                </div>
                {!!b.row.label && <p className="wrap">{String(b.row.label)}</p>}
                <p>
                  {t("listedPrice")}:{" "}
                  <bdi>
                    {String(b.row.listed_price ?? "—")} {event.base_currency}
                  </bdi>
                </p>
                {b.assignments.length > 1 && (
                  <p className="notice warning">{t("multipleStays")}</p>
                )}
                {b.assignments.map((a) => (
                  <div className="stay-occupant" key={a.id}>
                    {a.person_id ? (
                      <Link to={root + "/person/" + a.person_id}>
                        {person(a.person_id)}
                      </Link>
                    ) : (
                      <span>{t("notSet")}</span>
                    )}{" "}
                    <Badge value={a.status} />
                    <p>
                      {t("agreedPrice")}:{" "}
                      <bdi>
                        {String(a.agreed_price ?? "—")} {event.base_currency}
                      </bdi>
                    </p>
                    <Link to={root + "/accommodation_assignment/" + a.id}>
                      {t("details")}
                    </Link>
                    {canWrite && (
                      <div className="actions">
                        <Link
                          to={
                            root + "/accommodation_assignment/" + a.id + "/edit"
                          }
                        >
                          {t("editAssignment")}
                        </Link>
                        <button
                          disabled={pending || !!move || !!bulk}
                          onClick={() => setMove(a)}
                        >
                          {t("moveStay")}
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(t("cancelStayConfirm")))
                              void change("accommodation_assignment", a, {
                                status: "CANCELLED",
                              });
                          }}
                        >
                          {t("cancelStay")}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {canWrite && (
                  <div className="actions">
                    <Link
                      className="button"
                      to={
                        root +
                        "/accommodation_assignment/new?sleeping_place_id=" +
                        b.row.id
                      }
                    >
                      {t("assignBed")}
                    </Link>
                    <Link to={root + "/sleeping_place/" + b.row.id + "/edit"}>
                      {t("editBed")}
                    </Link>
                    <button
                      disabled={pending}
                      onClick={() =>
                        void change("sleeping_place", b.row, {
                          is_active: !b.row.is_active,
                        })
                      }
                    >
                      {t(b.row.is_active ? "deactivateBed" : "activateBed")}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    );
  };
  return (
    <section className="stay-board">
      <div className="section-heading">
        <h2>{t("bedBoard")}</h2>
        {canWrite && (
          <Link
            className="button"
            to={
              root +
              "/room/new" +
              (apartment ? "?apartment_id=" + apartment : "")
            }
          >
            {t("addRoom")}
          </Link>
        )}
      </div>
      <p className="notice">
        {t("wholeEventStay")} {t("stayPricingHint")}
      </p>
      <Totals beds={allBeds} />
      <div className="toolbar">
        <label>
          {t("search")}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchBeds")}
          />
        </label>
        <label>
          {t("status")}
          <select value={state} onChange={(e) => setState(e.target.value)}>
            {["all", "available", "occupied", "reserved", "inactive"].map(
              (s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ),
            )}
          </select>
        </label>
        {!apartmentId && !roomId && (
          <label>
            {t("apartment")}
            <select
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
            >
              <option value="">{t("all")}</option>
              {data.apartments
                .filter((a) => !a.is_deleted)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {String(a.name)}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {!!q.error && (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      )}
      {!!error && <ErrorState error={error} />}{" "}
      {bulk && (
        <BulkBeds
          disabled={!canWrite}
          roomId={bulk}
          onClose={() => setBulk(undefined)}
        />
      )}
      {move && (
        <MoveStay
          disabled={!canWrite}
          row={move}
          onClose={() => setMove(undefined)}
        />
      )}
      {apartments
        .filter((a) => !roomId || rooms.some((r) => r.apartment_id === a.id))
        .map((a) => (
          <section className="stay-apartment" key={a.id}>
            <div className="section-heading">
              <h2>
                <Link to={root + "/apartment/" + a.id}>{String(a.name)}</Link>
              </h2>
              {canWrite && (
                <Link to={root + "/room/new?apartment_id=" + a.id}>
                  {t("addRoom")}
                </Link>
              )}
            </div>
            <Totals
              beds={allBeds.filter((b) =>
                rooms.some(
                  (r) => r.id === b.row.room_id && r.apartment_id === a.id,
                ),
              )}
            />
            {rooms.filter((r) => r.apartment_id === a.id).map(renderRoom)}
          </section>
        ))}
      {rooms.filter((r) => !r.apartment_id).map(renderRoom)}
      {!roomId &&
        !apartment &&
        allBeds.some((b) => !b.row.room_id) &&
        renderRoom(null)}
      {!apartments.length && !rooms.length && !allBeds.length && <Empty />}
    </section>
  );
}
