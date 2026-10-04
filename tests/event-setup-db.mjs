export async function eventSetupChecks({
  db,
  scalar,
  eq,
  denied,
  identity,
  owner,
  other,
  outsider,
  event,
}) {
  await identity(owner);
  const fields = {
    name: "Web-created event",
    hebrew_name: "אירוע חדש",
    year: null,
    start_date: "2027-09-01",
    end_date: "2027-09-10",
    base_currency: "USD",
    description: null,
    manager_notes: null,
  };
  const request = crypto.randomUUID();
  const create = (f = fields, r = request) =>
    `select public.web_create_event('${r}','${JSON.stringify(f).replaceAll("'", "''")}'::jsonb)`;
  await eq("select public.web_can_create_event()", true);
  const id = await scalar(create());
  await eq(
    `select role from public.event_members where event_id='${id}' and user_id='${owner}'`,
    "administrator",
  );
  await eq(
    `select lifecycle_stage from public.events where id='${id}'`,
    "PLANNING",
  );
  await eq(
    `select count(*)::int from public.audit_entries where event_id='${id}'`,
    2,
  );
  await eq(create(), id);
  await denied(create({ ...fields, name: "Different" }), "40001");
  await denied(create({ ...fields, hebrew_name: "Changed" }), "40001");
  const edit = (
    version,
    name = "Updated",
    start = "2027-09-01",
    end = "2027-09-10",
    currency = "USD",
  ) =>
    `select (public.edit_event_details('${id}',${version},'${name}',null,null,null,null,${start === null ? "null" : "'" + start + "'"},${end === null ? "null" : "'" + end + "'"},${currency === null ? "null" : "'" + currency + "'"})).id`;
  await eq(edit(1), id);
  await eq(create(), id); // Retry compares original payload even after editing.
  await denied(edit(1), "40001");
  await denied(edit(2, "Updated", "2027-09-01", "2027-09-01"), "22023");
  await denied(edit(2, "Updated", "2027-09-01", "2027-09-10", "ZZZ"), "23514");
  await eq(edit(2, "Updated", null, null, null), id);
  await eq(
    `select hebrew_name is null and description is null and manager_notes is null and year is null and start_date is null and end_date is null and base_currency is null from public.events where id='${id}'`,
    true,
  );
  for (const patch of [
    { name: "  " },
    { end_date: "2027-09-01" },
    { end_date: "2027-08-31" },
    { year: 2027.5 },
    { start_date: "tomorrow" },
    { name: true },
  ])
    await denied(create({ ...fields, ...patch }, crypto.randomUUID()), "22023");
  await denied(
    create({ ...fields, base_currency: "ZZZ" }, crypto.randomUUID()),
    "23514",
  );
  const draftId = await scalar(
    create(
      {
        ...fields,
        start_date: null,
        end_date: null,
        base_currency: null,
        hebrew_name: null,
      },
      crypto.randomUUID(),
    ),
  );
  await eq(
    `select start_date is null and end_date is null and base_currency is null from public.events where id='${draftId}'`,
    true,
  );
  await denied(
    `insert into public.event_members(event_id,user_id,created_by) values('${id}','${other}','${owner}')`,
    "42501",
  );
  await denied(`insert into public.events(name) values('Bypass')`, "42501");
  await denied("select * from web_private.event_creation_requests", "42501");
  await identity(other);
  await denied(create(), "42501");
  await denied(edit(3), "42501");
  await identity(outsider);
  await eq("select public.web_can_create_event()", false);
  await denied(create(fields, crypto.randomUUID()), "42501");
  await identity("", "anon");
  await denied(create(), "42501");
  await denied("select public.web_can_create_event()", "42501");
  await identity(owner);
  // Fault injection is disposable only: a failed membership insert must roll back event/audit/request.
  await db.exec(
    `reset role;create function public.test_reject_member() returns trigger language plpgsql as $$ begin raise exception using errcode='23514',message='Test membership failure';end;$$;create trigger test_reject_member before insert on public.event_members for each row execute function public.test_reject_member();`,
  );
  await identity(owner);
  const failed = crypto.randomUUID();
  await denied(create(fields, failed), "23514");
  await eq(
    `select count(*)::int from public.events where creation_request_id='${failed}'`,
    0,
  );
  await db.exec(
    "reset role;drop trigger test_reject_member on public.event_members;drop function public.test_reject_member();",
  );
  await identity(owner);
  await scalar(create(fields, failed));
  // Editing event dates never changes existing accommodation rows.
  const before = await scalar(
    `select jsonb_agg(to_jsonb(a) order by id) from public.accommodation_assignments a where event_id='${event}'`,
  );
  const version = await scalar(
    `select version from public.events where id='${event}'`,
  );
  await scalar(
    `select (public.edit_event_details('${event}',${version},'Fixture',null,null,null,2027,'2027-08-30','2027-09-12','USD')).id`,
  );
  await eq(
    `select jsonb_agg(to_jsonb(a) order by id) from public.accommodation_assignments a where event_id='${event}'`,
    before,
  );
}
