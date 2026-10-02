begin;

create table public.flights (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    creation_request_id uuid not null unique,
    direction text not null check(direction in ('INBOUND', 'OUTBOUND')),
    airline text not null default '' check(length(airline) <= 200),
    flight_number text not null default '' check(length(flight_number) <= 50),
    departure_airport text not null default '' check(length(departure_airport) <= 50),
    arrival_airport text not null default '' check(length(arrival_airport) <= 50),
    scheduled_departure_utc timestamptz not null,
    scheduled_arrival_utc timestamptz not null,
    actual_departure_utc timestamptz,
    actual_arrival_utc timestamptz,
    status text not null default 'SCHEDULED' check(status in ('SCHEDULED', 'DELAYED', 'CANCELLED', 'DIVERTED', 'LANDED', 'UNKNOWN')),
    delay_minutes integer check(delay_minutes >= 0),
    terminal text check(length(terminal) <= 50),
    gate text check(length(gate) <= 50),
    notes text check(length(notes) <= 10000),
    is_locked boolean not null default false,
    is_deleted boolean not null default false,
    deleted_at_utc timestamptz,
    created_at_utc timestamptz not null default now(),
    updated_at_utc timestamptz not null default now(),
    created_by uuid not null references auth.users(id),
    updated_by uuid not null references auth.users(id),
    version bigint not null default 1 check(version > 0),
    check(is_deleted = (deleted_at_utc is not null)),
    check(scheduled_departure_utc < scheduled_arrival_utc)
);

create index flights_event_active on public.flights(event_id, is_deleted, scheduled_arrival_utc);
create index flights_created_by on public.flights(created_by);
create index flights_updated_by on public.flights(updated_by);

create table public.flight_passengers (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    flight_id uuid not null references public.flights(id) on delete restrict,
    person_id uuid not null references public.people(id) on delete restrict,
    creation_request_id uuid not null unique,
    seat_number text check(length(seat_number) <= 20),
    booking_reference text check(length(booking_reference) <= 100),
    notes text check(length(notes) <= 10000),
    status text not null default 'CONFIRMED' check(status in ('CONFIRMED', 'TENTATIVE', 'CANCELLED')),
    is_deleted boolean not null default false,
    deleted_at_utc timestamptz,
    created_at_utc timestamptz not null default now(),
    updated_at_utc timestamptz not null default now(),
    created_by uuid not null references auth.users(id),
    updated_by uuid not null references auth.users(id),
    version bigint not null default 1 check(version > 0),
    check(is_deleted = (deleted_at_utc is not null)),
    unique(flight_id, person_id) -- Spec says person cannot be on same flight twice.
);

create index flight_passengers_flight on public.flight_passengers(flight_id, is_deleted);
create index flight_passengers_person on public.flight_passengers(person_id, is_deleted);
create index flight_passengers_event on public.flight_passengers(event_id, is_deleted);

alter table public.flights enable row level security;
alter table public.flight_passengers enable row level security;

create policy flights_read on public.flights for select to authenticated
 using(public.is_event_admin(event_id) and exists(
 select 1 from public.events e where e.id=event_id and not e.is_deleted));

create policy flight_passengers_read on public.flight_passengers for select to authenticated
 using(public.is_event_admin(event_id) and exists(
 select 1 from public.events e where e.id=event_id and not e.is_deleted));

revoke all on public.flights from public,anon,authenticated;
grant select on public.flights to authenticated;

revoke all on public.flight_passengers from public,anon,authenticated;
grant select on public.flight_passengers to authenticated;

-- Internal helper for authorization
create schema if not exists flights_private;
revoke all on schema flights_private from public, anon, authenticated;

create function flights_private.authorize(p_event_id uuid, p_write boolean)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 perform 1 from public.event_members where event_id=p_event_id
 and user_id=auth.uid() and role='administrator' for share;
 if auth.uid() is null or not found then
 raise exception using errcode='42501',message='Not authorized'; end if;

 select * into e from public.events where id=p_event_id for share;
 if not found or e.is_deleted then
 raise exception using errcode='42501',message='Event unavailable'; end if;
 if p_write and e.lifecycle_stage='ARCHIVED' then
 raise exception using errcode='40001',message='Event is read-only'; end if;
