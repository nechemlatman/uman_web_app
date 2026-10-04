// Runs inside the same disposable database as the existing compatibility suite.
export async function accommodationChecks({
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
}) {
  await identity(owner);
  const fields = {
    room_id: room,
    label: "Window",
    bed_code: "12A",
    type: "REGULAR_BED",
    is_active: true,
    listed_price: "9007199254740993.1234",
  };
  const priced = await scalar(call("save_sleeping_place", fields));
  await eq(
    `select listed_price::text from public.sleeping_places where id='${priced}'`,
    "9007199254740993.1234",
  );
  await eq(
    `select x->>'listed_price' from jsonb_array_elements(public.read_accommodation('${event}')->'sleeping_places')x where x->>'id'='${priced}'`,
    "9007199254740993.1234",
  );
  await eq(
    `select jsonb_typeof(x->'listed_price') from jsonb_array_elements(public.read_accommodation('${event}')->'sleeping_places')x where x->>'id'='${priced}'`,
    "string",
  );
  await denied(
    call("save_sleeping_place", { ...fields, bed_code: " 12a " }),
    "23505",
  );
  await denied(
    call("save_sleeping_place", {
      ...fields,
      bed_code: "X",
      listed_price: "1.00001",
    }),
    "22023",
  );
  await denied(
    call("save_sleeping_place", {
      ...fields,
      bed_code: "X",
      listed_price: "-1",
    }),
    "22023",
  );
  await denied(
    call("save_sleeping_place", {
      ...fields,
      bed_code: "X",
      listed_price: "NaN",
    }),
    "22023",
  );
  const legacy = Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) => !["listed_price", "bed_code"].includes(key),
    ),
  );
  await scalar(call("save_sleeping_place", legacy, priced, 1));
  await eq(
    `select listed_price::text from public.sleeping_places where id='${priced}'`,
    "9007199254740993.1234",
  );
  await eq(
    `select bed_code from public.sleeping_places where id='${priced}'`,
    "12A",
  );
  await denied(call("save_sleeping_place", fields, priced, 1), "40001");
  await scalar(
    call("save_sleeping_place", { ...fields, listed_price: null }, priced, 2),
  );
  await eq(
    `select listed_price is null from public.sleeping_places where id='${priced}'`,
    true,
  );
  await eq(
    `select count(*)::int from public.audit_entries where entity_id='${priced}'`,
    3,
  );
  const stay = {
    sleeping_place_id: priced,
    person_id: person,
    start_date: "2027-09-01",
    end_date: "2027-09-10",
    status: "ACTIVE",
    is_locked: false,
    agreed_price: "350.1234",
  };
  const assignment = await scalar(call("save_accommodation_assignment", stay));
  await eq(
    `select x->>'agreed_price' from jsonb_array_elements(public.read_accommodation('${event}')->'accommodation_assignments')x where x->>'id'='${assignment}'`,
    "350.1234",
  );
  const legacyStay = Object.fromEntries(
    Object.entries(stay).filter(([key]) => key !== "agreed_price"),
  );
  await scalar(
    call("save_accommodation_assignment", legacyStay, assignment, 1),
  );
  await eq(
    `select agreed_price::text from public.accommodation_assignments where id='${assignment}'`,
    "350.1234",
  );
  await denied(
    call(
      "save_accommodation_assignment",
      { ...stay, agreed_price: "Infinity" },
      assignment,
      2,
    ),
    "22023",
  );
  await scalar(
    call(
      "save_accommodation_assignment",
      { ...stay, agreed_price: null },
      assignment,
      2,
    ),
  );
  await eq(
    `select agreed_price is null from public.accommodation_assignments where id='${assignment}'`,
    true,
  );
  const ledger = await scalar(
    `select public.web_command_center('${event}')->'finance'`,
  );
  const request = crypto.randomUUID();
  const bulk = (
    count = 3,
    start = "A01",
    price = "400.0001",
    req = request,
    roomId = room,
  ) =>
    `select public.web_create_beds('${event}','${roomId}','${req}',${count},'${start}',${price === null ? "null" : "'" + price + "'"})`;
  const beds = await scalar(bulk());
  await eq(bulk(), beds);
  await eq(
    `select array_agg(bed_code order by bed_code) from public.sleeping_places where id=any(array[${beds.map((id) => "'" + id + "'::uuid").join(",")}])`,
    ["A01", "A02", "A03"],
  );
  await eq(
    `select sum(listed_price)::text from public.sleeping_places where bed_code like 'A0%'`,
    "1200.0003",
  );
  await denied(bulk(4), "40001");
  await denied(bulk(0, "N1", null, crypto.randomUUID()), "22023");
  await denied(bulk(101, "N1", null, crypto.randomUUID()), "22023");
  await denied(bulk(2, "12A", null, crypto.randomUUID()), "22023");
  await denied(bulk(2, "99999999999", null, crypto.randomUUID()), "22023");
  await denied(bulk(2, "A01", null, crypto.randomUUID()), "23505");
  await scalar(bulk(1, "B2", null, crypto.randomUUID()));
  await denied(bulk(3, "B1", null, crypto.randomUUID()), "23505");
  await eq(
    `select count(*)::int from public.sleeping_places where bed_code in ('B1','B3')`,
    0,
  );
  await denied(bulk(2, "C1", null, crypto.randomUUID(), outsider), "23503");
  await denied(`update public.sleeping_places set listed_price=0`, "42501");
  await denied(`select * from accommodation_private.web_requests`, "42501");
  const foreignEvent = crypto.randomUUID();
  await db.exec(
    `reset role; insert into public.events(id,creation_request_id,name,year,start_date,end_date,base_currency,created_by,updated_by) values('${foreignEvent}',gen_random_uuid(),'Other fixture',2027,'2027-09-01','2027-09-10','USD','${owner}','${owner}'); insert into public.event_members(event_id,user_id,created_by) values('${foreignEvent}','${owner}','${owner}');`,
  );
  await identity(owner);
  const foreignBed = await scalar(
    call("save_sleeping_place", {
      label: "Other event draft",
      is_active: false,
      type: "REGULAR_BED",
    }).replace(event, foreignEvent),
  );
  await denied(
    call("save_accommodation_assignment", {
      ...stay,
      sleeping_place_id: foreignBed,
    }),
    "23503",
  );
  await denied(
    bulk(1, "Foreign", null, crypto.randomUUID(), foreignBed),
    "23503",
  );
  const moveReq = crypto.randomUUID();
  const move = (version = 3, target = beds[0], req = moveReq) =>
    `select public.web_move_stay('${event}','${assignment}',${version},'${target}','${req}')`;
  await denied(move(2), "40001");
  await denied(move(3, outsider), "23503");
  await denied(move(3, foreignBed), "23503");
  await eq(
    `select status from public.accommodation_assignments where id='${assignment}'`,
    "ACTIVE",
  );
  await eq(
    `select version::int from public.accommodation_assignments where id='${assignment}'`,
    3,
  );
  const moved = await scalar(move());
  await eq(move(), moved);
  await eq(
    `select status from public.accommodation_assignments where id='${assignment}'`,
    "CANCELLED",
  );
  await eq(
    `select start_date::text||'/'||end_date::text from public.accommodation_assignments where id='${moved}'`,
    "2027-09-01/2027-09-10",
  );
  await eq(
    `select agreed_price is null from public.accommodation_assignments where id='${moved}'`,
    true,
  );
  await eq(
    `select count(*)::int from public.audit_entries where entity_id='${moved}' and operation='CREATE'`,
    1,
  );
  await scalar(
    call(
      "save_accommodation_assignment",
      { ...stay, sleeping_place_id: beds[0] },
      moved,
      1,
    ),
  );
  const pricedMove = await scalar(
    `select public.web_move_stay('${event}','${moved}',2,'${beds[1]}','${crypto.randomUUID()}')`,
  );
  await eq(
    `select agreed_price::text from public.accommodation_assignments where id='${pricedMove}'`,
    "350.1234",
  );
  await eq(`select public.web_command_center('${event}')->'finance'`, ledger);
  await identity(other);
  await denied(bulk(), "42501");
  await denied(move(), "42501");
  await identity(outsider);
  await denied(`select public.read_accommodation('${event}')`, "42501");
  await denied(bulk(), "42501");
  await denied(move(), "42501");
  await identity("", "anon");
  await denied(bulk(), "42501");
  await denied(move(), "42501");
  await identity(owner);
}
