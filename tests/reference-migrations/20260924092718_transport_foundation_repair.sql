begin;
-- Owner-approved 2026-09-24 mapping; never infer BUSY or OFF_DUTY.
-- Pending migration: staging history checked 2026-09-24; not deployed there.
-- Existing-row upgrades follow supabase/provision.example.sql: a trusted operator
-- must set request.jwt.claim.sub to the actual approving Auth administrator in
-- this session before applying. Never substitute the previous record editor.
-- Empty installs need no data-migration actor because they emit no data audit.
do $$
begin
 if exists(select 1 from public.drivers) and
    (auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid())) then
  raise exception using errcode='42501',message='Explicit approving audit actor required for legacy Driver migration';
 end if;
end; $$;
alter table public.drivers drop constraint drivers_status_check;
with before_rows as materialized (select * from public.drivers), changed as (
 update public.drivers set status=case status when 'ACTIVE' then 'AVAILABLE' else 'UNAVAILABLE' end,
 version=version+1, updated_at_utc=clock_timestamp(), updated_by=auth.uid() returning *
)
insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
select c.event_id,auth.uid(),'drivers',c.id::text,'UPDATE',to_jsonb(b)-'creation_request_id',
 (to_jsonb(c)-'creation_request_id') || '{"migration":"owner-approved legacy status mapping"}'::jsonb
from changed c join before_rows b on b.id=c.id;
alter table public.drivers alter column status set default 'AVAILABLE';
alter table public.drivers add constraint drivers_status_check check(status in ('AVAILABLE','BUSY','UNAVAILABLE','OFF_DUTY'));
alter table public.drivers add column whatsapp_phone text check(length(whatsapp_phone)<=50);
alter table public.vehicles add column color text check(length(color)<=100);
alter table public.vehicles drop constraint vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check check(status in ('AVAILABLE','IN_USE','MAINTENANCE','UNAVAILABLE'));

create or replace function public.read_driver(p_event_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id, false);
 select to_jsonb(d) - 'creation_request_id' into result
 from public.drivers d where d.event_id=p_event_id and d.id=p_id;
 return result;
end; $$;

create or replace function public.list_drivers(p_event_id uuid, p_query text default '', p_deleted boolean default false)
returns setof public.drivers language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id, false);
 return query select * from public.drivers
 where event_id=p_event_id and is_deleted=p_deleted
 and (p_query = '' or
      full_name ilike '%' || p_query || '%' or
      phone_number ilike '%' || p_query || '%' or
      coalesce(whatsapp_phone,'') ilike '%' || p_query || '%' or
      coalesce(notes,'') ilike '%' || p_query || '%' or
      license_number ilike '%' || p_query || '%')
 order by full_name;
end; $$;

create or replace function public.save_driver(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.drivers; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform transport_private.authorize(p_event_id, true);

 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or
    length(btrim(coalesce(p_fields->>'full_name', ''))) = 0 or
    length(coalesce(p_fields->>'full_name', '')) > 200 or
    coalesce(p_fields->>'status','') not in ('AVAILABLE', 'BUSY', 'UNAVAILABLE', 'OFF_DUTY') then
  raise exception using errcode='22023',message='Invalid Driver fields';
 end if;

 if created then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 1));
  select * into r from public.drivers where creation_request_id=p_request_id;
  if found then
   if r.event_id<>p_event_id or r.created_by<>actor then
    raise exception using errcode='42501',message='Not authorized'; end if;
   if exists(select 1 from public.audit_entries a where a.entity_type='drivers' and a.entity_id=r.id::text and a.operation='CREATE' and (coalesce(a.new_value->>'full_name','') is distinct from coalesce(p_fields->>'full_name','') or
      coalesce(a.new_value->>'phone_number','') is distinct from coalesce(p_fields->>'phone_number','') or
      coalesce(a.new_value->>'license_number','') is distinct from coalesce(p_fields->>'license_number','') or
      coalesce(a.new_value->>'whatsapp_phone','') is distinct from coalesce(p_fields->>'whatsapp_phone','') or
      coalesce(a.new_value->>'notes','') is distinct from coalesce(p_fields->>'notes','') or
      coalesce(a.new_value->>'status','') is distinct from coalesce(p_fields->>'status',''))) then
    raise exception using errcode='40001',message='Creation request payload changed'; end if;
   return r.id;
  end if;
  insert into public.drivers(event_id, creation_request_id, full_name, phone_number,
   license_number, whatsapp_phone, notes, status, created_by, updated_by)
  values(p_event_id, p_request_id, p_fields->>'full_name', coalesce(p_fields->>'phone_number',''),
   coalesce(p_fields->>'license_number',''), nullif(p_fields->>'whatsapp_phone',''), p_fields->>'notes', coalesce(p_fields->>'status','AVAILABLE'), actor, actor)
  returning * into r;
 else
  select * into r from public.drivers where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Driver unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.drivers set full_name=p_fields->>'full_name', phone_number=coalesce(p_fields->>'phone_number',''),
   license_number=coalesce(p_fields->>'license_number',''), whatsapp_phone=nullif(p_fields->>'whatsapp_phone',''), notes=p_fields->>'notes',
   status=coalesce(p_fields->>'status','AVAILABLE'),
   version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
  where id=r.id returning * into r;
 end if;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'drivers', r.id::text, case when created then 'CREATE' else 'UPDATE' end,
  before_row, to_jsonb(r)-'creation_request_id');
 return r.id;
