import { describe, it, expect } from "vitest";
import {
  civilDate,
  overlaps,
  validate,
  errorCode,
} from "../src/domain/validation";
import { encodeFields, initialFields, catalog } from "../src/domain/catalog";
import { scopedRows, type RecordRow } from "../src/domain/model";
import { validPublicConfig } from "../src/data/client";
import { formatDate } from "../src/i18n/provider";
import { civilMidnightUtc, countdownToCivilDate } from "../src/domain/time";
import { en, he } from "../src/i18n/messages";
const id = "11111111-1111-4111-8111-111111111111",
  event = "22222222-2222-4222-8222-222222222222";
describe("civil date and half-open intervals", () => {
  it("preserves valid dates and rejects impossible days", () => {
    expect(civilDate("2028-02-29")).toBe(true);
    expect(civilDate("2027-02-29")).toBe(false);
    expect(civilDate("2026-13-01")).toBe(false);
  });
  it("allows same-day accommodation turnover", () =>
    expect(
      overlaps("2027-09-01", "2027-09-03", "2027-09-03", "2027-09-06"),
    ).toBe(false));
  it("finds overlapping stays", () =>
    expect(
      overlaps("2027-09-01", "2027-09-04", "2027-09-03", "2027-09-06"),
    ).toBe(true));
  it("does not convert civil dates through local timezone", () =>
    expect(formatDate("2027-01-01", "en")).toContain("1 Jan 2027"));
});
describe("event-local countdown", () => {
  it("resolves Uman midnight across daylight-saving offsets", () => {
    expect(new Date(civilMidnightUtc("2027-09-30")!).toISOString()).toBe(
      "2027-09-29T21:00:00.000Z",
    );
    expect(new Date(civilMidnightUtc("2027-12-01")!).toISOString()).toBe(
      "2027-11-30T22:00:00.000Z",
    );
  });
  it("returns stable countdown units without going negative", () => {
    expect(civilMidnightUtc("2027-02-29")).toBeNull();
    const target = civilMidnightUtc("2027-09-30")!;
    expect(countdownToCivilDate("2027-09-30", target - 90061000)).toMatchObject({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
    });
    expect(countdownToCivilDate("2027-09-30", target + 1)?.totalMs).toBe(0);
  });
});

