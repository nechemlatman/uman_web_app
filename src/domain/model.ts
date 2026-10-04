import { en, he, type MessageKey } from "../i18n/messages";
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
export const title = (kind: Kind, r: RecordRow, locale = "en"): string => {
  const clean = (v: unknown) => String(v ?? "").trim();
  const join = (keys: string[], sep = " ") =>
    keys
      .map((k) => clean(r[k]))
      .filter(Boolean)
      .join(sep);
  const first = (keys: string[]) =>
    keys.map((k) => clean(r[k])).find(Boolean) ?? "";
  const fallback: Partial<Record<Kind, string>> = {
    person: "unnamedPerson",
    flight: "untitledFlight",
    driver: "unnamedDriver",
    vehicle: "unnamedVehicle",
    trip: "untitledTrip",
    apartment: "untitledApartment",
    room: "unnamedRoom",
    sleeping_place: "unnumberedBed",
    task: "untitledTask",
    apartment_issue: "untitledIssue",
    accommodation_assignment: "assignments",
    flight_passenger: "flightPassengers",
    trip_passenger: "tripPassengers",
  };
  let value = "";
  if (kind === "person")
    value =
      (locale === "he"
        ? join(["hebrew_first_name", "hebrew_last_name"])
        : join(["first_name", "last_name"])) ||
      join(["first_name", "last_name"]) ||
      join(["hebrew_first_name", "hebrew_last_name"]) ||
      first([
        "phone",
        "whatsapp_phone",
        "email",
        "passport_name",
        "display_label",
      ]);
  else if (kind === "sleeping_place")
    value = join(["bed_code", "label"], " · ");
  else if (kind === "trip")
    value = join(["origin", "destination"], " → ") || first(["notes"]);
  else if (kind === "driver")
    value = first([
      "full_name",
      "phone_number",
      "whatsapp_phone",
      "license_number",
      "notes",
    ]);
  else if (kind === "vehicle")
    value = first(["name", "license_plate", "notes"]);
  else if (kind === "flight")
    value =
      first(["flight_number", "airline"]) ||
      join(["departure_airport", "arrival_airport"], " → ") ||
      first(["notes"]);
  else
    value = first([
      "title",
      "name",
      "name_or_number",
      "label",
      "reference",
      "description",
      "address",
      "notes",
    ]);
  const key = fallback[kind] as MessageKey;
  return value
    ? value.slice(0, 160)
    : ((locale === "he" ? he : en)[key] ?? r.id.slice(0, 8));
};
export function scopedRows(data: unknown, eventId: string): RecordRow[] {
  const rows = z.array(recordSchema).parse(data);
  if (rows.some((r) => r.event_id !== eventId)) throw new Error("scope");
  return rows;
}
