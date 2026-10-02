import { z } from "zod";
export type Value = string | number | boolean | null | Record<string, unknown>;
export type Fields = Record<string, Value>;
export const recordSchema = z
  .object({
    id: z.string().uuid(),
    event_id: z.string().uuid(),
    version: z.number().int().positive(),
    is_deleted: z.boolean(),
  })
  .catchall(z.unknown());
export type RecordRow = z.infer<typeof recordSchema>;
export const eventSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hebrew_name: z.string().nullable(),
  year: z.number().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  base_currency: z.string().nullable(),
  lifecycle_stage: z.string(),
  is_deleted: z.boolean(),
  version: z.number(),
  description: z.string().nullable(),
  manager_notes: z.string().nullable(),
  settings: z.record(z.string(), z.unknown()),
});
export type EventRow = z.infer<typeof eventSchema>;
export type Kind =
  | "person"
  | "flight"
  | "flight_passenger"
  | "driver"
  | "vehicle"
  | "trip"
  | "trip_passenger"
  | "apartment"
  | "room"
  | "sleeping_place"
  | "accommodation_assignment"
  | "task"
  | "apartment_issue"
  | "payment"
  | "expense";
export const tables: Record<Kind, string> = {
  person: "people",
  flight: "flights",
  flight_passenger: "flight_passengers",
  driver: "drivers",
  vehicle: "vehicles",
  trip: "trips",
  trip_passenger: "trip_passengers",
  apartment: "apartments",
  room: "rooms",
  sleeping_place: "sleeping_places",
  accommodation_assignment: "accommodation_assignments",
  task: "tasks",
  apartment_issue: "apartment_issues",
  payment: "payments",
  expense: "expenses",
};
export const text = (r: RecordRow | Fields, key: string): string =>
  r[key] == null ? "" : String(r[key]);
export const title = (kind: Kind, r: RecordRow): string => {
  if (kind === "person")
    return [r.first_name, r.last_name].filter(Boolean).join(" ");
  if (kind === "trip")
    return [r.origin, r.destination].filter(Boolean).join(" → ");
  if (
    ["flight_passenger", "trip_passenger", "accommodation_assignment"].includes(
      kind,
    )
  )
    return "";
  return String(
    r.full_name ||
      r.flight_number ||
      r.title ||
      r.name ||
      r.name_or_number ||
      r.label ||
      r.reference ||
      r.description ||
      r.id.slice(0, 8),
  );
};
export function scopedRows(data: unknown, eventId: string): RecordRow[] {
  const rows = z.array(recordSchema).parse(data);
  if (rows.some((r) => r.event_id !== eventId)) throw new Error("scope");
  return rows;
}
