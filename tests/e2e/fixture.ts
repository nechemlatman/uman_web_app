import { type Page } from "@playwright/test";
export const eventId = "44444444-4444-4444-8444-444444444444",
  personId = "55555555-5555-4555-8555-555555555555";
const actor = "11111111-1111-4111-8111-111111111111",
  now = new Date().toISOString();
export const event = {
  id: eventId,
  name: "Browser verification event",
  hebrew_name: "אירוע בדיקת דפדפן",
  year: 2027,
  start_date: "2027-09-01",
  end_date: "2027-09-10",
  base_currency: "USD",
  lifecycle_stage: "PLANNING",
  is_deleted: false,
  version: 1,
  description: null,
  manager_notes: null,
  settings: {},
};
const common = {
  event_id: eventId,
  version: 1,
  is_deleted: false,
  created_at_utc: now,
  updated_at_utc: now,
  created_by: actor,
  updated_by: actor,
};
const tables: Record<string, string> = {
  person: "people",
  flight: "flights",
  flight_passenger: "flight_passengers",
  driver: "drivers",
  vehicle: "vehicles",
  trip: "trips",
  trip_passenger: "trip_passengers",
  apartment: "apartments",
  room: "rooms",
  sleeping_place: "sleeping_places",
  accommodation_assignment: "accommodation_assignments",
  task: "tasks",
  apartment_issue: "apartment_issues",
  payment: "payments",
  expense: "expenses",
};
type Row = Record<string, unknown>;
export async function fixture(page: Page) {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [],
    records: Record<string, Row[]> = {
      people: [
        {
          ...common,
          id: personId,
          first_name: "Browser",
          last_name: "Participant",
          phone: "",
          status: "ACTIVE",
          custom_fields: {},
        },
      ],
      events: [{ ...event }],
    },
    state = {
      conflict: false,
      warnings: false,
      denied: false,
      alerts: [] as Array<{
        id: string;
        rule: string;
        kind: string;
        entity_id: string;
        label: string;
        severity: string;
      }>,
    };
  const token =
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
    "." +
    btoa(
      JSON.stringify({
        sub: actor,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ) +
    ".test-signature";
  const notifications: Array<(table: string) => void> = [];
  await page.routeWebSocket("**/realtime/**", (ws) => {
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      const array = Array.isArray(frame);
      const topic = array ? frame[2] : frame.topic,
        event = array ? frame[3] : frame.event,
        payload = array ? frame[4] : frame.payload;
      const send = (event: string, payload: unknown) =>
        ws.send(
          JSON.stringify(
            array
              ? [frame[0], frame[1], topic, event, payload]
              : { topic, event, payload, ref: frame.ref },
          ),
        );
      if (event === "phx_join") {
        const filters = (payload.config?.postgres_changes ?? []).map(
          (f: Record<string, unknown>, i: number) => ({ ...f, id: i + 1 }),
        );
        send("phx_reply", {
          status: "ok",
          response: { postgres_changes: filters },
        });
        notifications.push((table) => {
          const ids = filters
            .filter((f: Record<string, unknown>) => f.table === table)
            .map((f: Record<string, unknown>) => f.id);
          send("postgres_changes", {
            ids,
            data: {
              schema: "public",
              table,
              type: "UPDATE",
              commit_timestamp: new Date().toISOString(),
              columns: [],
              record: {},
              old_record: {},
            },
          });
        });
      } else if (event === "heartbeat" || event === "phx_leave")
        send("phx_reply", { status: "ok", response: {} });
    });
  });
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      name = url.pathname.split("/").at(-1)!,
      body = request.postDataJSON() ?? {};
    calls.push({ name, body });
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data ?? null),
      });
    if (name === "token")
      return respond({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "fixture-only",
        user: {
          id: actor,
          email: "manager@example.test",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: now,
        },
      });
    if (name === "logout") return respond({});
    if (name === "user")
      return respond({ id: actor, email: "manager@example.test" });
    if (name === "web_command_center")
      return respond({
        counts: { people: 1, assignments: 0, tasks: 0, issues: 0, beds: 0 },
        alerts: state.alerts,
        schedule: [],
        finance: {
          payments: "0",
          expenses: "0",
          currency: "USD",
          unconverted: 0,
        },
      });
    if (name === "web_assignment_review")
      return respond(
        state.warnings
          ? [
              {
                id: personId,
                rule: "ACCOMMODATION_OVERLAP",
                label: "Existing assignment",
              },
            ]
          : [],
      );
    if (name === "person_duplicates") return respond([]);
    if (name === "read_person" || name === "read_trip")
      return respond(
        (records[name === "read_person" ? "people" : "trips"] ?? []).find(
          (r) => r.id === body.p_id,
        ),
      );
    if (name === "web_ledger") {
      let rows = records[tables[String(body.p_kind)]] ?? [];
      if (body.p_id) rows = rows.filter((r) => r.id === body.p_id);
      if (body.p_person_id)
        rows = rows.filter((r) => r.person_id === body.p_person_id);
      return respond(rows);
    }
    if (name.startsWith("save_")) {
      if (state.conflict) {
        state.conflict = false;
        const row = (records[tables[name.slice(5)]] ?? []).find(
          (r) => r.id === body.p_id,
        );
        if (row) row.version = Number(row.version) + 1;
        return respond({ code: "40001", message: "Record changed" }, 409);
      }
      const tab = tables[name.slice(5)],
        fields = body.p_fields as Row,
        id = body.p_id ?? crypto.randomUUID(),
        before = (records[tab] ?? []).find((r) => r.id === id);
      records[tab] = [
        ...(records[tab] ?? []).filter((r) => r.id !== id),
        {
          ...common,
          ...before,
          ...fields,
          id,
          version: Number(before?.version ?? 0) + 1,
        },
      ];
      return respond(id);
    }
    if (name === "web_request_status") return respond(null);
    if (name === "edit_event_details") {
      records.events[0] = {
        ...records.events[0],
        ...Object.fromEntries(
          Object.entries(body)
            .filter(([k]) => !["p_id", "p_expected_version"].includes(k))
            .map(([k, v]) => [k.slice(2), v]),
        ),
        version: Number(records.events[0].version) + 1,
      };
      return respond(records.events[0]);
    }
    let rows = records[name] ?? [];
    if (name === "events" && state.denied) rows = [];
    for (const [key, value] of url.searchParams)
      if (value.startsWith("eq."))
        rows = rows.filter((r) => String(r[key]) === value.slice(3));
    return respond(
      (request.headers()["accept"] ?? "").includes("vnd.pgrst.object")
        ? rows[0]
        : rows,
    );
  });
  return {
    calls,
    records,
    state,
    common,
    notify: (table: string) => notifications.forEach((n) => n(table)),
  };
}
export async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Email address").fill("manager@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: /Browser verification event/ }).click();
}
