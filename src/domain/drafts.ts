import type { Kind, Fields } from "./model";
export const meaningful = (f: Record<string, unknown>, keys: string[]) =>
  keys.some((k) => String(f[k] ?? "").trim().length > 0);
export const personIdentity = [
  "first_name",
  "last_name",
  "hebrew_first_name",
  "hebrew_last_name",
  "phone",
  "whatsapp_phone",
  "email",
  "passport_name",
  "notes",
];
export const captureIdentity: Partial<Record<Kind, string[]>> = {
  person: personIdentity,
  driver: [
    "full_name",
    "phone_number",
    "whatsapp_phone",
    "license_number",
    "notes",
  ],
  vehicle: ["name", "license_plate", "notes"],
  task: ["title", "description", "notes"],
  apartment_issue: ["title", "description", "notes"],
};
export function operationalMissing(
  kind: Kind,
  f: Record<string, unknown>,
): string[] {
  const fields: Partial<Record<Kind, string[]>> = {
    flight: [
      "airline",
      "flight_number",
      "departure_airport",
      "arrival_airport",
      "scheduled_departure_utc",
      "scheduled_arrival_utc",
    ],
    trip: [
      "origin",
      "destination",
      "scheduled_departure_utc",
      "scheduled_arrival_utc",
    ],
    driver: ["full_name"],
    vehicle: ["name", "capacity"],
    room: ["apartment_id"],
    sleeping_place: [
      "room_id",
      "type",
      ...(f.type === "CUSTOM" ? ["custom_type_name"] : []),
    ],
    accommodation_assignment: [
      "person_id",
      "sleeping_place_id",
      "start_date",
      "end_date",
    ],
    apartment_issue: ["apartment_id"],
  };
  return (fields[kind] ?? []).filter((k) => !meaningful(f, [k]));
}
export function isOperational(kind: Kind, f: Fields): boolean {
  if (kind === "flight")
    return ["SCHEDULED", "DELAYED", "DIVERTED", "LANDED"].includes(
      String(f.status),
    );
  if (kind === "trip")
    return ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(String(f.status));
  if (kind === "driver")
    return ["AVAILABLE", "BUSY"].includes(String(f.status));
  if (kind === "vehicle")
    return ["AVAILABLE", "IN_USE"].includes(String(f.status));
  if (kind === "sleeping_place") return f.is_active === true;
  if (kind === "accommodation_assignment")
    return ["ACTIVE", "TEMPORARY"].includes(String(f.status));
  if (kind === "apartment_issue") return f.status !== "OPEN";
  return false;
}
