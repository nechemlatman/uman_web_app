import { accommodationChecks } from "./accommodation-db.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
let checks = 0;
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333",
  event = "44444444-4444-4444-8444-444444444444";
async function scalar(sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0];
}
async function eq(sql, value) {
  assert.deepEqual(await scalar(sql), value);
  checks++;
}
async function denied(sql, code) {
  await assert.rejects(db.exec(sql), (e) => e.code === code);
  checks++;
}
async function identity(id, role = "authenticated") {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role};`,
  );
}
await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create publication supabase_realtime;insert into auth.users values('${owner}'),('${other}'),('${outsider}');`);
for (const folder of ["reference-migrations", "../supabase/migrations"]) {
  const dir = new URL(folder + "/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    } catch (e) {
      console.error("Migration failed:", file, e.message);
      throw e;
    }
  }
}
await db.exec(
  `select set_config('request.jwt.claim.sub','${owner}',false);insert into public.events(id,creation_request_id,name,year,start_date,end_date,base_currency,created_by,updated_by) values('${event}',gen_random_uuid(),'Fixture',2027,'2027-09-01','2027-09-10','USD','${owner}','${owner}');insert into public.event_members(event_id,user_id,created_by)values('${event}','${owner}','${owner}'),('${event}','${other}','${owner}');`,
);
await identity(owner);
const taskFields = {
  title: "Check apartment",
  description: null,
  assignee_id: null,
  priority: "HIGH",
  due_date_utc: "2020-01-01T12:00:00Z",
  status: "NEW",
  notes: null,
};
const request = crypto.randomUUID();
const call = (
  name,
  fields,
  id = null,
  version = null,
  req = crypto.randomUUID(),
) =>
  `select public.${name}('${event}','${req}',${id ? "'" + id + "'" : "null"},${version ?? "null"},'${JSON.stringify(fields).replaceAll("'", "''")}'::jsonb)`;
const task = await scalar(call("save_task", taskFields, null, null, request));
checks++;
assert.equal(
  await scalar(call("save_task", taskFields, null, null, request)),
  task,
);
checks++;
await denied(
  call(
    "save_task",
    { ...taskFields, title: "Changed retry" },
    null,
    null,
    request,
  ),
  "40001",
);
await denied(call("save_task", taskFields, task, 0), "40001");
await denied(`update public.tasks set title='Bypass'`, "42501");
await eq(
  `select count(*)::int from public.audit_entries where entity_type='tasks'`,
  1,
);
await scalar(
  call("save_task", { ...taskFields, status: "COMPLETED" }, task, 1),
);
checks++;
await eq(
  `select completed_at_utc is not null from public.tasks where id='${task}'`,
  true,
);
await scalar(call("save_task", taskFields, task, 2));
checks++;
await eq(
  `select completed_at_utc is null from public.tasks where id='${task}'`,
  true,
);
await db.exec(`select public.set_task_deleted('${event}','${task}',3,true)`);
checks++;
await denied(call("save_task", taskFields, task, 4), "40001");
await db.exec(`select public.set_task_deleted('${event}','${task}',4,false)`);
checks++;
const person = await scalar(
  call("save_person", {
    first_name: "Test",
    last_name: "",
    phone: "",
    status: "ACTIVE",
    custom_fields: {},
  }),
);
const pay = {
  person_id: person,
  amount: "500.00",
  currency: "USD",
  payment_date: "2027-09-01",
  payment_method: "CASH",
  reference: "receipt",
  notes: null,
  exchange_rate: null,
  exchange_rate_timestamp_utc: null,
};
const payment = await scalar(call("save_payment", pay));
checks++;
await eq(
  `select base_amount::text from public.payments where id='${payment}'`,
  "500.0000",
);
const exp = {
  description: "Apartment",
  category: "Stay",
  payer_id: null,
  original_amount: "5000.00",
  original_currency: "ILS",
  expense_date: "2027-09-01",
  receipt_reference: null,
  notes: null,
  exchange_rate: "3.5",
  exchange_rate_timestamp_utc: "2027-08-01T12:00:00Z",
};
const expense = await scalar(call("save_expense", exp));
checks++;
await eq(
  `select base_amount::text from public.expenses where id='${expense}'`,
  "1428.5714",
);
await denied(call("save_payment", { ...pay, amount: "1.00001" }), "22023");
await denied(call("save_payment", { ...pay, exchange_rate: "2" }), "22023");
await denied(
  call("save_expense", { ...exp, original_currency: "ZZZ" }),
  "23514",
);
await denied(call("save_payment", pay, payment, 1), "22023");
await denied(
  `select public.edit_event_details('${event}',1,'Fixture',null,null,null,2027,'2027-09-01','2027-09-10','EUR')`,
  "22023",
);
await db.exec(`select public.reverse_payment('${event}','${payment}',1)`);
checks++;
await denied(
  `select public.reverse_payment('${event}','${payment}',1)`,
  "40001",
);
await db.exec(`select public.reverse_payment('${event}','${payment}',2)`);
checks++;
await eq(`select version::int from public.payments where id='${payment}'`, 2);
await eq(
  `select amount::text from public.payments where id='${payment}'`,
  "500.0000",
);
await eq(
  `select (public.web_command_center('${event}')->'finance'->>'payments')`,
  "0",
);
await eq(
  `select jsonb_typeof(x->'amount') from public.web_ledger('${event}','payment')x`,
  "string",
);

