begin;
create table public.trips (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique, creation_payload jsonb not null,
 direction text not null check(direction in ('INBOUND','OUTBOUND','LOCAL')),
 origin text not null check(length(btrim(origin)) between 1 and 500),
 destination text not null check(length(btrim(destination)) between 1 and 500),
 scheduled_departure_utc timestamptz not null, scheduled_arrival_utc timestamptz not null,
 actual_departure_utc timestamptz, actual_arrival_utc timestamptz,
 driver_id uuid, vehicle_id uuid, related_flight_id uuid,
 status text not null check(status in ('PLANNED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')),
 notes text check(length(notes)<=10000), is_locked boolean not null default false,
 flight_review_snapshot jsonb,
 is_deleted boolean not null default false, deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0), unique(event_id,id),
 check(scheduled_arrival_utc>scheduled_departure_utc), check(is_deleted=(deleted_at_utc is not null)),
 foreign key(event_id,driver_id) references public.drivers(event_id,id),
 foreign key(event_id,vehicle_id) references public.vehicles(event_id,id),
 foreign key(event_id,related_flight_id) references public.flights(event_id,id)
);
create table public.trip_passengers (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique, creation_payload jsonb not null,
 trip_id uuid not null, person_id uuid not null,
 pickup_location text check(length(pickup_location)<=500), pickup_notes text check(length(pickup_notes)<=2000),
 passenger_status text not null check(passenger_status in ('ASSIGNED','CONFIRMED','PICKED_UP','DROPPED_OFF','NO_SHOW','CANCELLED')),
 notes text check(length(notes)<=10000),
 is_deleted boolean not null default false, deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0), unique(event_id,id),
 check(is_deleted=(deleted_at_utc is not null)),
 foreign key(event_id,trip_id) references public.trips(event_id,id),
 foreign key(event_id,person_id) references public.people(event_id,id)
);
create unique index trip_passengers_active_person on public.trip_passengers(event_id,trip_id,person_id) where not is_deleted and passenger_status<>'CANCELLED';
create index trips_event_schedule on public.trips(event_id,is_deleted,scheduled_departure_utc);
create index trips_driver on public.trips(event_id,driver_id);
create index trips_vehicle on public.trips(event_id,vehicle_id);
create index trips_flight on public.trips(event_id,related_flight_id);
create index trips_created_by on public.trips(created_by);
create index trips_updated_by on public.trips(updated_by);
create index trip_passengers_trip on public.trip_passengers(event_id,trip_id,is_deleted);
create index trip_passengers_person on public.trip_passengers(event_id,person_id);
create index trip_passengers_created_by on public.trip_passengers(created_by);
create index trip_passengers_updated_by on public.trip_passengers(updated_by);
alter table public.trips enable row level security;
alter table public.trip_passengers enable row level security;
create policy trips_read on public.trips for select to authenticated using(public.is_event_admin(event_id) and exists(select 1 from public.events e where e.id=event_id and not e.is_deleted));
create policy trip_passengers_read on public.trip_passengers for select to authenticated using(public.is_event_admin(event_id) and exists(select 1 from public.events e where e.id=event_id and not e.is_deleted));
revoke all on public.trips,public.trip_passengers from public,anon,authenticated;
grant select on public.trips,public.trip_passengers to authenticated;
create schema trips_private;
revoke all on schema trips_private from public,anon,authenticated;

