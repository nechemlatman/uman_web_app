begin;

-- 1. Ensure flights table has a unique constraint on (event_id, id) to allow composite FKs.
alter table public.flights add unique (event_id, id);

-- 2. Repair flight_passengers integrity by using composite foreign keys.
-- This ensures flight_id and person_id belong to the SAME event_id as the passenger row.
alter table public.flight_passengers
    drop constraint flight_passengers_event_id_fkey,
    drop constraint flight_passengers_flight_id_fkey,
    drop constraint flight_passengers_person_id_fkey;

alter table public.flight_passengers
    add constraint flight_passengers_event_id_fkey
        foreign key (event_id) references public.events(id) on delete restrict,
    add constraint flight_passengers_flight_event_fkey
        foreign key (event_id, flight_id) references public.flights(event_id, id) on delete restrict,
    add constraint flight_passengers_person_event_fkey
        foreign key (event_id, person_id) references public.people(event_id, id) on delete restrict;

-- 3. Improve RPC validation for flights.
create function flights_private.validate_fields(p_fields jsonb)
returns void language plpgsql set search_path='' as $$
begin
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        raise exception using errcode='22023', message='Invalid Flight fields';
    end if;

    if p_fields->>'direction' not in ('INBOUND', 'OUTBOUND') then
        raise exception using errcode='22023', message='Invalid direction';
    end if;

    if length(coalesce(p_fields->>'airline', '')) > 200 then
        raise exception using errcode='22023', message='Airline name too long';
    end if;

    if length(coalesce(p_fields->>'flight_number', '')) > 50 then
        raise exception using errcode='22023', message='Flight number too long';
    end if;

    if p_fields->>'scheduled_departure_utc' is null or p_fields->>'scheduled_arrival_utc' is null then
        raise exception using errcode='22023', message='Missing schedule';
    end if;

    if (p_fields->>'scheduled_departure_utc')::timestamptz >= (p_fields->>'scheduled_arrival_utc')::timestamptz then
        raise exception using errcode='23514', message='Departure must be before arrival';
    end if;
end;
$$;

-- 4. Update save_flight to use the new validator.
create or replace function public.save_flight(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.flights; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform flights_private.authorize(p_event_id, true);
 perform flights_private.validate_fields(p_fields);

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

-- 5. Support search in list_flights.
create or replace function public.list_flights(p_event_id uuid, p_query text default '', p_deleted boolean default false)
returns setof public.flights language plpgsql security definer set search_path='' as $$
begin
 perform flights_private.authorize(p_event_id, false);
 return query select * from public.flights
 where event_id=p_event_id and is_deleted=p_deleted
 and (p_query = '' or
      airline ilike '%' || p_query || '%' or
      flight_number ilike '%' || p_query || '%' or
      departure_airport ilike '%' || p_query || '%' or
      arrival_airport ilike '%' || p_query || '%')
 order by scheduled_departure_utc, airline, flight_number;
end; $$;

commit;
