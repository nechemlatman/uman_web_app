import { z } from "zod";
import { backend } from "./client";
import {
  eventSchema,
  recordSchema,
  scopedRows,
  tables,
  type Kind,
  type RecordRow,
  type Fields,
} from "../domain/model";
export const PAGE_SIZE = 40;
export async function rpc<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await backend().rpc(name, params);
  if (error) throw error;
  return data as T;
}
export async function events() {
  const { data, error } = await backend()
    .from("events")
    .select(
      "id,name,hebrew_name,year,start_date,end_date,base_currency,lifecycle_stage,is_deleted,version,description,manager_notes,settings",
    )
    .eq("is_deleted", false)
    .order("created_at_utc", { ascending: false })
    .limit(100);
  if (error) throw error;
  return z.array(eventSchema).parse(data);
}
const searchColumns: Partial<Record<Kind, string[]>> = {
  person: [
    "first_name",
    "last_name",
    "hebrew_first_name",
    "hebrew_last_name",
    "phone",
  ],
  flight: ["flight_number", "airline", "departure_airport", "arrival_airport"],
  driver: ["full_name", "phone_number"],
  vehicle: ["name", "license_plate"],
  trip: ["origin", "destination"],
  apartment: ["name", "address"],
  room: ["name_or_number"],
  sleeping_place: ["label"],
  task: ["title"],
  apartment_issue: ["title"],
  payment: ["reference"],
  expense: ["description"],
};
export async function list(
  eventId: string,
  kind: Kind,
  query = "",
  page = 0,
  deleted = false,
  filter?: { key: string; value: string },
  sort = "newest",
  direction = "",
) {
  if (kind === "payment" || kind === "expense")
    return scopedRows(
      await rpc("web_ledger", {
        p_event_id: eventId,
        p_kind: kind,
        p_query: query,
        p_offset: page * PAGE_SIZE,
        p_person_id: filter?.value ?? null,
      }),
      eventId,
    );
  let q = backend()
    .from(tables[kind])
    .select(kind === "apartment" ? "*,total_cost::text" : "*")
    .eq("event_id", eventId)
    .eq("is_deleted", deleted);
  if (filter)
    q =
      filter.value === "OPEN_ITEMS" && filter.key === "status"
        ? q.not(
            "status",
            "in",
            kind === "task" ? "(COMPLETED,CANCELLED)" : "(RESOLVED,CLOSED)",
          )
        : q.eq(filter.key, filter.value);
  if (
    ["flight", "trip"].includes(kind) &&
    ["INBOUND", "OUTBOUND", "LOCAL"].includes(direction)
  )
    q = q.eq("direction", direction);
  const cleaned = query.replace(/[%_\\,()."]/g, "").trim();
  if (cleaned && searchColumns[kind])
    q = q.or(
      searchColumns[kind]!.map((c) => c + ".ilike.%" + cleaned + "%").join(","),
    );
  const sortColumn =
    sort === "name"
      ? (searchColumns[kind]?.[0] ?? "created_at_utc")
      : "created_at_utc";
  const { data, error } = await q
    .order(sortColumn, { ascending: sort === "name" })
    .order("id")
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw error;
  return scopedRows(data, eventId);
}
export async function lookup(eventId: string, kind: Kind, id: string) {
  const { data, error } = await backend()
    .from(tables[kind])
    .select(
      kind === "person"
        ? "id,event_id,version,is_deleted,first_name,last_name"
        : "*",
    )
    .eq("event_id", eventId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return scopedRows([data], eventId)[0];
}
export async function read(eventId: string, kind: Kind, id: string) {
  if (kind === "person" || kind === "trip") {
    const row = recordSchema.parse(
      await rpc("read_" + kind, { p_event_id: eventId, p_id: id }),
    );
    if (row.event_id !== eventId) throw new Error("scope");
    return row;
  }
  if (kind === "payment" || kind === "expense") {
    const rows = scopedRows(
      await rpc("web_ledger", { p_event_id: eventId, p_kind: kind, p_id: id }),
      eventId,
    );
    if (!rows[0]) throw { code: "42501" };
    return rows[0];
  }
  const { data, error } = await backend()
    .from(tables[kind])
    .select(kind === "apartment" ? "*,total_cost::text" : "*")
    .eq("event_id", eventId)
    .eq("id", id)
    .single();
  if (error) throw error;
  const row = recordSchema.parse(data);
  if (row.event_id !== eventId) throw new Error("scope");
  return row;
}
export async function save(
  eventId: string,
  kind: Kind,
  fields: Fields,
  requestId: string,
  base?: RecordRow,
) {
  if (base && base.event_id !== eventId) throw new Error("scope");
  return rpc<string>("save_" + kind, {
    p_event_id: eventId,
    p_request_id: requestId,
    p_id: base?.id ?? null,
    p_expected_version: base?.version ?? null,
    p_fields: fields,
  });
}
export async function lifecycle(
  eventId: string,
  kind: Kind,
  row: RecordRow,
  deleted: boolean,
) {
  if (row.event_id !== eventId) throw new Error("scope");
  const params: Record<string, unknown> = {
    p_event_id: eventId,
    p_id: row.id,
    p_expected_version: row.version,
  };
  let name = (deleted ? "delete_" : "restore_") + kind;
  if (
    [
      "person",
      "flight",
      "flight_passenger",
      "task",
      "apartment_issue",
    ].includes(kind)
  ) {
    name = "set_" + kind + "_deleted";
    params.p_deleted = deleted;
  }
  return rpc(name, params);
}
export async function summary(eventId: string) {
  return rpc<Summary>("web_command_center", { p_event_id: eventId });
}
export interface Summary {
  counts: Record<string, number>;
  schedule: Array<{
    kind: Kind;
    id: string;
    label: string;
    at: string;
    civil_date?: string | null;
    milestone?: string;
  }>;
  alerts: Array<{
    id: string;
    rule: string;
    kind: Kind;
    entity_id: string;
    label: string;
    severity: string;
  }>;
  finance: {
    payments: string | null;
    expenses: string | null;
    currency: string | null;
    unconverted: number;
  };
}
export async function activity(eventId: string, page = 0, entityId?: string) {
  let q = backend()
    .from("audit_entries")
    .select("id,entity_type,entity_id,operation,timestamp_utc,actor_user_id")
    .eq("event_id", eventId);
  if (entityId) q = q.eq("entity_id", entityId);
  const { data, error } = await q
    .order("timestamp_utc", { ascending: false })
    .order("id")
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (error) throw error;
  return data as Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    timestamp_utc: string;
    actor_user_id: string;
  }>;
}

export interface AvailableBed {
  id: string;
  label: string | null;
  room_id: string;
  room: string;
  apartment_id: string;
  apartment: string;
  available: boolean;
  occupants: Array<{
    assignment_id: string;
    person_id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
  }>;
}
export function availability(
  eventId: string,
  start: string,
  end: string,
  page: number,
  availableOnly: boolean,
) {
  return rpc<AvailableBed[]>("web_availability", {
    p_event_id: eventId,
    p_start: start,
    p_end: end,
    p_offset: page * PAGE_SIZE,
    p_available_only: availableOnly,
  });
}
