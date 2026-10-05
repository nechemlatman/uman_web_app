import { Link } from "react-router-dom";
import { useEvent } from "../app/event";
import { useI18n, formatDate } from "../i18n/provider";
import { useWorkspace } from "../data/workspace";
import { type Kind, type RecordRow } from "../domain/model";
import {
  WorkspaceState,
  RecordLink,
  ContextActions,
} from "../components/workspace";
import { Badge } from "../components/states";

export function ParticipantProfile({ person }: { person: RecordRow }) {
  const { event, writable } = useEvent();
  const { t, locale } = useI18n();
  const root = `/e/${event.id}`;
  const q = useWorkspace([
    "flight_passenger",
    "flight",
    "trip_passenger",
    "trip",
    "accommodation_assignment",
    "sleeping_place",
    "room",
    "apartment",
    "payment",
    "task",
  ]);
  const r = q.rows;
  const sections: Array<[Kind, string, string, string]> = [
    ["flight_passenger", "profileTravel", "assignFlight", "person_id"],
    ["trip_passenger", "groundTransport", "assignTransport", "person_id"],
    ["accommodation_assignment", "stay", "assignBed", "person_id"],
    ["payment", "finance", "recordPayment", "person_id"],
    ["task", "tasks", "addTask", "assignee_id"],
  ];
  return (
    <WorkspaceState {...q}>
      <div className="section-heading profile-heading">
        <div>
          <p className="eyebrow">{t("participant360")}</p>
          <h2>{t("operationalOverview")}</h2>
        </div>
        <ContextActions kind="person" row={person} />
      </div>
      <div className="profile-grid">
        {sections.map(([kind, label, action, key]) => {
          const related = (r[kind] ?? []).filter((a) => a[key] === person.id);
          return (
            <section
              className="card profile-section"
              key={kind}
              id={kind === "payment" ? "profile-finance" : undefined}
            >
              <div className="section-heading">
                <h2>
                  {t(label)} <span className="muted">{related.length}</span>
                </h2>
                {writable && !person.is_deleted && (
                  <Link to={`${root}/${kind}/new?${key}=${person.id}`}>
                    {t(action)}
                  </Link>
                )}
              </div>
              {!related.length ? (
                <p className="empty-inline">{t("noRelatedYet")}</p>
              ) : (
                <ol className="profile-records">
                  {related.map((a) => {
                    const flight = r.flight?.find((f) => f.id === a.flight_id),
                      trip = r.trip?.find((f) => f.id === a.trip_id);
                    const bed = r.sleeping_place?.find(
                        (b) => b.id === a.sleeping_place_id,
                      ),
                      room = r.room?.find((b) => b.id === bed?.room_id),
                      apartment = r.apartment?.find(
                        (b) => b.id === room?.apartment_id,
                      );
                    return (
                      <li key={a.id}>
                        <div className="section-heading">
                          {flight ? (
                            <RecordLink kind="flight" row={flight} />
                          ) : trip ? (
                            <RecordLink kind="trip" row={trip} />
                          ) : kind === "task" ? (
                            <RecordLink kind="task" row={a} />
                          ) : (
                            <Link to={`${root}/${kind}/${a.id}`}>
                              {t(kind === "payment" ? "payment" : "assignment")}
                            </Link>
                          )}
                          <Badge
                            value={
                              a.reversed_at_utc
                                ? "reversed"
                                : (a.status ?? a.passenger_status ?? "recorded")
                            }
                          />
                        </div>
                        {flight && (
                          <p>
                            {t(String(flight.direction ?? "notSet"))} ·{" "}
                            <bdi>
                              {String(flight.departure_airport ?? "—")} →{" "}
                              {String(flight.arrival_airport ?? "—")}
                            </bdi>
                            <br />
                            <bdi>
                              {formatDate(
                                flight.scheduled_departure_utc,
                                locale,
                                true,
                              )}
                            </bdi>
                          </p>
                        )}
                        {trip && (
                          <p>
                            <bdi>
                              {String(trip.origin ?? "—")} →{" "}
                              {String(trip.destination ?? "—")}
                            </bdi>
                            <br />
                            <bdi>
                              {formatDate(
                                trip.scheduled_departure_utc,
                                locale,
                                true,
                              )}
                            </bdi>
                          </p>
                        )}
                        {kind === "accommodation_assignment" && (
                          <>
                            <p className="location-chain">
                              <RecordLink kind="apartment" row={apartment} />
                              <span> / </span>
                              <RecordLink kind="room" row={room} />
                              <span> / </span>
                              <RecordLink kind="sleeping_place" row={bed} />
                            </p>
                            <p>
                              <bdi>
                                {formatDate(a.start_date, locale)} —{" "}
                                {formatDate(a.end_date, locale)}
                              </bdi>
                            </p>
                            <p>
                              {t("agreedPrice")}:{" "}
                              <bdi>
                                {String(a.agreed_price ?? "—")}{" "}
                                {event.base_currency}
                              </bdi>
                            </p>
                          </>
                        )}
                        {kind === "payment" && (
                          <p>
                            <strong>
                              <bdi>
                                {String(a.amount ?? "—")}{" "}
                                {String(a.currency ?? "")}
                              </bdi>
                            </strong>{" "}
                            · <bdi>{formatDate(a.payment_date, locale)}</bdi>
                          </p>
                        )}
                        {kind === "task" && (
                          <p>
                            <Badge value={a.priority} /> ·{" "}
                            <bdi>
                              {formatDate(a.due_date_utc, locale, true)}
                            </bdi>
                          </p>
                        )}
                        {(kind === "flight_passenger" ||
                          kind === "trip_passenger") && (
                          <Link to={`${root}/${kind}/${a.id}`}>
                            {t("assignmentDetails")}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              {kind === "payment" && (
                <p className="muted">{t("recordedOnly")}</p>
              )}
            </section>
          );
        })}
        <section className="card">
          <h2>{t("notes")}</h2>
          <p className="wrap profile-notes">
            {String(person.notes || t("noNotes"))}
          </p>
        </section>
      </div>
    </WorkspaceState>
  );
}
