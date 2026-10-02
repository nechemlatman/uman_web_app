begin;

-- ==========================================
-- 1. DRIVERS TABLE
-- ==========================================
create table public.drivers (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    creation_request_id uuid not null unique,
    full_name text not null check(length(full_name) > 0 and length(full_name) <= 200),
    phone_number text not null default '' check(length(phone_number) <= 50),
    license_number text not null default '' check(length(license_number) <= 100),
    notes text check(length(notes) <= 10000),
    status text not null default 'ACTIVE' check(status in ('ACTIVE', 'INACTIVE')),
    is_deleted boolean not null default false,
    deleted_at_utc timestamptz,
    created_at_utc timestamptz not null default now(),
    updated_at_utc timestamptz not null default now(),
    created_by uuid not null references auth.users(id),
    updated_by uuid not null references auth.users(id),
    version bigint not null default 1 check(version > 0),
    check(is_deleted = (deleted_at_utc is not null)),
    unique (event_id, id)
);

create index drivers_event_active on public.drivers(event_id, is_deleted, full_name);
create index drivers_created_by on public.drivers(created_by);
create index drivers_updated_by on public.drivers(updated_by);

-- ==========================================
-- 2. VEHICLES TABLE
-- ==========================================
create table public.vehicles (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    creation_request_id uuid not null unique,
    name text not null check(length(name) > 0 and length(name) <= 100),
    vehicle_type text not null default 'VAN' check(vehicle_type in ('CAR', 'VAN', 'MINIBUS', 'BUS', 'CUSTOM')),
    license_plate text not null default '' check(length(license_plate) <= 50),
    capacity integer not null default 1 check(capacity >= 1),
    status text not null default 'AVAILABLE' check(status in ('AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE')),
    notes text check(length(notes) <= 10000),
    is_deleted boolean not null default false,
    deleted_at_utc timestamptz,
    created_at_utc timestamptz not null default now(),
    updated_at_utc timestamptz not null default now(),
    created_by uuid not null references auth.users(id),
    updated_by uuid not null references auth.users(id),
    version bigint not null default 1 check(version > 0),
    check(is_deleted = (deleted_at_utc is not null)),
    unique (event_id, id)
);

create index vehicles_event_active on public.vehicles(event_id, is_deleted, name);
create index vehicles_created_by on public.vehicles(created_by);
create index vehicles_updated_by on public.vehicles(updated_by);

-- ==========================================
-- 3. RLS & PERMISSIONS
-- ==========================================
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;

create policy drivers_read on public.drivers for select to authenticated
 using(public.is_event_admin(event_id) and exists(
 select 1 from public.events e where e.id=event_id and not e.is_deleted));

create policy vehicles_read on public.vehicles for select to authenticated
 using(public.is_event_admin(event_id) and exists(
 select 1 from public.events e where e.id=event_id and not e.is_deleted));

revoke all on public.drivers from public,anon,authenticated;
grant select on public.drivers to authenticated;

revoke all on public.vehicles from public,anon,authenticated;
grant select on public.vehicles to authenticated;

-- ==========================================
-- 4. PRIVATE AUTHORIZATION HELPERS
-- ==========================================
create schema if not exists transport_private;
revoke all on schema transport_private from public, anon, authenticated;

create function transport_private.authorize(p_event_id uuid, p_write boolean)
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

-- ==========================================
-- 5. DRIVER RPCs
-- ==========================================
create function public.read_driver(p_event_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id, false);
 select to_jsonb(d) - 'creation_request_id' into result
 from public.drivers d where d.event_id=p_event_id and d.id=p_id;
 if result is null then raise exception using errcode='42501',message='Driver unavailable'; end if;
 return result;
end; $$;

create function public.list_drivers(p_event_id uuid, p_query text default '', p_deleted boolean default false)
returns setof public.drivers language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id, false);
 return query select * from public.drivers
 where event_id=p_event_id and is_deleted=p_deleted
 and (p_query = '' or
      full_name ilike '%' || p_query || '%' or
      phone_number ilike '%' || p_query || '%' or
      license_number ilike '%' || p_query || '%')
 order by full_name;
end; $$;