create function trips_private.flight_snapshot(p_event uuid,p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('status',status,'departure',scheduled_departure_utc,'arrival',scheduled_arrival_utc,
 'actual_departure',actual_departure_utc,'actual_arrival',actual_arrival_utc,'delay',delay_minutes,
 'departure_airport',departure_airport,'arrival_airport',arrival_airport,'is_deleted',is_deleted)
 from public.flights where event_id=p_event and id=p_id;
$$;

-- Closed, internal mutation surface. Identifiers and editable fields are fixed here.
-- Authorization locks membership/Event; the event advisory lock serializes manifests.
create function trips_private.save(p_passenger boolean,p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare tab text; cols text[]; col text; assignments text; selected text; before_row jsonb; after_row jsonb;
 actor uuid:=auth.uid(); rid uuid; old_trip uuid;
begin
 perform transport_private.authorize(p_event_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,22));
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception using errcode='22023',message='Invalid fields'; end if;
 if p_passenger then
  tab:='trip_passengers'; cols:=array['trip_id','person_id','pickup_location','pickup_notes','passenger_status','notes'];
 else
  tab:='trips'; cols:=array['direction','origin','destination','scheduled_departure_utc','scheduled_arrival_utc','actual_departure_utc','actual_arrival_utc','driver_id','vehicle_id','related_flight_id','status','notes','is_locked'];
 end if;
 if exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(cols)) then raise exception using errcode='22023',message='Unknown field'; end if;
 if p_id is null then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,23));
  execute format('select to_jsonb(t) from public.%I t where creation_request_id=$1',tab) into before_row using p_request_id;
  if before_row is not null then
   if before_row->>'event_id'<>p_event_id::text or before_row->>'created_by'<>actor::text then raise exception using errcode='42501',message='Not authorized'; end if;
   if before_row->'creation_payload' is distinct from p_fields then raise exception using errcode='40001',message='Creation payload changed'; end if;
   return (before_row->>'id')::uuid;
  end if;
 else
  execute format('select to_jsonb(t) from public.%I t where event_id=$1 and id=$2 for update',tab) into before_row using p_event_id,p_id;
  if before_row is null then raise exception using errcode='42501',message='Record unavailable'; end if;
  if (before_row->>'version')::bigint is distinct from p_expected_version or (before_row->>'is_deleted')::boolean then raise exception using errcode='40001',message='Record changed'; end if;
 end if;
 if p_passenger then
  perform 1 from public.trips where event_id=p_event_id and id=(p_fields->>'trip_id')::uuid and not is_deleted for share;
  if not found then raise exception using errcode='23503',message='Trip unavailable in this event'; end if;
  perform 1 from public.people where event_id=p_event_id and id=(p_fields->>'person_id')::uuid and not is_deleted for share;
  if not found then raise exception using errcode='23503',message='Person unavailable in this event'; end if;
 end if;
 select string_agg(format('%I',c),',') into selected from unnest(cols) c;
 if p_id is null then
  execute format('insert into public.%I(event_id,creation_request_id,creation_payload,created_by,updated_by,%s) select $1,$2,$3,$4,$4,%s from jsonb_populate_record(null::public.%I,$3) returning id',tab,selected,selected,tab)
   into rid using p_event_id,p_request_id,p_fields,actor;
 else
  select string_agg(format('%I=x.%I',c,c),',') into assignments from unnest(cols) c;
  execute format('update public.%I t set %s,version=t.version+1,updated_at_utc=clock_timestamp(),updated_by=$3 from jsonb_populate_record(null::public.%I,$4) x where t.id=$1 and t.event_id=$2 returning t.id',tab,assignments,tab)
   into rid using p_id,p_event_id,actor,p_fields;
 end if;
 if not p_passenger then
  -- Establish a baseline only on explicit link assignment. Ordinary edits never acknowledge advisories.
  update public.trips set flight_review_snapshot=trips_private.flight_snapshot(p_event_id,related_flight_id)
   where id=rid and (p_id is null or before_row->>'related_flight_id' is distinct from related_flight_id::text);
 end if;
 execute format('select to_jsonb(t)-''creation_request_id''-''creation_payload'' from public.%I t where id=$1',tab) into after_row using rid;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,tab,rid::text,case when p_id is null then 'CREATE' else 'UPDATE' end,before_row-'creation_request_id'-'creation_payload',after_row);
 return rid;
end; $$;

