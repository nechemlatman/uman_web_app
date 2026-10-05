import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  completeRows,
  linkedPeople,
  missingIdentity,
  overdue,
  liveLink,
} from "../src/data/workspace";
import { list } from "../src/data/repository";
import type { RecordRow } from "../src/domain/model";
vi.mock("../src/data/repository", () => ({ list: vi.fn(), PAGE_SIZE: 40 }));
const row = (id: string, extra: Record<string, unknown> = {}): RecordRow => ({
  id,
  event_id: "event",
  version: 1,
  is_deleted: false,
  ...extra,
});
beforeEach(() => vi.resetAllMocks());
describe("complete operational reads", () => {
  it("includes relations beyond the first page", async () => {
    vi.mocked(list)
      .mockResolvedValueOnce(
        Array.from({ length: 40 }, (_, i) => row(String(i))),
      )
      .mockResolvedValueOnce([row("last")]);
    expect(await completeRows("event", "task")).toHaveLength(41);
    expect(list).toHaveBeenNthCalledWith(2, "event", "task", "", 1);
  });
  it("never treats a failed relation page as absence", async () => {
    vi.mocked(list).mockRejectedValue(new Error("access revoked"));
    await expect(completeRows("event", "flight_passenger")).rejects.toThrow(
      "access revoked",
    );
  });
  it("rejects a repeated full page instead of silently truncating", async () => {
    vi.mocked(list).mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => row(String(i))),
    );
    await expect(completeRows("event", "task")).rejects.toThrow(
      "Incomplete operational read",
    );
  });
  it("excludes archived rows while preserving exact financial strings", async () => {
    vi.mocked(list).mockResolvedValue([
      row("live", { amount: "9007199254740993.1234" }),
      row("old", { is_deleted: true }),
    ]);
    expect(await completeRows("event", "payment")).toEqual([
      row("live", { amount: "9007199254740993.1234" }),
    ]);
  });
});
describe("truthful operational classifications", () => {
  it("does not count cancelled flights or archived targets as assigned", () => {
    const links = [
      row("a", { flight_id: "f", person_id: "one", status: "CONFIRMED" }),
      row("b", { flight_id: "old", person_id: "two", status: "CONFIRMED" }),
    ];
    expect([
      ...linkedPeople(
        links,
        [row("f", { status: "CANCELLED" }), row("old", { is_deleted: true })],
        "flight_id",
      ),
    ]).toEqual([]);
  });
  it("includes tentative reservations but excludes cancelled/no-show links", () => {
    expect(liveLink(row("a", { status: "TENTATIVE" }))).toBe(true);
    expect(liveLink(row("b", { passenger_status: "NO_SHOW" }))).toBe(false);
    expect(liveLink(row("c", { status: "CANCELLED" }))).toBe(false);
  });
  it("calls out missing names without rejecting meaningful draft contacts", () => {
    expect(missingIdentity(row("a", { phone: "0501234567" }))).toBe(true);
    expect(missingIdentity(row("b", { hebrew_last_name: "לוי" }))).toBe(false);
  });
  it("only marks unfinished tasks with elapsed deadlines overdue", () => {
    const now = Date.parse("2026-10-05T10:00:00Z");
    expect(
      overdue(
        row("a", { status: "WAITING", due_date_utc: "2026-10-05T09:00:00Z" }),
        now,
      ),
    ).toBe(true);
    for (const status of ["COMPLETED", "CANCELLED"])
      expect(
        overdue(row(status, { status, due_date_utc: "2026-10-01" }), now),
      ).toBe(false);
    expect(overdue(row("b", { status: "NEW" }), now)).toBe(false);
    expect(
      overdue(row("c", { status: "NEW", due_date_utc: "2026-10-06" }), now),
    ).toBe(false);
  });
});
