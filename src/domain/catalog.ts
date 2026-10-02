import type { Kind, Fields, RecordRow } from "./model";
export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "tel"
    | "date"
    | "datetime-local"
    | "number"
    | "decimal"
    | "textarea"
    | "select"
    | "checkbox";
  options?: string[];
  relation?: Kind;
  required?: boolean;
  default?: string | boolean | number;
  section?: string;
  max?: number;
}
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
const status = (options: string[], value = options[0]) =>
  f("status", "status", "select", { options, default: value });
const notes = f("notes", "notes", "textarea", { max: 10000, section: "notes" });
const lock = f("is_locked", "locked", "checkbox", { default: false });
const ref = (key: string, label: string, relation: Kind, required = false) =>
  f(key, label, "select", { relation, required });
const directions = ["INBOUND", "OUTBOUND"];
const schedule = [
  f("scheduled_departure_utc", "departure", "datetime-local", {
    section: "schedule",
  }),
  f("scheduled_arrival_utc", "arrival", "datetime-local"),
  f("actual_departure_utc", "actualDeparture", "datetime-local"),
  f("actual_arrival_utc", "actualArrival", "datetime-local"),
];
const money = [
  f("exchange_rate", "exchangeRate", "decimal"),
  f("exchange_rate_timestamp_utc", "rateDate", "datetime-local"),
  notes,
];
export const catalog: Record<
  Kind,
  { label: string; fields: Field[]; columns: string[]; group: string }