end; $$;

create or replace function public.delete_driver(p_event_id uuid, p_id uuid, p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.drivers; before_row jsonb; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id,true);
 select * into r from public.drivers where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Record unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=true then
  raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.drivers set is_deleted=true, deleted_at_utc=clock_timestamp(),
 version=version+1,updated_at_utc=clock_timestamp(),updated_by=actor where id=r.id returning * into r;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,'drivers',r.id::text,'DELETE',before_row,to_jsonb(r)-'creation_request_id');
end; $$;

create or replace function public.restore_driver(p_event_id uuid, p_id uuid, p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.drivers; before_row jsonb; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id,true);
 select * into r from public.drivers where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Record unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=false then
  raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.drivers set is_deleted=false, deleted_at_utc=null,
 version=version+1,updated_at_utc=clock_timestamp(),updated_by=actor where id=r.id returning * into r;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,'drivers',r.id::text,'RESTORE',before_row,to_jsonb(r)-'creation_request_id');
end; $$;

revoke all on function public.read_driver(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_driver(uuid,uuid) to authenticated;
revoke all on function public.list_drivers(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.list_drivers(uuid,text,boolean) to authenticated;
revoke all on function public.save_driver(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_driver(uuid,uuid,uuid,bigint,jsonb) to authenticated;
revoke all on function public.delete_driver(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.delete_driver(uuid,uuid,bigint) to authenticated;
revoke all on function public.restore_driver(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.restore_driver(uuid,uuid,bigint) to authenticated;
create or replace function public.read_vehicle(p_event_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id, false);
 select to_jsonb(v) - 'creation_request_id' into result
 from public.vehicles v where v.event_id=p_event_id and v.id=p_id;
 return result;
end; $$;

create or replace function public.list_vehicles(p_event_id uuid, p_query text default '', p_deleted boolean default false)
returns setof public.vehicles language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id, false);
 return query select * from public.vehicles
 where event_id=p_event_id and is_deleted=p_deleted
 and (p_query = '' or
      name ilike '%' || p_query || '%' or
      license_plate ilike '%' || p_query || '%' or
      coalesce(color,'') ilike '%' || p_query || '%' or
      coalesce(notes,'') ilike '%' || p_query || '%' or
      vehicle_type ilike '%' || p_query || '%')
 order by name;
end; $$;

create or replace function public.save_vehicle(p_event_id uuid, p_request_id uuid, p_id uuid,
 p_expected_version bigint, p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.vehicles; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform transport_private.authorize(p_event_id, true);

 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or
    length(btrim(coalesce(p_fields->>'name', ''))) = 0 or
    length(coalesce(p_fields->>'name', '')) > 100 or
    coalesce(p_fields->>'vehicle_type','') not in ('CAR', 'VAN', 'MINIBUS', 'BUS', 'CUSTOM') or
    coalesce(p_fields->>'status','') not in ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'UNAVAILABLE') or
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
   if exists(select 1 from public.audit_entries a where a.entity_type='vehicles' and a.entity_id=r.id::text and a.operation='CREATE' and (coalesce(a.new_value->>'name','') is distinct from coalesce(p_fields->>'name','') or
      coalesce(a.new_value->>'vehicle_type','') is distinct from coalesce(p_fields->>'vehicle_type','') or
      coalesce(a.new_value->>'license_plate','') is distinct from coalesce(p_fields->>'license_plate','') or
      coalesce(a.new_value->>'color','') is distinct from coalesce(p_fields->>'color','') or
      coalesce(a.new_value->>'capacity','') is distinct from coalesce(p_fields->>'capacity','') or
      coalesce(a.new_value->>'status','') is distinct from coalesce(p_fields->>'status','') or
      coalesce(a.new_value->>'notes','') is distinct from coalesce(p_fields->>'notes',''))) then
    raise exception using errcode='40001',message='Creation request payload changed'; end if;
   return r.id;
  end if;
  insert into public.vehicles(event_id, creation_request_id, name, vehicle_type,
   license_plate, color, capacity, status, notes, created_by, updated_by)
  values(p_event_id, p_request_id, p_fields->>'name', coalesce(p_fields->>'vehicle_type','VAN'),
   coalesce(p_fields->>'license_plate',''), nullif(p_fields->>'color',''), (p_fields->>'capacity')::integer,
   coalesce(p_fields->>'status','AVAILABLE'), p_fields->>'notes', actor, actor)
  returning * into r;
 else
  select * into r from public.vehicles where event_id=p_event_id and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Vehicle unavailable'; end if;
  if r.version is distinct from p_expected_version or r.is_deleted then
   raise exception using errcode='40001',message='Record changed'; end if;
  before_row:=to_jsonb(r)-'creation_request_id';
  update public.vehicles set name=p_fields->>'name', vehicle_type=coalesce(p_fields->>'vehicle_type','VAN'),
   license_plate=coalesce(p_fields->>'license_plate',''), color=nullif(p_fields->>'color',''), capacity=(p_fields->>'capacity')::integer,
   status=coalesce(p_fields->>'status','AVAILABLE'), notes=p_fields->>'notes',
   version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
  where id=r.id returning * into r;
 end if;

 insert into public.audit_entries(event_id, actor_user_id, entity_type, entity_id, operation, old_value, new_value)
 values(p_event_id, actor, 'vehicles', r.id::text, case when created then 'CREATE' else 'UPDATE' end,
  before_row, to_jsonb(r)-'creation_request_id');
 return r.id;
end; $$;

create or replace function public.delete_vehicle(p_event_id uuid, p_id uuid, p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.vehicles; before_row jsonb; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id,true);
 select * into r from public.vehicles where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Record unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=true then
  raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.vehicles set is_deleted=true, deleted_at_utc=clock_timestamp(),
 version=version+1,updated_at_utc=clock_timestamp(),updated_by=actor where id=r.id returning * into r;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,'vehicles',r.id::text,'DELETE',before_row,to_jsonb(r)-'creation_request_id');
end; $$;

create or replace function public.restore_vehicle(p_event_id uuid, p_id uuid, p_expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.vehicles; before_row jsonb; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id,true);
 select * into r from public.vehicles where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Record unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=false then
  raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.vehicles set is_deleted=false, deleted_at_utc=null,
 version=version+1,updated_at_utc=clock_timestamp(),updated_by=actor where id=r.id returning * into r;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,'vehicles',r.id::text,'RESTORE',before_row,to_jsonb(r)-'creation_request_id');
end; $$;

revoke all on function public.read_vehicle(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_vehicle(uuid,uuid) to authenticated;
revoke all on function public.list_vehicles(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.list_vehicles(uuid,text,boolean) to authenticated;
revoke all on function public.save_vehicle(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_vehicle(uuid,uuid,uuid,bigint,jsonb) to authenticated;
revoke all on function public.delete_vehicle(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.delete_vehicle(uuid,uuid,bigint) to authenticated;
revoke all on function public.restore_vehicle(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.restore_vehicle(uuid,uuid,bigint) to authenticated;
revoke all on function transport_private.authorize(uuid,boolean) from public,anon,authenticated;
alter publication supabase_realtime add table public.drivers;
alter publication supabase_realtime add table public.vehicles;
commit;
