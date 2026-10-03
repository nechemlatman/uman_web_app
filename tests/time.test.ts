import { describe, expect, it } from "vitest";
import {
  operationalInput,
  operationalCandidates,
  operationalUtc,
} from "../src/domain/time";
import { formatDate } from "../src/i18n/provider";

describe("operational time in Europe/Kyiv", () => {
  it("uses summer and winter offsets rather than the computer timezone", () => {
    expect(operationalUtc("2027-07-01T12:30")).toBe("2027-07-01T09:30:00.000Z");
    expect(operationalUtc("2027-12-01T12:30")).toBe("2027-12-01T10:30:00.000Z");
    expect(operationalInput("2027-07-01T22:30:00Z")).toBe("2027-07-02T01:30");
    expect(formatDate("2027-07-01T22:30:00Z", "en", true)).toContain(
      "2 Jul 2027, 01:30",
    );
    expect(formatDate("2027-07-01T22:30:00Z", "en", true)).toContain(
      "Europe/Kyiv",
    );
  });
  it("rejects the spring gap and impossible dates instead of shifting them", () => {
    for (const value of [
      "2027-03-28T03:30",
      "2027-02-29T12:00",
      "2027-02-01T24:00",
      "invalid",
    ])
      expect(() => operationalUtc(value)).toThrow("timeInvalid");
    expect(operationalUtc("2027-03-28T02:30")).toBe("2027-03-28T00:30:00.000Z");
    expect(operationalUtc("2027-03-28T04:30")).toBe("2027-03-28T01:30:00.000Z");
  });
  it("requires an explicit occurrence during the repeated autumn hour", () => {
    const value = "2027-10-31T03:30";
    expect(operationalCandidates(value)).toEqual([
      "2027-10-31T00:30:00.000Z",
      "2027-10-31T01:30:00.000Z",
    ]);
    expect(() => operationalUtc(value)).toThrow("timeAmbiguous");
    for (const instant of operationalCandidates(value))
      expect(operationalUtc(value, undefined, instant)).toBe(instant);
    expect(() =>
      operationalUtc(value, undefined, "2027-10-31T02:30:00.000Z"),
    ).toThrow("timeAmbiguous");
  });
  it("preserves the saved occurrence and microsecond precision when untouched", () => {
    const original = "2027-10-31T01:30:45.123456+00:00";
    expect(operationalUtc(operationalInput(original), original)).toBe(original);
    expect(
      operationalUtc("2027-10-31T03:30", original, "2027-10-31T00:30:00.000Z"),
    ).toBe("2027-10-31T00:30:00.000Z");
  });
});
