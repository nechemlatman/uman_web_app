import { describe, it, expect } from "vitest";
import { validate } from "../src/domain/validation";
import { title, type RecordRow, type Kind } from "../src/domain/model";
import { initialFields, encodeFields } from "../src/domain/catalog";
import { operationalMissing } from "../src/domain/drafts";
const row = (fields: Record<string, unknown>): RecordRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  event_id: "22222222-2222-4222-8222-222222222222",
  version: 1,
  is_deleted: false,
  ...fields,
});
describe("draft-first capture", () => {
  for (const field of [
    "last_name",
    "hebrew_first_name",
    "phone",
    "whatsapp_phone",
    "passport_name",
    "notes",
  ])
    it("accepts person identity from " + field, () =>
      expect(validate("person", { [field]: "Useful value" })).toEqual({}),
    );
  it("rejects whitespace-only people and notes", () =>
    expect(
      validate("person", { first_name: " ", notes: "\n\t" }),
    ).toHaveProperty("first_name"));
  it("displays incomplete identity without inventing names", () => {
    expect(title("person", row({ phone: "0501234567" }))).toBe("0501234567");
    expect(title("person", row({ email: "mail@example.test" }))).toBe(
      "mail@example.test",
    );
    expect(title("person", row({ notes: "Private note" }), "he")).toBe(
      "אדם ללא שם",
    );
  });
  it("prefers Hebrew names in Hebrew", () =>
    expect(
      title(
        "person",
        row({ first_name: "Name", hebrew_first_name: "שם" }),
        "he",
      ),
    ).toBe("שם"));
  it("has localized structure fallbacks", () => {
    for (const kind of ["apartment", "room", "sleeping_place"] as Kind[]) {
      expect(title(kind, row({}))).not.toMatch(/11111111|null/);
      expect(title(kind, row({}), "he")).toMatch(/[א-ת]/);
    }
  });
  it("permits unnamed structure and inactive bed drafts", () => {
    for (const kind of ["apartment", "room", "sleeping_place"] as Kind[])
      expect(validate(kind, initialFields(kind))).toEqual({});
  });
  it("requires useful task and issue content instead of a title", () => {
    for (const kind of ["task", "apartment_issue"] as Kind[]) {
      expect(
        validate(kind, { ...initialFields(kind), description: "Fix leak" }),
      ).toEqual({});
      expect(validate(kind, initialFields(kind))).toHaveProperty("title");
    }
  });
  it("requires an apartment before issue work progresses", () =>
    expect(
      validate("apartment_issue", {
        description: "Fix leak",
        status: "IN_PROGRESS",
      }),
    ).toHaveProperty("apartment_id"));
  it("does not fabricate a vehicle capacity", () => {
    const fields = encodeFields("vehicle", initialFields("vehicle"));
    expect(fields.capacity).toBeNull();
    expect(fields.status).toBe("UNAVAILABLE");
    expect(validate("vehicle", { ...fields, notes: "Ask supplier" })).toEqual(
      {},
    );
    expect(
      validate("vehicle", {
        ...fields,
        notes: "Ask supplier",
        status: "AVAILABLE",
      }),
    ).toHaveProperty("capacity");
  });
  it("requires a driver name for availability, not initial phone capture", () => {
    expect(
      validate("driver", { phone_number: "123", status: "UNAVAILABLE" }),
    ).toEqual({});
    expect(
      validate("driver", { phone_number: "123", status: "AVAILABLE" }),
    ).toHaveProperty("full_name");
  });
  it("shows only actionable operational gaps", () => {
    expect(operationalMissing("task", { description: "Fix leak" })).toEqual([]);
    expect(operationalMissing("room", { name_or_number: null })).toEqual([
      "apartment_id",
    ]);
  });
});