describe("scope and credentials", () => {
  it("refuses a record from another event", () =>
    expect(() =>
      scopedRows([{ id, event_id: id, version: 1, is_deleted: false }], event),
    ).toThrow());
  it("accepts matching scope", () =>
    expect(
      scopedRows(
        [{ id, event_id: event, version: 1, is_deleted: false }],
        event,
      ),
    ).toHaveLength(1));
  it("rejects secret keys and insecure production endpoints", () => {
    expect(
      validPublicConfig("https://example.supabase.co", "sb_secret_123"),
    ).toBe(false);
    expect(validPublicConfig("http://example.com", "sb_publishable_123")).toBe(
      false,
    );
  });
  it("accepts the publishable client configuration", () =>
    expect(
      validPublicConfig("https://example.supabase.co", "sb_publishable_test"),
    ).toBe(true));
  it("rejects a service role JWT", () =>
    expect(
      validPublicConfig(
        "https://example.supabase.co",
        "eyJ." + btoa(JSON.stringify({ role: "service_role" })) + ".sig",
      ),
    ).toBe(false));
});
describe("draft save versus explicit operation", () => {
  it("requires person identity but permits incomplete contact info", () => {
    expect(validate("person", { first_name: "A" })).toEqual({});
    expect(validate("person", { first_name: " " })).toHaveProperty(
      "first_name",
    );
  });
  it("validates participant email", () =>
    expect(
      validate("person", { first_name: "A", email: "bad" }),
    ).toHaveProperty("email"));
  it("permits flight draft and requires complete operational flight", () => {
    expect(validate("flight", { status: "DRAFT" })).toEqual({});
    expect(validate("flight", { status: "SCHEDULED" })).toHaveProperty(
      "scheduled_departure_utc",
    );
  });
  it("permits planned trip and requires a schedule for confirmation", () => {
    expect(validate("trip", { status: "PLANNED" })).toEqual({});
    expect(validate("trip", { status: "CONFIRMED" })).toHaveProperty("origin");
  });
  it("requires live assignment endpoints and references", () => {
    expect(validate("accommodation_assignment", { status: "DRAFT" })).toEqual(
      {},
    );
    expect(
      validate("accommodation_assignment", { status: "ACTIVE" }),
    ).toHaveProperty("person_id");
  });
  it("requires explicit notes for a locked accommodation decision", () =>
    expect(
      validate("accommodation_assignment", {
        status: "DRAFT",
        is_locked: true,
      }),
    ).toHaveProperty("notes"));
  it("requires bed type and room on activation", () =>
    expect(
      validate("sleeping_place", { is_active: true, type: "CUSTOM" }),
    ).toHaveProperty("custom_type_name"));
  it("rejects reversed date windows", () =>
    expect(
      validate("accommodation_assignment", {
        start_date: "2027-09-05",
        end_date: "2027-09-03",
      }),
    ).toHaveProperty("end_date"));
  it("rejects zero/fractional vehicle capacity", () => {
    expect(validate("vehicle", { name: "Bus", capacity: 0 })).toHaveProperty(
      "capacity",
    );
    expect(validate("vehicle", { name: "Bus", capacity: 1.5 })).toHaveProperty(
      "capacity",
    );
  });
  it("requires assignment identities", () =>
    expect(validate("trip_passenger", {})).toHaveProperty("person_id"));
});
describe("precision and mapping", () => {
  it("keeps financial amounts as decimal strings", () => {
    const f = encodeFields("payment", {
      ...initialFields("payment"),
      amount: "99999999999999.1234",
      currency: "USD",
    });
    expect(f.amount).toBe("99999999999999.1234");
  });
  it("rejects excessive decimal precision", () =>
    expect(
      validate("payment", {
        amount: "1.00001",
        currency: "USD",
        person_id: id,
        payment_date: "2027-09-01",
      }),
    ).toHaveProperty("amount"));
  it("converts explicit UTC form timestamps without browser timezone", () =>
    expect(
      encodeFields("flight", {
        ...initialFields("flight"),
        scheduled_departure_utc: "2027-09-01T12:30",
      }).scheduled_departure_utc,
    ).toBe("2027-09-01T12:30:00.000Z"));
  it("preserves custom person fields during edit", () => {
    const row = {
      id,
      event_id: event,
      version: 1,
      is_deleted: false,
      first_name: "A",
      custom_fields: { group: "One" },
    } as RecordRow;
    expect(
      encodeFields("person", initialFields("person", row)).custom_fields,
    ).toEqual({ group: "One" });
  });
  it("maps unknown values to null rather than invented dates", () =>
    expect(
      encodeFields(
        "accommodation_assignment",
        initialFields("accommodation_assignment"),
      ).start_date,
    ).toBeNull());
  it("classifies a stale version separately from validation", () => {
    expect(errorCode({ code: "40001" })).toBe("conflict");
    expect(errorCode({ code: "23514" })).toBe("invalid");
  });
  it("does not return raw backend messages", () =>
    expect(errorCode({ message: "private passport data" })).toBe("unknown"));
});
describe("complete bilingual forms", () => {
  it("contains translations for all field labels and enum choices", () => {
    for (const spec of Object.values(catalog)) {
      expect(en).toHaveProperty(spec.label);
      expect(he).toHaveProperty(spec.label);
      for (const field of spec.fields) {
        expect(en).toHaveProperty(field.label);
        expect(he).toHaveProperty(field.label);
        for (const option of field.options ?? [])
          expect(he).toHaveProperty(option);
      }
    }
  });
});

it("preserves original timestamp precision when editing another field", () => {
  const row: RecordRow = {
    id,
    event_id: event,
    version: 1,
    is_deleted: false,
    scheduled_departure_utc: "2027-09-01T12:30:45.123456+00:00",
  };
  const fields = initialFields("flight", row);
  fields.airline = "Updated airline";
  expect(encodeFields("flight", fields, row).scheduled_departure_utc).toBe(
    row.scheduled_departure_utc,
  );
  fields.scheduled_departure_utc = "2027-09-01T13:30";
  expect(encodeFields("flight", fields, row).scheduled_departure_utc).toBe(
    "2027-09-01T13:30:00.000Z",
  );
});