create function public.save_trip(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select trips_private.save(false,p_event_id,p_request_id,p_id,p_expected_version,p_fields); $$;
create function public.save_trip_passenger(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select trips_private.save(true,p_event_id,p_request_id,p_id,p_expected_version,p_fields); $$;

create function trips_private.set_deleted(p_passenger boolean,p_event_id uuid,p_id uuid,p_expected_version bigint,p_deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare tab text:=case when p_passenger then 'trip_passengers' else 'trips' end; before_row jsonb; after_row jsonb;
begin
 perform transport_private.authorize(p_event_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,22));
 execute format('select to_jsonb(t) from public.%I t where event_id=$1 and id=$2 for update',tab) into before_row using p_event_id,p_id;
 if before_row is null then raise exception using errcode='42501',message='Record unavailable'; end if;
 if (before_row->>'version')::bigint is distinct from p_expected_version or (before_row->>'is_deleted')::boolean=p_deleted then raise exception using errcode='40001',message='Record changed'; end if;
 if p_passenger and not p_deleted then
  perform 1 from public.trips where event_id=p_event_id and id=(before_row->>'trip_id')::uuid and not is_deleted for share;
  if not found then raise exception using errcode='23503',message='Restore Trip first'; end if;
 end if;
 execute format('update public.%I t set is_deleted=$3,deleted_at_utc=case when $3 then clock_timestamp() end,version=version+1,updated_at_utc=clock_timestamp(),updated_by=$4 where event_id=$1 and id=$2 returning to_jsonb(t)',tab)
 into after_row using p_event_id,p_id,p_deleted,auth.uid();
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,auth.uid(),tab,p_id::text,case when p_deleted then 'DELETE' else 'RESTORE' end,before_row-'creation_request_id'-'creation_payload',after_row-'creation_request_id'-'creation_payload');
end; $$;
create function public.delete_trip(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select trips_private.set_deleted(false,p_event_id,p_id,p_expected_version,true); $$;
create function public.restore_trip(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select trips_private.set_deleted(false,p_event_id,p_id,p_expected_version,false); $$;
create function public.delete_trip_passenger(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select trips_private.set_deleted(true,p_event_id,p_id,p_expected_version,true); $$;
create function public.restore_trip_passenger(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select trips_private.set_deleted(true,p_event_id,p_id,p_expected_version,false); $$;

create function public.read_trip(p_event_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id,false);
 select (to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object(
 'active_passengers',(select count(*) from public.trip_passengers p where p.event_id=t.event_id and p.trip_id=t.id and not p.is_deleted and p.passenger_status<>'CANCELLED'),
 'vehicle_capacity',v.capacity,
 'flight_needs_review',t.related_flight_id is not null and (t.flight_review_snapshot is distinct from trips_private.flight_snapshot(t.event_id,t.related_flight_id)))
 into result from public.trips t left join public.vehicles v on v.event_id=t.event_id and v.id=t.vehicle_id where t.event_id=p_event_id and t.id=p_id;
 return result;
end; $$;
create function public.list_trips(p_event_id uuid,p_query text default '',p_deleted boolean default false) returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return query select public.read_trip(p_event_id,t.id) from public.trips t where event_id=p_event_id and is_deleted=p_deleted
 and (p_query='' or origin ilike '%'||p_query||'%' or destination ilike '%'||p_query||'%' or notes ilike '%'||p_query||'%') order by scheduled_departure_utc,id;
end; $$;
create function public.list_trip_passengers(p_event_id uuid,p_trip_id uuid,p_deleted boolean default false) returns setof public.trip_passengers language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return query select * from public.trip_passengers where event_id=p_event_id and trip_id=p_trip_id and is_deleted=p_deleted order by created_at_utc,id;
end; $$;
create function public.trip_assignment_options(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return jsonb_build_object(
 'drivers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',full_name)) from public.drivers where event_id=p_event_id and not is_deleted),'[]'::jsonb),
 'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',name)) from public.vehicles where event_id=p_event_id and not is_deleted),'[]'::jsonb),
 'flights',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',flight_number)) from public.flights where event_id=p_event_id and not is_deleted),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',first_name||' '||last_name)) from public.people where event_id=p_event_id and not is_deleted),'[]'::jsonb));
end; $$;
revoke all on all functions in schema trips_private from public,anon,authenticated;
do $$ declare fn regprocedure; begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_trip','save_trip_passenger','delete_trip','restore_trip','delete_trip_passenger','restore_trip_passenger','read_trip','list_trips','list_trip_passengers','trip_assignment_options') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn);
 execute format('grant execute on function %s to authenticated',fn);
 end loop;
end; $$;
alter publication supabase_realtime add table public.trips,public.trip_passengers;
commit;
