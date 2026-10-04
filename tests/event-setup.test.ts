import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  eventValues,
  eventPayload,
  eventCurrencies,
  validateEvent,
} from "../src/domain/event-setup";
describe("event setup validation", () => {
  it("defaults only currency and keeps optional metadata nullable", () => {
    const d = { ...eventValues(), name: "New event" };
    expect(eventPayload(d)).toEqual({
      name: "New event",
      hebrew_name: null,
      year: null,
      start_date: null,
      end_date: null,
      base_currency: "USD",
      description: null,
      manager_notes: null,
    });
  });
  it("rejects blank names without silently trimming meaningful input", () => {
    expect(validateEvent({ ...eventValues(), name: "  " }).name).toBeTruthy();
    expect(eventPayload({ ...eventValues(), name: "  Uman  " }).name).toBe(
      "  Uman  ",
    );
  });
  it("rejects equal and reversed dates", () => {
    for (const end_date of ["2027-09-01", "2027-08-31"])
      expect(
        validateEvent({
          ...eventValues(),
          name: "Event",
          start_date: "2027-09-01",
          end_date,
        }).end_date,
      ).toBe("eventRangeInvalid");
  });
  it("accepts incomplete planning dates but rejects impossible dates", () => {
    expect(
      validateEvent({
        ...eventValues(),
        name: "Event",
        start_date: "2027-09-01",
      }),
    ).toEqual({});
    expect(
      validateEvent({
        ...eventValues(),
        name: "Event",
        start_date: "2027-02-30",
      }).start_date,
    ).toBeTruthy();
  });
  it("uses the deployed currency allowlist and rejects lowercase/unknown codes", () => {
    const sql = readFileSync(
      "tests/reference-migrations/20260919202929_event_currency_codes.sql",
      "utf8",
    );
    expect(eventCurrencies).toEqual(
      [...sql.matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]),
    );
    for (const base_currency of ["usd", "ZZZ", "XXX"])
      expect(
        validateEvent({ ...eventValues(), name: "Event", base_currency })
          .base_currency,
      ).toBeTruthy();
  });
  it("allows clearing optional values and rejects fractional years", () => {
    expect(
      eventPayload({ ...eventValues(), name: "Event", base_currency: "" })
        .base_currency,
    ).toBeNull();
    expect(
      validateEvent({ ...eventValues(), name: "Event", year: "2027.5" }).year,
    ).toBeTruthy();
  });
});