> = {
  person: {
    label: "people",
    group: "people",
    columns: ["phone", "status"],
    fields: [
      f("first_name", "firstName", "text", {
        required: true,
        section: "identity",
      }),
      f("last_name", "lastName", "text", { default: "" }),
      f("hebrew_first_name", "hebrewFirst"),
      f("hebrew_last_name", "hebrewLast"),
      status(["ACTIVE", "INACTIVE"]),
      f("phone", "phone", "tel", { default: "", section: "contact" }),
      f("whatsapp_phone", "whatsapp", "tel"),
      f("email", "email", "email"),
      f("passport_name", "passportName", "text", { section: "travel" }),
      f("passport_number", "passportNumber"),
      f("passport_expiration_date", "passportExpiry", "date"),
      f("date_of_birth", "birthDate", "date"),
      f("nationality", "nationality"),
      f("emergency_contact_name", "emergencyName", "text", {
        section: "contact",
      }),
      f("emergency_contact_phone", "emergencyPhone", "tel"),
      notes,
    ],
  },
  flight: {
    label: "flights",
    group: "travel",
    columns: [
      "direction",
      "departure_airport",
      "arrival_airport",
      "scheduled_departure_utc",
      "status",
    ],
    fields: [
      f("direction", "direction", "select", {
        options: directions,
        default: "INBOUND",
        section: "identity",
      }),
      f("airline", "airline"),
      f("flight_number", "flightNumber"),
      f("departure_airport", "departureAirport"),
      f("arrival_airport", "arrivalAirport"),
      ...schedule,
      status([
        "DRAFT",
        "SCHEDULED",
        "DELAYED",
        "CANCELLED",
        "DIVERTED",
        "LANDED",
        "UNKNOWN",
      ]),
      f("delay_minutes", "delayMinutes", "number"),
      f("terminal", "terminal"),
      f("gate", "gate"),
      lock,
      notes,
    ],
  },
  flight_passenger: {
    label: "flightPassengers",
    group: "travel",
    columns: ["person_id", "status", "seat_number"],
    fields: [
      ref("flight_id", "flight", "flight", true),
      ref("person_id", "person", "person", true),
      status(["CONFIRMED", "TENTATIVE", "CANCELLED"]),
      f("seat_number", "seat"),
      f("booking_reference", "booking"),
      notes,
    ],
  },
  driver: {
    label: "drivers",
    group: "travel",
    columns: ["phone_number", "status"],
    fields: [
      f("full_name", "fullName", "text", { required: true }),
      f("phone_number", "phone", "tel", { default: "" }),
      f("whatsapp_phone", "whatsapp", "tel", { default: "" }),
      f("license_number", "license", "text", { default: "" }),
      status(["AVAILABLE", "BUSY", "UNAVAILABLE", "OFF_DUTY"]),
      notes,
    ],
  },
  vehicle: {
    label: "vehicles",
    group: "travel",
    columns: ["vehicle_type", "capacity", "license_plate", "status"],
    fields: [
      f("name", "name", "text", { required: true, max: 100 }),
      f("vehicle_type", "type", "select", {
        options: ["CAR", "VAN", "MINIBUS", "BUS", "CUSTOM"],
        default: "VAN",
      }),
      f("license_plate", "registration", "text", { default: "" }),
      f("color", "color", "text", { default: "" }),
      f("capacity", "capacity", "number", { required: true, default: 1 }),
      status(["AVAILABLE", "IN_USE", "MAINTENANCE", "UNAVAILABLE"]),
      notes,
    ],
  },
  trip: {
    label: "trips",
    group: "travel",
    columns: ["direction", "scheduled_departure_utc", "status"],
    fields: [
      f("direction", "direction", "select", {
        options: [...directions, "LOCAL"],
        default: "INBOUND",
      }),
      f("origin", "origin"),
      f("destination", "destination"),
      ...schedule,
      ref("driver_id", "driver", "driver"),
      ref("vehicle_id", "vehicle", "vehicle"),
      ref("related_flight_id", "flight", "flight"),
      status(["PLANNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
      lock,
      notes,
    ],
  },
  trip_passenger: {
    label: "tripPassengers",
    group: "travel",
    columns: ["person_id", "passenger_status", "pickup_location"],
    fields: [
      ref("trip_id", "trip", "trip", true),
      ref("person_id", "person", "person", true),
      f("passenger_status", "status", "select", {
        options: [
          "ASSIGNED",
          "CONFIRMED",
          "PICKED_UP",
          "DROPPED_OFF",
          "NO_SHOW",
          "CANCELLED",
        ],
        default: "ASSIGNED",
      }),
      f("pickup_location", "pickup"),
      f("pickup_notes", "pickupNotes", "textarea"),
      notes,
    ],
  },
  apartment: {
    label: "apartments",
    group: "stay",
    columns: ["address", "status"],
    fields: [
      f("name", "name", "text", { required: true }),
      f("address", "address"),
      f("hebrew_address", "hebrewAddress"),
      f("floor", "floor"),
      f("entry_code", "entryCode"),
      f("landlord_name", "landlord"),
      f("landlord_phone", "phone", "tel"),
      status(["ACTIVE", "UNAVAILABLE", "CLOSED"]),
      f("total_cost", "totalCost", "decimal"),
      f("cost_currency", "currency"),
      f("cost_notes", "costNotes", "textarea"),
      notes,
    ],
  },
  room: {
    label: "rooms",
    group: "stay",
    columns: ["apartment_id", "floor"],
    fields: [
      f("name_or_number", "roomName", "text", { required: true }),
      ref("apartment_id", "apartment", "apartment"),
      f("floor", "floor"),
      f("description", "description", "textarea"),
      notes,
    ],
  },
  sleeping_place: {
    label: "sleepingPlaces",
    group: "stay",
    columns: ["room_id", "type", "is_active"],
    fields: [
      f("label", "name"),
      ref("room_id", "room", "room"),
      f("type", "type", "select", {
        options: ["REGULAR_BED", "BUNK_BED", "SOFA_BED", "MATTRESS", "CUSTOM"],
      }),
      f("custom_type_name", "customType"),
      f("position_notes", "positionNotes", "textarea"),
      f("is_active", "active", "checkbox", { default: false }),
    ],
  },
  accommodation_assignment: {
    label: "assignments",
    group: "stay",
    columns: [
      "person_id",
      "sleeping_place_id",
      "start_date",
      "end_date",
      "status",
    ],
    fields: [
      ref("person_id", "person", "person"),
      ref("sleeping_place_id", "sleepingPlace", "sleeping_place"),
      f("start_date", "checkIn", "date"),
      f("end_date", "checkOut", "date"),
      status(["DRAFT", "ACTIVE", "TEMPORARY", "CANCELLED"]),
      lock,
      notes,
    ],
  },
  task: {
    label: "tasks",
    group: "operations",
    columns: ["priority", "due_date_utc", "status"],
    fields: [
      f("title", "title", "text", { required: true }),
      f("description", "description", "textarea"),
      ref("assignee_id", "assignee", "person"),
      f("priority", "priority", "select", {
        options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default: "MEDIUM",
      }),
      f("due_date_utc", "deadline", "datetime-local"),
      status(["NEW", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"]),
      notes,
    ],
  },
  apartment_issue: {
    label: "issues",
    group: "operations",
    columns: ["apartment_id", "priority", "status"],
    fields: [
      f("title", "title", "text", { required: true }),
      ref("apartment_id", "apartment", "apartment", true),
      f("description", "description", "textarea"),
      ref("reporter_id", "reporter", "person"),
      f("priority", "priority", "select", {
        options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        default: "MEDIUM",
      }),
      status(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
      f("resolution_notes", "resolution", "textarea"),
      notes,
    ],
  },
  payment: {
    label: "payments",
    group: "finance",
    columns: ["person_id", "amount", "currency", "payment_date"],
    fields: [
      ref("person_id", "person", "person", true),
      f("amount", "amount", "decimal", { required: true }),
      f("currency", "currency", "text", { required: true }),
      f("payment_date", "paymentDate", "date", { required: true }),
      f("payment_method", "method", "select", {
        options: [
          "CASH",
          "BANK_TRANSFER",
          "CREDIT_CARD",
          "CHECK",
          "OTHER",
          "CUSTOM",
        ],
        default: "CASH",
      }),
      f("reference", "reference"),
      ...money,
    ],
  },
  expense: {
    label: "expenses",
    group: "finance",
    columns: [
      "original_amount",
      "original_currency",
      "expense_date",
      "category",
    ],
    fields: [
      f("description", "description", "textarea", { required: true }),
      f("category", "category"),
      ref("payer_id", "payer", "person"),
      f("original_amount", "amount", "decimal", { required: true }),
      f("original_currency", "currency", "text", { required: true }),
      f("expense_date", "expenseDate", "date", { required: true }),
      f("receipt_reference", "receipt"),
      ...money,
    ],
  },
};
export function initialFields(
  kind: Kind,
  row?: RecordRow,
  preset: Fields = {},
): Fields {
  const result: Fields = {};
  for (const field of catalog[kind].fields) {
    let v = row?.[field.key] ?? preset[field.key] ?? field.default ?? null;
    if (field.type === "datetime-local" && v) v = String(v).slice(0, 16);
    result[field.key] = v as Fields[string];
  }
  if (kind === "person")
    result.custom_fields =
      (row?.custom_fields as Record<string, unknown>) ?? {};
  return result;
}
export function encodeFields(
  kind: Kind,
  fields: Fields,
  base?: RecordRow,
): Fields {
  const result: Fields = {};
  for (const field of catalog[kind].fields) {
    const v = fields[field.key];
    result[field.key] =
      field.type === "checkbox"
        ? Boolean(v)
        : v === "" || v == null
          ? field.default === ""
            ? ""
            : null
          : field.type === "number"
            ? Number(v)
            : field.type === "datetime-local"
              ? base?.[field.key] &&
                String(v) === String(base[field.key]).slice(0, 16)
                ? String(base[field.key])
                : new Date(String(v) + "Z").toISOString()
              : String(v).trim();
  }
  if (kind === "person") result.custom_fields = fields.custom_fields ?? {};
  return result;
}
export const isKind = (s: string): s is Kind => Object.hasOwn(catalog, s);
