begin;
-- TASK-FORM-01: nullable draft metadata; identity/security/history remain intact.
alter table public.events alter column year drop not null, alter column start_date drop not null,
 alter column end_date drop not null, alter column base_currency drop not null;
alter table public.flights alter column airline drop not null, alter column airline drop default,
 alter column flight_number drop not null, alter column flight_number drop default,
 alter column departure_airport drop not null, alter column departure_airport drop default,
 alter column arrival_airport drop not null, alter column arrival_airport drop default,
 alter column scheduled_departure_utc drop not null, alter column scheduled_arrival_utc drop not null,
 alter column status set default 'DRAFT', drop constraint flights_status_check;
alter table public.flights add constraint flights_status_check check(status in ('DRAFT','SCHEDULED','DELAYED','CANCELLED','DIVERTED','LANDED','UNKNOWN'));
alter table public.trips alter column origin drop not null, alter column destination drop not null,
 alter column scheduled_departure_utc drop not null, alter column scheduled_arrival_utc drop not null;
alter table public.trips add constraint trips_operational_complete check(status not in ('CONFIRMED','IN_PROGRESS','COMPLETED') or
 (origin is not null and destination is not null and scheduled_departure_utc is not null and scheduled_arrival_utc is not null));
-- Existing CHECKs still validate provided values; SQL null is genuinely unknown.
create or replace function public.edit_event_details(p_id uuid, p_expected_version bigint,
  p_name text, p_hebrew_name text, p_description text, p_manager_notes text,
  p_year integer, p_start_date date, p_end_date date, p_base_currency text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then
    raise exception using errcode='42501', message='Not authorized';
  end if;
  if p_expected_version is null or p_expected_version < 1 or
    p_name is null or length(btrim(p_name)) not between 1 and 200 or
    length(p_hebrew_name) > 200 or length(p_description) > 10000 or
    length(p_manager_notes) > 10000 or p_year not between 1900 and 2200 or
    p_end_date < p_start_date or
    p_base_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='22023', message='Invalid Event fields';
  end if;
  update public.events set name=p_name, hebrew_name=p_hebrew_name,
    description=p_description, manager_notes=p_manager_notes, year=p_year,
    start_date=p_start_date, end_date=p_end_date, base_currency=p_base_currency,
    version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
    where id=p_id and version=p_expected_version and not is_deleted
      and lifecycle_stage <> 'ARCHIVED' returning * into result;
  if not found then raise exception using errcode='40001', message='Record changed or is read-only'; end if;
  return result;
end;
$$;
create or replace function public.transition_event(p_id uuid, p_expected_version bigint, p_stage text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then raise exception using errcode='42501', message='Not authorized'; end if;
  select * into result from public.events where id=p_id for update;
  if not found or result.version is distinct from p_expected_version or result.is_deleted
    or result.lifecycle_stage='ARCHIVED' then
    raise exception using errcode='40001', message='Record changed or is read-only';
  end if;
  if p_stage is null or not (
    (result.lifecycle_stage='READY' and p_stage in ('PLANNING','TRAVEL')) or
    (result.lifecycle_stage='TRAVEL' and p_stage='IN_UMAN') or
    (result.lifecycle_stage='IN_UMAN' and p_stage='DEPARTURE') or
    (result.lifecycle_stage='DEPARTURE' and p_stage='CLOSEOUT')) then
    raise exception using errcode='22023', message='Transition unavailable';
  end if;
  if p_stage in ('TRAVEL','IN_UMAN','DEPARTURE') and (result.year is null or result.start_date is null or result.end_date is null or result.base_currency is null) then
    raise exception using errcode='22023',message='Complete event year, dates and currency before an operational stage';
  end if;
  update public.events set lifecycle_stage=p_stage, version=version+1,
    updated_at_utc=clock_timestamp(), updated_by=actor where id=p_id returning * into result;
  return result;
end;
$$;
create or replace function flights_private.validate_fields(p_fields jsonb)
returns void language plpgsql set search_path='' as $$
begin
    if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
        raise exception using errcode='22023', message='Invalid Flight fields';
    end if;

    if p_fields->>'direction' is null or p_fields->>'direction' not in ('INBOUND', 'OUTBOUND') then
        raise exception using errcode='22023', message='Invalid direction';
    end if;

    if length(coalesce(p_fields->>'airline', '')) > 200 then
        raise exception using errcode='22023', message='Airline name too long';
    end if;

    if length(coalesce(p_fields->>'flight_number', '')) > 50 then
        raise exception using errcode='22023', message='Flight number too long';
    end if;

    -- Operational completeness belongs at the explicit status action boundary.
    -- Legacy rows remain byte-for-byte unchanged, including historical statuses.
    if coalesce(p_fields->>'status','DRAFT') in ('SCHEDULED','DELAYED','DIVERTED','LANDED') and (
      nullif(btrim(p_fields->>'airline'),'') is null or nullif(btrim(p_fields->>'flight_number'),'') is null or
      nullif(btrim(p_fields->>'departure_airport'),'') is null or nullif(btrim(p_fields->>'arrival_airport'),'') is null or
      p_fields->>'scheduled_departure_utc' is null or p_fields->>'scheduled_arrival_utc' is null) then
      raise exception using errcode='22023',message='Complete airline, flight number, route and schedule for operational status; use DRAFT to finish later';
    end if;

    if (p_fields->>'scheduled_departure_utc')::timestamptz >= (p_fields->>'scheduled_arrival_utc')::timestamptz then
        raise exception using errcode='23514', message='Departure must be before arrival';
    end if;
end;
$$;
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
  values(p_event_id, p_request_id, p_fields->>'direction', nullif(btrim(p_fields->>'airline'),''),
   nullif(btrim(p_fields->>'flight_number'),''), nullif(btrim(p_fields->>'departure_airport'),''),
   nullif(btrim(p_fields->>'arrival_airport'),''), (p_fields->>'scheduled_departure_utc')::timestamptz,
   (p_fields->>'scheduled_arrival_utc')::timestamptz, (p_fields->>'actual_departure_utc')::timestamptz,
   (p_fields->>'actual_arrival_utc')::timestamptz, coalesce(p_fields->>'status','DRAFT'),
   (p_fields->>'delay_minutes')::integer, p_fields->>'terminal', p_fields->>'gate',
   p_fields->>'notes', coalesce((p_fields->>'is_locked')::boolean, false), actor, actor)
  returning * into r;
 else
  select * into r from public.flights where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Flight unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.flights set direction=p_fields->>'direction', airline=nullif(btrim(p_fields->>'airline'),''),
   flight_number=nullif(btrim(p_fields->>'flight_number'),''), departure_airport=nullif(btrim(p_fields->>'departure_airport'),''),
   arrival_airport=nullif(btrim(p_fields->>'arrival_airport'),''), scheduled_departure_utc=(p_fields->>'scheduled_departure_utc')::timestamptz,
   scheduled_arrival_utc=(p_fields->>'scheduled_arrival_utc')::timestamptz, actual_departure_utc=(p_fields->>'actual_departure_utc')::timestamptz,
   actual_arrival_utc=(p_fields->>'actual_arrival_utc')::timestamptz, status=coalesce(p_fields->>'status','DRAFT'),
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
-- CREATE OR REPLACE retains the restricted ACLs of these existing routines.
-- No row UPDATE, DELETE, synthetic backfill or audit rewrite is performed.
commit;