create function public.save_driver(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.drivers; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform transport_private.authorize(p_event_id, true);

 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or
    length(coalesce(p_fields->>'full_name', '')) = 0 or
    length(coalesce(p_fields->>'full_name', '')) > 200 or
    p_fields->>'status' not in ('ACTIVE', 'INACTIVE') then
  raise exception using errcode='22023',message='Invalid Driver fields';
 end if;

 if created then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 1));
  select * into r from public.drivers where creation_request_id=p_request_id;
  if found then
   if r.event_id<>p_event_id or r.created_by<>actor then
    raise exception using errcode='42501',message='Not authorized'; end if;
   return r.id;
  end if;
  insert into public.drivers(event_id, creation_request_id, full_name, phone_number,
   license_number, notes, status, created_by, updated_by)
  values(p_event_id, p_request_id, p_fields->>'full_name', coalesce(p_fields->>'phone_number',''),
   coalesce(p_fields->>'license_number',''), p_fields->>'notes', coalesce(p_fields->>'status','ACTIVE'), actor, actor)
  returning * into r;
 else
  select * into r from public.drivers where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Driver unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.drivers set full_name=p_fields->>'full_name', phone_number=coalesce(p_fields->>'phone_number',''),
   license_number=coalesce(p_fields->>'license_number',''), notes=p_fields->>'notes',
   status=coalesce(p_fields->>'status','ACTIVE'),
   version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
  where id=r.id returning * into r;
 end if;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'drivers', r.id::text, case when created then 'CREATE' else 'UPDATE' end,
  before_row, to_jsonb(r)-'creation_request_id');
 return r.id;
end; $$;

create function public.delete_driver(p_event_id uuid, p_id uuid, p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.drivers; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id, true);
 select * into r from public.drivers where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Driver unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted then
  raise exception using errcode='40001',message='Record changed'; end if;

 update public.drivers set is_deleted=true, deleted_at_utc=clock_timestamp(),
  version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
 where id=r.id returning * into r;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'drivers', r.id::text, 'DELETE', to_jsonb(r)-'creation_request_id', null);
end; $$;

-- ==========================================
-- 6. VEHICLE RPCs
-- ==========================================
create function public.read_vehicle(p_event_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id, false);
 select to_jsonb(v) - 'creation_request_id' into result
 from public.vehicles v where v.event_id=p_event_id and v.id=p_id;
 if result is null then raise exception using errcode='42501',message='Vehicle unavailable'; end if;
 return result;
end; $$;

create function public.list_vehicles(p_event_id uuid, p_query text default '', p_deleted boolean default false)
returns setof public.vehicles language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id, false);
 return query select * from public.vehicles
 where event_id=p_event_id and is_deleted=p_deleted
 and (p_query = '' or
      name ilike '%' || p_query || '%' or
      license_plate ilike '%' || p_query || '%' or
      vehicle_type ilike '%' || p_query || '%')
 order by name;
end; $$;

create function public.save_vehicle(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.vehicles; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform transport_private.authorize(p_event_id, true);

 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or
    length(coalesce(p_fields->>'name', '')) = 0 or
    length(coalesce(p_fields->>'name', '')) > 100 or
    p_fields->>'vehicle_type' not in ('CAR', 'VAN', 'MINIBUS', 'BUS', 'CUSTOM') or
    p_fields->>'status' not in ('AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE') or
    coalesce((p_fields->>'capacity')::integer, 0) < 1 then
  raise exception using errcode='22023',message='Invalid Vehicle fields';
 end if;

 if created then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 1));
  select * into r from public.vehicles where creation_request_id=p_request_id;
  if found then
   if r.event_id<>p_event_id or r.created_by<>actor then
    raise exception using errcode='42501',message='Not authorized'; end if;
   return r.id;
  end if;
  insert into public.vehicles(event_id, creation_request_id, name, vehicle_type,
   license_plate, capacity, status, notes, created_by, updated_by)
  values(p_event_id, p_request_id, p_fields->>'name', coalesce(p_fields->>'vehicle_type','VAN'),
   coalesce(p_fields->>'license_plate',''), (p_fields->>'capacity')::integer,
   coalesce(p_fields->>'status','AVAILABLE'), p_fields->>'notes', actor, actor)
  returning * into r;
 else
  select * into r from public.vehicles where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Vehicle unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.vehicles set name=p_fields->>'name', vehicle_type=coalesce(p_fields->>'vehicle_type','VAN'),
   license_plate=coalesce(p_fields->>'license_plate',''), capacity=(p_fields->>'capacity')::integer,
   status=coalesce(p_fields->>'status','AVAILABLE'), notes=p_fields->>'notes',
   version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
  where id=r.id returning * into r;
 end if;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'vehicles', r.id::text, case when created then 'CREATE' else 'UPDATE' end,
  before_row, to_jsonb(r)-'creation_request_id');
 return r.id;
end; $$;

create function public.delete_vehicle(p_event_id uuid, p_id uuid, p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.vehicles; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id, true);
 select * into r from public.vehicles where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Vehicle unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted then
  raise exception using errcode='40001',message='Record changed'; end if;

 update public.vehicles set is_deleted=true, deleted_at_utc=clock_timestamp(),
  version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
 where id=r.id returning * into r;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'vehicles', r.id::text, 'DELETE', to_jsonb(r)-'creation_request_id', null);
end; $$;

commit;
