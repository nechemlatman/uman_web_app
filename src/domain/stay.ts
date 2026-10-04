import type { EventRow, Fields, RecordRow } from "./model";
export type BedState = "available" | "occupied" | "reserved" | "inactive";
export interface StayData {
  apartments: RecordRow[];
  rooms: RecordRow[];
  sleeping_places: RecordRow[];
  accommodation_assignments: RecordRow[];
  people: Array<{
    id: string;
    event_id: string;
    label: string;
    is_deleted: boolean;
  }>;
}
export interface BoardBed {
  row: RecordRow;
  state: BedState;
  assignments: RecordRow[];
}
export function wholeEventStay(event: EventRow, preset: Fields = {}): Fields {
  return { ...preset, start_date: event.start_date, end_date: event.end_date };
}
export function bedState(row: RecordRow, assignments: RecordRow[]): BedState {
  if (!row.is_active) return "inactive";
  if (
    assignments.some((a) => ["ACTIVE", "TEMPORARY"].includes(String(a.status)))
  )
    return "occupied";
  return assignments.some((a) => a.status === "DRAFT")
    ? "reserved"
    : "available";
}
export function boardBeds(data: StayData): BoardBed[] {
  return data.sleeping_places
    .filter((b) => !b.is_deleted)
    .map((row) => {
      // Event ownership, not arrival/check-out dates, governs this operational board.
      const assignments = data.accommodation_assignments.filter(
        (a) =>
          !a.is_deleted &&
          a.sleeping_place_id === row.id &&
          ["DRAFT", "ACTIVE", "TEMPORARY"].includes(String(a.status)),
      );
      return { row, assignments, state: bedState(row, assignments) };
    });
}
export const validStayPrice = (value: string) =>
  /^\d{1,16}(\.\d{1,4})?$/.test(value);
export function sumPrices(values: unknown[]): {
  total: string | null;
  missing: number;
} {
  let units = 0n,
    known = 0;
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string" || !validStayPrice(value))
      throw new Error("Invalid exact accommodation price");
    const [whole, fraction = ""] = value.split(".");
    units += BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
    known++;
  }
  return {
    total: known
      ? `${units / 10000n}.${String(units % 10000n).padStart(4, "0")}`
      : null,
    missing: values.length - known,
  };
}
export function staySummary(beds: BoardBed[]) {
  const assignments = [
    ...new Map(
      beds.flatMap((b) => b.assignments).map((a) => [a.id, a]),
    ).values(),
  ];
  return {
    total: beds.length,
    occupied: beds.filter((b) => b.state === "occupied").length,
    reserved: beds.filter((b) => b.state === "reserved").length,
    available: beds.filter((b) => b.state === "available").length,
    inactive: beds.filter((b) => b.state === "inactive").length,
    listed: sumPrices(beds.map((b) => b.row.listed_price)),
    agreed: sumPrices(assignments.map((a) => a.agreed_price)),
  };
}
