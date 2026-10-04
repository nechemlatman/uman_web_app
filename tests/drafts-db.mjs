export async function draftChecks({
  db,
  scalar,
  eq,
  denied,
  identity,
  call,
  owner,
  outsider,
  event,
}) {
  await identity(owner);
  let partial;
  for (const key of [
    "first_name",
    "last_name",
    "hebrew_first_name",
    "hebrew_last_name",
    "phone",
    "whatsapp_phone",
    "email",
    "passport_name",
    "notes",
  ]) {
    const fields = {
      status: "ACTIVE",
      custom_fields: {},
      [key]: key === "email" ? "partial@example.test" : "Partial " + key,
    };
    const id = await scalar(call("save_person", fields));
    await eq(
      `select public.read_person('${event}','${id}')->>'${key}'`,
      fields[key],
    );
    if (key === "email") partial = id;
  }
  await denied(
    call("save_person", {
      first_name: " ",
      notes: "\t",
      status: "ACTIVE",
      custom_fields: {},
    }),
    "22023",
  );
  await eq(
    `select count(*)::int from public.web_list_people('${event}','partial@example.test')x where x->>'id'='${partial}'`,
    1,
  );
  await eq(
    `select x->>'display_label' from public.web_list_people('${event}','partial@example.test')x where x->>'id'='${partial}'`,
    "partial@example.test",
  );
  await eq(
    `select x ? 'passport_number' or x ? 'notes' or x ? 'email' from public.web_list_people('${event}','partial@example.test')x where x->>'id'='${partial}'`,
    false,
  );
  const completed = {
    first_name: "Completed",
    email: "partial@example.test",
    status: "ACTIVE",
    custom_fields: {},
  };
  await scalar(call("save_person", completed, partial, 1));
  await denied(call("save_person", completed, partial, 1), "40001");
  await eq(
    `select first_name from public.people where id='${partial}'`,
    "Completed",
  );
  await scalar(
    `select public.set_person_deleted('${event}','${partial}',2,true)`,
  );
  await scalar(
    `select public.set_person_deleted('${event}','${partial}',3,false)`,
  );
  await eq(`select is_deleted from public.people where id='${partial}'`, false);
  const driver = {
    full_name: null,
    phone_number: "123456",
    status: "UNAVAILABLE",
    notes: "Supplier contact",
  };
  const req = crypto.randomUUID(),
    d = await scalar(call("save_driver", driver, null, null, req));
  await eq(call("save_driver", driver, null, null, req), d);
  await denied(
    call("save_driver", { ...driver, notes: "Changed" }, null, null, req),
    "40001",
  );
  await denied(
    call("save_driver", { ...driver, status: "AVAILABLE" }, d, 1),
    "23514",
  );
  await scalar(
    call(
      "save_driver",
      { ...driver, full_name: "Driver", status: "AVAILABLE" },
      d,
      1,
    ),
  );
  await eq(`select status from public.drivers where id='${d}'`, "AVAILABLE");
  await denied(
    call("save_driver", { full_name: null, status: "UNAVAILABLE" }),
    "23514",
  );
  const vehicle = {
    name: null,
    vehicle_type: "VAN",
    capacity: null,
    license_plate: "ABC123",
    status: "UNAVAILABLE",
  };
  const v = await scalar(call("save_vehicle", vehicle));
  await eq(
    `select capacity is null from public.vehicles where id='${v}'`,
    true,
  );
  await denied(
    call("save_vehicle", { ...vehicle, status: "AVAILABLE" }, v, 1),
    "23514",
  );
  await scalar(
    call(
      "save_vehicle",
      { ...vehicle, name: "Van", capacity: 8, status: "AVAILABLE" },
      v,
      1,
    ),
  );
  await eq(`select capacity from public.vehicles where id='${v}'`, 8);
  const a = await scalar(
    call("save_apartment", { name: null, status: "ACTIVE" }),
  );
  const r = await scalar(
    call("save_room", { name_or_number: null, apartment_id: a }),
  );
  const b = await scalar(
    call("save_sleeping_place", { room_id: r, is_active: false }),
  );
  await eq(`select name is null from public.apartments where id='${a}'`, true);
  await eq(
    `select name_or_number is null from public.rooms where id='${r}'`,
    true,
  );
  await denied(
    call("save_sleeping_place", { room_id: r, is_active: true }, b, 1),
    "23514",
  );
  await scalar(
    call(
      "save_sleeping_place",
      { room_id: r, type: "REGULAR_BED", is_active: true },
      b,
      1,
    ),
  );
  await eq(
    `select is_active from public.sleeping_places where id='${b}'`,
    true,
  );
  const stay = await scalar(
    call("save_accommodation_assignment", {
      status: "DRAFT",
      is_locked: false,
      notes: "Awaiting participant",
    }),
  );
  await denied(
    call(
      "save_accommodation_assignment",
      { status: "ACTIVE", is_locked: false },
      stay,
      1,
    ),
    "23514",
  );
  await scalar(
    call(
      "save_accommodation_assignment",
      {
        status: "ACTIVE",
        is_locked: false,
        person_id: partial,
        sleeping_place_id: b,
        start_date: "2027-09-01",
        end_date: "2027-09-10",
      },
      stay,
      1,
    ),
  );
  await eq(
    `select status from public.accommodation_assignments where id='${stay}'`,
    "ACTIVE",
  );
  for (const [kind, status, active] of [
    ["flight", "DRAFT", "SCHEDULED"],
    ["trip", "PLANNED", "CONFIRMED"],
  ]) {
    const f = {
      direction: "INBOUND",
      status,
      is_locked: false,
      notes: "Confirm route",
    };
    const id = await scalar(call("save_" + kind, f));
    await denied(
      call("save_" + kind, { ...f, status: active }, id, 1),
      kind === "flight" ? "22023" : "23514",
    );
    const complete = {
      ...f,
      status: active,
      scheduled_departure_utc: "2027-09-01T10:00:00Z",
      scheduled_arrival_utc: "2027-09-01T12:00:00Z",
      ...(kind === "flight"
        ? {
            airline: "Air",
            flight_number: "AA123",
            departure_airport: "TLV",
            arrival_airport: "KIV",
          }
        : { origin: "Airport", destination: "Uman" }),
    };
    await scalar(call("save_" + kind, complete, id, 1));
    await eq(
      `select status from public.${kind === "flight" ? "flights" : "trips"} where id='${id}'`,
      active,
    );
  }
  for (const [kind, status] of [
    ["task", "NEW"],
    ["apartment_issue", "OPEN"],
  ]) {
    const f = {
      description: "Useful description only",
      priority: "MEDIUM",
      status,
    };
    const id = await scalar(call("save_" + kind, f));
    const tab = kind === "task" ? "tasks" : "apartment_issues";
    await eq(`select title is null from public.${tab} where id='${id}'`, true);
    await denied(call("save_" + kind, { priority: "MEDIUM", status }), "23514");
    if (kind === "apartment_issue") {
      await denied(
        call("save_" + kind, { ...f, status: "IN_PROGRESS" }, id, 1),
        "23514",
      );
      await scalar(
        call(
          "save_" + kind,
          { ...f, status: "IN_PROGRESS", apartment_id: a },
          id,
          1,
        ),
      );
      await eq(
        `select status from public.${tab} where id='${id}'`,
        "IN_PROGRESS",
      );
    }
  }
  await eq(
    `select jsonb_typeof(public.read_accommodation('${event}')->'sleeping_places')`,
    "array",
  );
  await denied(`update public.people set first_name=''`, "42501");
  await identity(outsider);
  await denied(`select * from public.web_list_people('${event}')`, "42501");
  await denied(
    call("save_person", { notes: "Unauthorized", status: "ACTIVE" }),
    "42501",
  );
  await identity("", "anon");
  await denied(`select * from public.web_list_people('${event}')`, "42501");
  await identity(owner);
  // No direct access to private details, even for event managers.
  await denied("select * from people_private.person_details", "42501");
  await db.query("select 1");
}
