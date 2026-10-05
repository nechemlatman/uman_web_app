import { list, PAGE_SIZE } from "./repository";
import { useQueries } from "@tanstack/react-query";
import { useEvent } from "../app/event";
import type { Kind, RecordRow } from "../domain/model";

// Absence filters are only shown after a complete read. Never interpret a capped
// or failed page as an empty relation. Existing APIs retain authorization/scope.
export async function completeRows(
  eventId: string,
  kind: Kind,
): Promise<RecordRow[]> {
  const rows = new Map<string, RecordRow>();
  for (let page = 0; page < 100; page++) {
    const batch = await list(eventId, kind, "", page);
    let added = 0;
    for (const row of batch)
      if (!rows.has(row.id)) {
        rows.set(row.id, row);
        added++;
      }
    if (batch.length < PAGE_SIZE)
      return [...rows.values()].filter((r) => !r.is_deleted);
    if (!added) throw new Error("Incomplete operational read");
  }
  throw new Error("Operational read exceeds supported size");
}
export function useWorkspace(kinds: Kind[]) {
  const { event } = useEvent();
  const queries = useQueries({
    queries: kinds.map((kind) => ({
      queryKey: ["event", event.id, "workspace", kind],
      queryFn: () => completeRows(event.id, kind),
    })),
  });
  const rows = Object.fromEntries(
    kinds.map((kind, i) => [kind, queries[i].data ?? []]),
  ) as Partial<Record<Kind, RecordRow[]>>;
  return {
    rows,
    pending: queries.some((q) => q.isPending),
    error: queries.find((q) => q.error)?.error,
    retry: () => {
      for (const q of queries) void q.refetch();
    },
  };
}
export const liveLink = (r: RecordRow) =>
  !r.is_deleted &&
  !["CANCELLED", "NO_SHOW"].includes(String(r.status ?? r.passenger_status));
export const openTask = (r: RecordRow) =>
  !["COMPLETED", "CANCELLED"].includes(String(r.status));
export const overdue = (r: RecordRow, now = Date.now()) =>
  openTask(r) && !!r.due_date_utc && Date.parse(String(r.due_date_utc)) < now;
export const missingIdentity = (r: RecordRow) =>
  !["first_name", "last_name", "hebrew_first_name", "hebrew_last_name"].some(
    (k) => String(r[k] ?? "").trim(),
  );
export function linkedPeople(
  links: RecordRow[],
  targets: RecordRow[],
  key: string,
) {
  const valid = new Set(targets.filter(liveLink).map((r) => r.id));
  return new Set(
    links
      .filter((r) => liveLink(r) && valid.has(String(r[key])))
      .map((r) => String(r.person_id)),
  );
}
export function relationStates(
  links: RecordRow[],
  targets: RecordRow[],
  key: string,
) {
  const targetMap = new Map(targets.filter(liveLink).map((r) => [r.id, r]));
  const result = new Map<string, string[]>();
  for (const link of links.filter(liveLink)) {
    const target = targetMap.get(String(link[key]));
    if (!target) continue;
    const person = String(link.person_id),
      status = String(target.status ?? "recorded");
    result.set(person, [...new Set([...(result.get(person) ?? []), status])]);
  }
  return result;
}