const apartment = await scalar(
  call("save_apartment", { name: "Test apartment", status: "ACTIVE" }),
);
const room = await scalar(
  call("save_room", { name_or_number: "Room 1", apartment_id: apartment }),
);
const bed = await scalar(
  call("save_sleeping_place", {
    room_id: room,
    label: "Bed 1",
    type: "REGULAR_BED",
    is_active: true,
  }),
);
const stay = {
  person_id: person,
  sleeping_place_id: bed,
  start_date: "2027-09-01",
  end_date: "2027-09-05",
  status: "ACTIVE",
  is_locked: false,
  notes: null,
};
const assignment = await scalar(call("save_accommodation_assignment", stay));
checks++;
await eq(
  "select (x->>'available')::boolean from public.web_availability('" +
    event +
    "','2027-09-05','2027-09-10')x",
  true,
);
await eq(
  "select (x->>'available')::boolean from public.web_availability('" +
    event +
    "','2027-09-04','2027-09-10')x",
  false,
);
await eq(
  "select count(*)::int from public.web_availability('" +
    event +
    "','2027-09-04','2027-09-10',0,true)",
  0,
);
await eq(
  "select jsonb_array_length(public.web_assignment_review('" +
    event +
    "','accommodation_assignment',null,'" +
    JSON.stringify({ ...stay, start_date: "2027-09-04" }) +
    "'::jsonb))",
  1,
);
await eq(
  "select jsonb_array_length(public.web_assignment_review('" +
    event +
    "','accommodation_assignment',null,'" +
    JSON.stringify({
      ...stay,
      start_date: "2027-09-05",
      end_date: "2027-09-10",
    }) +
    "'::jsonb))",
  0,
);
await denied(
  call(
    "save_accommodation_assignment",
    { ...stay, person_id: outsider },
    assignment,
    1,
  ),
  "22023",
);
const issueFields = {
  title: "Leaking tap",
  apartment_id: apartment,
  priority: "HIGH",
  status: "OPEN",
};
const issue = await scalar(call("save_apartment_issue", issueFields));
checks++;
await scalar(
  call(
    "save_apartment_issue",
    { ...issueFields, status: "RESOLVED", resolution_notes: "Repaired" },
    issue,
    1,
  ),
);
checks++;
await eq(
  "select resolved_at_utc is not null from public.apartment_issues where id='" +
    issue +
    "'",
  true,
);
await scalar(call("save_apartment_issue", issueFields, issue, 2));
checks++;
await eq(
  "select resolved_at_utc is null from public.apartment_issues where id='" +
    issue +
    "'",
  true,
);
await eq(
  "select public.web_request_status('" + event + "','task','" + request + "')",
  task,
);
await eq(
  "select count(*)::int from jsonb_array_elements(public.web_command_center('" +
    event +
    "')->'alerts')x where x->>'rule'='PERSON_WITHOUT_SLEEPING_PLACE'",
  1,
);
await scalar(
  call("save_accommodation_assignment", {
    ...stay,
    start_date: "2027-09-05",
    end_date: "2027-09-10",
  }),
);
checks++;
await eq(
  "select count(*)::int from jsonb_array_elements(public.web_command_center('" +
    event +
    "')->'alerts')x where x->>'rule'='PERSON_WITHOUT_SLEEPING_PLACE'",
  0,
);
assert.deepEqual(
  await scalar("select public.web_command_center('" + event + "')->'alerts'"),
  await scalar("select public.web_command_center('" + event + "')->'alerts'"),
);
checks++;
await denied(
  call("save_task", { ...taskFields, assignee_id: outsider }),
  "23503",
);
await denied(
  "select public.web_availability('" + event + "','2027-09-10','2027-09-01')",
  "22023",
);
await identity(other);
await eq(
  "select public.web_request_status('" + event + "','task','" + request + "')",
  null,
);

await denied(call("save_task", taskFields, task, 1), "40001");
await eq(`select count(*)::int from public.tasks`, 1);
await identity(outsider);
await eq(`select count(*)::int from public.tasks`, 0);
for (const name of ["save_task", "save_payment", "save_expense"])
  await denied(
    call(
      name,
      name === "save_task" ? taskFields : name === "save_payment" ? pay : exp,
    ),
    "42501",
  );
await denied(`select public.web_command_center('${event}')`, "42501");
await identity("", "anon");
await denied(`select * from public.tasks`, "42501");
await denied(call("save_task", taskFields), "42501");
await accommodationChecks({
  db,
  scalar,
  eq,
  denied,
  identity,
  call,
  owner,
  other,
  outsider,
  event,
  room,
  person,
});
console.log("Database checks passed:", checks);
await db.close();