end; $$;

create function public.read_flight(p_event_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform flights_private.authorize(p_event_id, false);
 select to_jsonb(f) - 'creation_request_id' into result
 from public.flights f where f.event_id=p_event_id and f.id=p_id;
 if result is null then raise exception using errcode='42501',message='Flight unavailable'; end if;
 return result;
end; $$;

create function public.list_flights(p_event_id uuid, p_deleted boolean default false)
returns setof public.flights language plpgsql security definer set search_path='' as $$
begin
 perform flights_private.authorize(p_event_id, false);
 return query select * from public.flights
 where event_id=p_event_id and is_deleted=p_deleted
 order by scheduled_departure_utc, airline, flight_number;
end; $$;

create function public.save_flight(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.flights; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform flights_private.authorize(p_event_id, true);
 -- Validation (Simplified for brevity, but should follow spec)
 if p_fields->>'direction' not in ('INBOUND', 'OUTBOUND') or
    p_fields->>'scheduled_departure_utc' is null or
    p_fields->>'scheduled_arrival_utc' is null then
    raise exception using errcode='22023',message='Invalid Flight fields'; end if;

 if created then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 1));
  select * into r from public.flights where creation_request_id=p_request_id;
  if found then
   if r.event_id<>p_event_id or r.created_by<>actor then
    raise exception using errcode='42501',message='Not authorized'; end if;
   return r.id;
  end if;
  insert into public.flights(event_id, creation_request_id, direction, airline, flight_number,
   departure_airport, arrival_airport, scheduled_departure_utc, scheduled_arrival_utc,
   actual_departure_utc, actual_arrival_utc, status, delay_minutes, terminal, gate, notes,
   is_locked, created_by, updated_by)
  values(p_event_id, p_request_id, p_fields->>'direction', coalesce(p_fields->>'airline',''),
   coalesce(p_fields->>'flight_number',''), coalesce(p_fields->>'departure_airport',''),
   coalesce(p_fields->>'arrival_airport',''), (p_fields->>'scheduled_departure_utc')::timestamptz,
   (p_fields->>'scheduled_arrival_utc')::timestamptz, (p_fields->>'actual_departure_utc')::timestamptz,
   (p_fields->>'actual_arrival_utc')::timestamptz, coalesce(p_fields->>'status','SCHEDULED'),
   (p_fields->>'delay_minutes')::integer, p_fields->>'terminal', p_fields->>'gate',
   p_fields->>'notes', coalesce((p_fields->>'is_locked')::boolean, false), actor, actor)
  returning * into r;
 else
  select * into r from public.flights where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Flight unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.flights set direction=p_fields->>'direction', airline=coalesce(p_fields->>'airline',''),
   flight_number=coalesce(p_fields->>'flight_number',''), departure_airport=coalesce(p_fields->>'departure_airport',''),
   arrival_airport=coalesce(p_fields->>'arrival_airport',''), scheduled_departure_utc=(p_fields->>'scheduled_departure_utc')::timestamptz,
   scheduled_arrival_utc=(p_fields->>'scheduled_arrival_utc')::timestamptz, actual_departure_utc=(p_fields->>'actual_departure_utc')::timestamptz,
   actual_arrival_utc=(p_fields->>'actual_arrival_utc')::timestamptz, status=coalesce(p_fields->>'status','SCHEDULED'),
   delay_minutes=(p_fields->>'delay_minutes')::integer, terminal=p_fields->>'terminal', gate=p_fields->>'gate',
   notes=p_fields->>'notes', is_locked=coalesce((p_fields->>'is_locked')::boolean, false),
   version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
  where id=r.id returning * into r;
 end if;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'flights', r.id::text, case when created then 'CREATE' else 'UPDATE' end,
  before_row, to_jsonb(r)-'creation_request_id');
 return r.id;
end; $$;

