import { validStayPrice } from "./stay";
import type { Fields, Kind } from "./model";
export function civilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function overlaps(a: string, b: string, c: string, d: string) {
  return a < d && c < b;
}
export function validate(kind: Kind, f: Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["listed_price", "agreed_price"])
    if (f[key] != null && f[key] !== "" && !validStayPrice(String(f[key])))
      errors[key] = "stayPriceInvalid";
  const require = (k: string) => {
    if (f[k] == null || String(f[k]).trim() === "") errors[k] = "required";
  };
  const identity: Partial<Record<Kind, string>> = {
    person: "first_name",
    driver: "full_name",
    vehicle: "name",
    apartment: "name",
    room: "name_or_number",
    task: "title",
    apartment_issue: "title",
  };
  if (identity[kind]) require(identity[kind]!);
  for (const [k, v] of Object.entries(f)) {
    if (
      typeof v === "string" &&
      v.length >
        (k.includes("notes") || k === "description"
          ? 10000
          : k.includes("location") || k.includes("address")
            ? 500
            : 320)
    )
      errors[k] = "tooLong";
    if (
      v &&
      [
        "start_date",
        "end_date",
        "passport_expiration_date",
        "date_of_birth",
        "payment_date",
        "expense_date",
      ].includes(k) &&
      !civilDate(String(v))
    )
      errors[k] = "dateInvalid";
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email)))
    errors.email = "emailInvalid";
  if (f.start_date && f.end_date && String(f.start_date) >= String(f.end_date))
    errors.end_date = "dateOrder";
  if (
    f.scheduled_departure_utc &&
    f.scheduled_arrival_utc &&
    String(f.scheduled_departure_utc) >= String(f.scheduled_arrival_utc)
  )
    errors.scheduled_arrival_utc = "dateOrder";
  if (
    kind === "vehicle" &&
    (!Number.isInteger(Number(f.capacity)) || Number(f.capacity) < 1)
  )
    errors.capacity = "positive";
  if (
    f.is_locked &&
    !String(f.notes || "").trim() &&
    kind === "accommodation_assignment"
  )
    errors.notes = "required";
  if (
    kind === "flight" &&
    ["SCHEDULED", "DELAYED", "DIVERTED", "LANDED"].includes(String(f.status))
  )
    [
      "airline",
      "flight_number",
      "departure_airport",
      "arrival_airport",
      "scheduled_departure_utc",
      "scheduled_arrival_utc",
    ].forEach(require);
  if (
    kind === "trip" &&
    ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(String(f.status))
  )
    [
      "origin",
      "destination",
      "scheduled_departure_utc",
      "scheduled_arrival_utc",
    ].forEach(require);
  if (kind === "sleeping_place" && f.is_active) {
    ["room_id", "type"].forEach(require);
    if (f.type === "CUSTOM") require("custom_type_name");
  }
  if (
    kind === "accommodation_assignment" &&
    ["ACTIVE", "TEMPORARY"].includes(String(f.status))
  )
    ["person_id", "sleeping_place_id", "start_date", "end_date"].forEach(
      require,
    );
  if (kind === "flight_passenger") ["flight_id", "person_id"].forEach(require);
  if (kind === "trip_passenger") ["trip_id", "person_id"].forEach(require);
  if (kind === "apartment_issue") require("apartment_id");
  if (kind === "payment" || kind === "expense") {
    const amount = kind === "payment" ? "amount" : "original_amount";
    require(amount);
    require(kind === "payment" ? "currency" : "original_currency");
    require(kind === "payment" ? "payment_date" : "expense_date");
    if (kind === "payment") require("person_id");
    else require("description");
    if (f[amount] && !/^\d+(\.\d{1,4})?$/.test(String(f[amount])))
      errors[amount] = "positive";
    if (f[amount] && Number(f[amount]) <= 0) errors[amount] = "positive";
    if (
      f.exchange_rate &&
      (!/^\d+(\.\d{1,10})?$/.test(String(f.exchange_rate)) ||
        Number(f.exchange_rate) <= 0)
    )
      errors.exchange_rate = "positive";
  }
  return errors;
}
export function errorCode(error: unknown): string {
  const e = error as { code?: string; message?: string; status?: number };
  if (e?.code === "40001") return "conflict";
  if (e?.code === "42501" || e?.status === 401 || e?.status === 403)
    return "forbidden";
  if (e?.code === "23505") return "duplicate";
  if (
    e?.code?.startsWith("22") ||
    e?.code === "23514" ||
    e?.code === "23503" ||
    e?.code === "23502"
  )
    return "invalid";
  if (e?.code === "PGRST202" || e?.code === "42P01") return "unavailable";
  if (
    e?.message?.includes("fetch") ||
    e?.message?.includes("network") ||
    e?.message?.includes("Network")
  )
    return "network";
  return "unknown";
}
