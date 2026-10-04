import { describe, expect, it } from "vitest";
import {
  boardBeds,
  staySummary,
  sumPrices,
  validStayPrice,
  wholeEventStay,
  type StayData,
} from "../src/domain/stay";
import { initialFields, encodeFields } from "../src/domain/catalog";
import { eventSchema, type RecordRow } from "../src/domain/model";
import { he, en } from "../src/i18n/messages";
const row = (id: string, extra: Record<string, unknown> = {}): RecordRow => ({
  id,
  event_id: "event",
  version: 1,
  is_deleted: false,
  ...extra,
});
const fixture = (): StayData => ({
  apartments: [row("apt")],
  rooms: [
    row("r1", { apartment_id: "apt" }),
    row("r2", { apartment_id: "apt" }),
  ],
  people: [],
  sleeping_places: [
    row("b1", { room_id: "r1", is_active: true, listed_price: "400.1000" }),
    row("b2", { room_id: "r1", is_active: true, listed_price: null }),
    row("b3", { room_id: "r2", is_active: true, listed_price: "500.0000" }),
    row("b4", { room_id: "r2", is_active: false, listed_price: "100.0000" }),
  ],
  accommodation_assignments: [
    row("a1", {
      sleeping_place_id: "b1",
      status: "ACTIVE",
      agreed_price: "300.0001",
      end_date: "2020-01-01",
    }),
    row("a2", {
      sleeping_place_id: "b2",
      status: "CANCELLED",
      agreed_price: "900.0000",
    }),
    row("a3", {
      sleeping_place_id: "b3",
      status: "DRAFT",
      agreed_price: "200.0002",
    }),
  ],
});
describe("event-scoped bed board", () => {
  it("ignores arrival/interval end and excludes cancelled assignments", () => {
    const beds = boardBeds(fixture());
    expect(beds.map((b) => b.state)).toEqual([
      "occupied",
      "available",
      "reserved",
      "inactive",
    ]);
  });
  it("counts a bed once with overlapping assignments, and prices each agreement once", () => {
    const data = fixture();
    data.accommodation_assignments.push(
      row("a4", {
        sleeping_place_id: "b1",
        status: "TEMPORARY",
        agreed_price: "1.0000",
      }),
    );
    expect(staySummary(boardBeds(data))).toMatchObject({
      total: 4,
      occupied: 1,
      available: 1,
      reserved: 1,
      inactive: 1,
      listed: { total: "1000.1000", missing: 1 },
      agreed: { total: "501.0003", missing: 0 },
    });
  });
  it("summarizes room subsets and the apartment consistently", () => {
    const beds = boardBeds(fixture());
    expect(
      staySummary(beds.filter((b) => b.row.room_id === "r1")),
    ).toMatchObject({
      total: 2,
      occupied: 1,
      available: 1,
      listed: { total: "400.1000", missing: 1 },
      agreed: { total: "300.0001" },
    });
    expect(staySummary(beds).agreed.total).toBe("500.0003");
  });
  it("excludes archived beds and archived agreements", () => {
    const data = fixture();
    data.sleeping_places[3].is_deleted = true;
    data.accommodation_assignments[0].is_deleted = true;
    expect(staySummary(boardBeds(data))).toMatchObject({
      total: 3,
      occupied: 0,
      available: 2,
      reserved: 1,
    });
  });
  it("never coerces exact money through floating point", () => {
    expect(sumPrices(["9007199254740993.1234", "0.0001", null])).toEqual({
      total: "9007199254740993.1235",
      missing: 1,
    });
    expect(sumPrices([null, null])).toEqual({ total: null, missing: 2 });
    expect(sumPrices(["0.0000"])).toEqual({ total: "0.0000", missing: 0 });
  });
  it("accepts blank/null drafts and discounts independently of listed prices", () => {
    expect(
      encodeFields("sleeping_place", initialFields("sleeping_place"))
        .listed_price,
    ).toBeNull();
    expect(
      encodeFields("accommodation_assignment", { agreed_price: "1.1234" })
        .agreed_price,
    ).toBe("1.1234");
    expect(validStayPrice("1.12345")).toBe(false);
    expect(validStayPrice("-1")).toBe(false);
  });
  it("uses event dates instead of date query parameters for new Web stays", () => {
    const event = eventSchema.parse({
      id: "44444444-4444-4444-8444-444444444444",
      name: "Event",
      hebrew_name: null,
      description: null,
      manager_notes: null,
      settings: {},
      year: 2027,
      start_date: "2027-09-01",
      end_date: "2027-09-10",
      base_currency: "USD",
      lifecycle_stage: "PLANNING",
      version: 1,
      is_deleted: false,
    });
    expect(
      wholeEventStay(event, {
        start_date: "2027-09-03",
        end_date: "2027-09-04",
        person_id: "person",
      }),
    ).toMatchObject({
      start_date: "2027-09-01",
      end_date: "2027-09-10",
      person_id: "person",
    });
  });
  it("has real Hebrew translations for the operational board", () => {
    for (const key of [
      "bedBoard",
      "bedCode",
      "listedPrice",
      "agreedPrice",
      "bulkBeds",
      "wholeEventStay",
      "moveStay",
    ] as const) {
      expect(he[key]).not.toBe(en[key]);
      expect(he[key]).toMatch(/[א-ת]/);
    }
  });
});