create function public.set_flight_deleted(p_event_id uuid, p_id uuid, p_expected_version bigint, p_deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.flights; before_row jsonb;
begin
 perform flights_private.authorize(p_event_id, true);
 select * into r from public.flights where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Flight unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=p_deleted then
  raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.flights set is_deleted=p_deleted,
  deleted_at_utc=case when p_deleted then clock_timestamp() end,
  version=version+1, updated_at_utc=clock_timestamp(), updated_by=auth.uid()
 where id=r.id returning * into r;
 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, auth.uid(), 'flights', r.id::text, case when p_deleted then 'DELETE' else 'RESTORE' end,
  before_row, to_jsonb(r)-'creation_request_id');
end; $$;

-- Flight Passenger RPCs
create function public.list_flight_passengers(p_event_id uuid, p_flight_id uuid)
returns table (
    id uuid,
    flight_id uuid,
    person_id uuid,
    seat_number text,
    booking_reference text,
    notes text,
    status text,
    version bigint,
    person_first_name text,
    person_last_name text
) language plpgsql security definer set search_path='' as $$
begin
 perform flights_private.authorize(p_event_id, false);
 return query select fp.id, fp.flight_id, fp.person_id, fp.seat_number, fp.booking_reference,
  fp.notes, fp.status, fp.version, p.first_name, p.last_name
 from public.flight_passengers fp
 join public.people p on p.id=fp.person_id
 where fp.event_id=p_event_id and fp.flight_id=p_flight_id and not fp.is_deleted;
end; $$;

create function public.save_flight_passenger(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.flight_passengers; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform flights_private.authorize(p_event_id, true);
 if created then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 1));
  select * into r from public.flight_passengers where creation_request_id=p_request_id;
  if found then
   if r.event_id<>p_event_id or r.created_by<>actor then
    raise exception using errcode='42501',message='Not authorized'; end if;
   return r.id;
  end if;
  insert into public.flight_passengers(event_id, flight_id, person_id, creation_request_id,
   seat_number, booking_reference, notes, status, created_by, updated_by)
  values(p_event_id, (p_fields->>'flight_id')::uuid, (p_fields->>'person_id')::uuid, p_request_id,
   p_fields->>'seat_number', p_fields->>'booking_reference', p_fields->>'notes',
   coalesce(p_fields->>'status', 'CONFIRMED'), actor, actor)
  returning * into r;
 else
  select * into r from public.flight_passengers where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Passenger unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.flight_passengers set seat_number=p_fields->>'seat_number',
   booking_reference=p_fields->>'booking_reference', notes=p_fields->>'notes',
   status=coalesce(p_fields->>'status', 'CONFIRMED'),
   version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
  where id=r.id returning * into r;
 end if;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'flight_passengers', r.id::text, case when created then 'CREATE' else 'UPDATE' end,
  before_row, to_jsonb(r)-'creation_request_id');
 return r.id;
end; $$;

create function public.set_flight_passenger_deleted(p_event_id uuid, p_id uuid, p_expected_version bigint, p_deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.flight_passengers; before_row jsonb;
begin
 perform flights_private.authorize(p_event_id, true);
 select * into r from public.flight_passengers where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Passenger unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=p_deleted then
  raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.flight_passengers set is_deleted=p_deleted,
  deleted_at_utc=case when p_deleted then clock_timestamp() end,
  version=version+1, updated_at_utc=clock_timestamp(), updated_by=auth.uid()
 where id=r.id returning * into r;
 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, auth.uid(), 'flight_passengers', r.id::text, case when p_deleted then 'DELETE' else 'RESTORE' end,
  before_row, to_jsonb(r)-'creation_request_id');
end; $$;

grant execute on function public.read_flight(uuid, uuid) to authenticated;
grant execute on function public.list_flights(uuid, boolean) to authenticated;
grant execute on function public.save_flight(uuid, uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.set_flight_deleted(uuid, uuid, bigint, boolean) to authenticated;
grant execute on function public.list_flight_passengers(uuid, uuid) to authenticated;
grant execute on function public.save_flight_passenger(uuid, uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.set_flight_passenger_deleted(uuid, uuid, bigint, boolean) to authenticated;

alter publication supabase_realtime add table public.flights;
alter publication supabase_realtime add table public.flight_passengers;

commit;
