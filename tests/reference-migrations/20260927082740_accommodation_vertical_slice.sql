begin;
-- Accommodation is additive. Existing applied migrations are unchanged.
create schema accommodation_private;
revoke all on schema accommodation_private from public,anon,authenticated;
alter default privileges in schema accommodation_private revoke execute on functions from public;

create table public.apartments (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique, creation_payload jsonb not null,
 name text not null check(name ~ '[^[:space:]]' and length(name) between 1 and 200),
 address text not null check(address ~ '[^[:space:]]' and length(address) between 1 and 500),
 hebrew_address text check(length(hebrew_address)<=500), floor text check(length(floor)<=100),
 entry_code text check(length(entry_code)<=100), landlord_name text check(length(landlord_name)<=200),
 landlord_phone text check(length(landlord_phone)<=50), notes text check(length(notes)<=10000),
 status text not null check(status in ('ACTIVE','UNAVAILABLE','CLOSED')),
 total_cost numeric check(total_cost>=0 and total_cost<'Infinity'::numeric),
 cost_currency text check(cost_currency in ('AED','AFN','ALL','AMD','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BHD','BIF','BMD','BND','BOB','BOV','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHE','CHF','CHW','CLF','CLP','CNY','COP','COU','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MXV','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','USN','UYI','UYU','UYW','UZS','VED','VES','VND','VUV','WST','XAD','XAF','XAG','XAU','XBA','XBB','XBC','XBD','XCD','XCG','XDR','XOF','XPD','XPF','XPT','XSU','XUA','YER','ZAR','ZMW','ZWG')), cost_notes text check(length(cost_notes)<=10000),
 is_deleted boolean not null default false, deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0), unique(event_id,id),
 check(is_deleted=(deleted_at_utc is not null))
);
create index apartments_event_active on public.apartments(event_id,is_deleted);
create index apartments_created_by on public.apartments(created_by);
create index apartments_updated_by on public.apartments(updated_by);
alter table public.apartments enable row level security;
create policy apartments_read on public.apartments for select to authenticated
 using(public.is_event_admin(event_id) and exists(select 1 from public.events e where e.id=event_id and not e.is_deleted));
revoke all on public.apartments from public,anon,authenticated;
grant select on public.apartments to authenticated;

create table public.rooms (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique, creation_payload jsonb not null,
 apartment_id uuid not null, name_or_number text not null check(name_or_number ~ '[^[:space:]]' and length(name_or_number) between 1 and 200),
 floor text check(length(floor)<=100), description text check(length(description)<=2000), notes text check(length(notes)<=10000),
 foreign key(event_id,apartment_id) references public.apartments(event_id,id),
 is_deleted boolean not null default false, deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0), unique(event_id,id),
 check(is_deleted=(deleted_at_utc is not null))
);
create index rooms_event_active on public.rooms(event_id,is_deleted);
create index rooms_created_by on public.rooms(created_by);
create index rooms_updated_by on public.rooms(updated_by);
alter table public.rooms enable row level security;
create policy rooms_read on public.rooms for select to authenticated
 using(public.is_event_admin(event_id) and exists(select 1 from public.events e where e.id=event_id and not e.is_deleted));
revoke all on public.rooms from public,anon,authenticated;
grant select on public.rooms to authenticated;

create table public.sleeping_places (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique, creation_payload jsonb not null,
 room_id uuid not null, label text not null check(label ~ '[^[:space:]]' and length(label) between 1 and 200),
 type text not null check(type in ('REGULAR_BED','BUNK_BED','SOFA_BED','MATTRESS','CUSTOM')),
 custom_type_name text check(length(custom_type_name)<=200), position_notes text check(length(position_notes)<=2000),
 is_active boolean not null default true,
 check(type<>'CUSTOM' or coalesce(custom_type_name,'') ~ '[^[:space:]]'),
 foreign key(event_id,room_id) references public.rooms(event_id,id),
 is_deleted boolean not null default false, deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0), unique(event_id,id),
 check(is_deleted=(deleted_at_utc is not null))
);
create index sleeping_places_event_active on public.sleeping_places(event_id,is_deleted);
create index sleeping_places_created_by on public.sleeping_places(created_by);
create index sleeping_places_updated_by on public.sleeping_places(updated_by);
alter table public.sleeping_places enable row level security;
create policy sleeping_places_read on public.sleeping_places for select to authenticated
 using(public.is_event_admin(event_id) and exists(select 1 from public.events e where e.id=event_id and not e.is_deleted));
revoke all on public.sleeping_places from public,anon,authenticated;
grant select on public.sleeping_places to authenticated;

create table public.accommodation_assignments (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique, creation_payload jsonb not null,
 sleeping_place_id uuid not null, person_id uuid not null,
 start_date date not null, end_date date not null,
 status text not null check(status in ('ACTIVE','TEMPORARY','CANCELLED')),
 notes text check(length(notes)<=10000), is_locked boolean not null default false,
 check(end_date>start_date and start_date>='0001-01-01'::date and end_date<='9999-12-31'::date),
 check(not is_locked or coalesce(notes,'') ~ '[^[:space:]]'),
 foreign key(event_id,sleeping_place_id) references public.sleeping_places(event_id,id),
 foreign key(event_id,person_id) references public.people(event_id,id),
 is_deleted boolean not null default false, deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0), unique(event_id,id),
 check(is_deleted=(deleted_at_utc is not null))
);
create index accommodation_assignments_event_active on public.accommodation_assignments(event_id,is_deleted);
create index accommodation_assignments_created_by on public.accommodation_assignments(created_by);
create index accommodation_assignments_updated_by on public.accommodation_assignments(updated_by);
alter table public.accommodation_assignments enable row level security;
create policy accommodation_assignments_read on public.accommodation_assignments for select to authenticated
 using(public.is_event_admin(event_id) and exists(select 1 from public.events e where e.id=event_id and not e.is_deleted));
revoke all on public.accommodation_assignments from public,anon,authenticated;
grant select on public.accommodation_assignments to authenticated;

create index rooms_apartment on public.rooms(event_id,apartment_id);
create index sleeping_places_room on public.sleeping_places(event_id,room_id);
create index accommodation_assignments_bed_dates on public.accommodation_assignments(event_id,sleeping_place_id,start_date,end_date);
create index accommodation_assignments_person on public.accommodation_assignments(event_id,person_id);

-- Closed allowlist; no client-selected SQL identifiers or metadata.
create function accommodation_private.save(p_kind text,p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare tab text; cols text[]; selected text; assignments text; before_row jsonb; after_row jsonb; rid uuid; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id,true);
 -- One event lock orders all hierarchy writes and assignment lifecycle changes.
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,31));
 case p_kind
 when 'apartment' then tab:='apartments'; cols:=array['name','address','hebrew_address','floor','entry_code','landlord_name','landlord_phone','notes','status','total_cost','cost_currency','cost_notes'];
 when 'room' then tab:='rooms'; cols:=array['apartment_id','name_or_number','floor','description','notes'];
 when 'sleeping_place' then tab:='sleeping_places'; cols:=array['room_id','label','type','custom_type_name','position_notes','is_active'];
 when 'accommodation_assignment' then tab:='accommodation_assignments'; cols:=array['sleeping_place_id','person_id','start_date','end_date','status','notes','is_locked'];
 else raise exception using errcode='22023',message='Invalid accommodation kind'; end case;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception using errcode='22023',message='Invalid fields'; end if;
 if exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(cols)) then raise exception using errcode='22023',message='Unknown field'; end if;
 if p_id is null then
  if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,32));
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
  -- Hierarchy identity is historical. Moving a bed/room or person requires an explicit new record.
  if (p_kind='room' and before_row->'apartment_id' is distinct from p_fields->'apartment_id')
   or (p_kind='sleeping_place' and before_row->'room_id' is distinct from p_fields->'room_id')
   or (p_kind='accommodation_assignment' and (before_row->'sleeping_place_id' is distinct from p_fields->'sleeping_place_id' or before_row->'person_id' is distinct from p_fields->'person_id'))
   then raise exception using errcode='22023',message='Create a new record to move; preserve history'; end if;
 end if;
 if p_kind='room' then
  perform 1 from public.apartments where event_id=p_event_id and id=(p_fields->>'apartment_id')::uuid;
 elsif p_kind='sleeping_place' then
  perform 1 from public.rooms where event_id=p_event_id and id=(p_fields->>'room_id')::uuid;
 elsif p_kind='accommodation_assignment' then
  perform 1 from public.people where event_id=p_event_id and id=(p_fields->>'person_id')::uuid;
  if not found then raise exception using errcode='23503',message='Person unavailable in this event'; end if;
  perform 1 from public.sleeping_places where event_id=p_event_id and id=(p_fields->>'sleeping_place_id')::uuid;
 else perform 1; end if;
 if not found then raise exception using errcode='23503',message='Parent unavailable in this event'; end if;
 -- Tombstones retain children. Managers may end/cancel or correct history under a tombstoned parent.
 -- New active assignments require a live hierarchy/person; inactive status is advisory, never an inferred override.
 if p_id is null then
  if p_kind='room' and exists(select 1 from public.apartments where id=(p_fields->>'apartment_id')::uuid and is_deleted)
   or p_kind='sleeping_place' and exists(select 1 from public.rooms r join public.apartments a on a.event_id=r.event_id and a.id=r.apartment_id where r.id=(p_fields->>'room_id')::uuid and (r.is_deleted or a.is_deleted))
   or p_kind='accommodation_assignment' and (exists(select 1 from public.people where id=(p_fields->>'person_id')::uuid and is_deleted)
    or exists(select 1 from public.sleeping_places b join public.rooms r on r.event_id=b.event_id and r.id=b.room_id join public.apartments a on a.event_id=r.event_id and a.id=r.apartment_id where b.id=(p_fields->>'sleeping_place_id')::uuid and (b.is_deleted or r.is_deleted or a.is_deleted)))
   then raise exception using errcode='23503',message='Restore the referenced record before creating'; end if;
  if p_kind='accommodation_assignment' and exists(select 1 from public.events where id=p_event_id and lifecycle_stage='CLOSEOUT') then
   raise exception using errcode='40001',message='No new assignments in closeout'; end if;
 end if;
 select string_agg(format('%I',c),',') into selected from unnest(cols) c;
 if p_id is null then
  execute format('insert into public.%I(event_id,creation_request_id,creation_payload,created_by,updated_by,%s) select $1,$2,$3,$4,$4,%s from jsonb_populate_record(null::public.%I,$3) returning id',tab,selected,selected,tab) into rid using p_event_id,p_request_id,p_fields,actor;
 else
  select string_agg(format('%I=x.%I',c,c),',') into assignments from unnest(cols) c;
  execute format('update public.%I t set %s,version=t.version+1,updated_at_utc=clock_timestamp(),updated_by=$3 from jsonb_populate_record(null::public.%I,$4) x where t.id=$1 and t.event_id=$2 returning t.id',tab,assignments,tab) into rid using p_id,p_event_id,actor,p_fields;
 end if;
 execute format('select to_jsonb(t)-''creation_request_id''-''creation_payload'' from public.%I t where id=$1',tab) into after_row using rid;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,tab,rid::text,case when p_id is null then 'CREATE' else 'UPDATE' end,before_row-'creation_request_id'-'creation_payload',after_row);
 return rid;
end; $$;

create function accommodation_private.set_deleted(p_kind text,p_event_id uuid,p_id uuid,p_expected_version bigint,p_deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare tab text; before_row jsonb; after_row jsonb;
begin
 perform transport_private.authorize(p_event_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,31));
 case p_kind
 when 'apartment' then tab:='apartments';
 when 'room' then tab:='rooms';
 when 'sleeping_place' then tab:='sleeping_places';
 when 'accommodation_assignment' then tab:='accommodation_assignments';
 else raise exception using errcode='22023',message='Invalid accommodation kind'; end case;
 execute format('select to_jsonb(t) from public.%I t where event_id=$1 and id=$2 for update',tab) into before_row using p_event_id,p_id;
 if before_row is null then raise exception using errcode='42501',message='Record unavailable'; end if;
 if (before_row->>'version')::bigint is distinct from p_expected_version or (before_row->>'is_deleted')::boolean=p_deleted then raise exception using errcode='40001',message='Record changed'; end if;
 execute format('update public.%I t set is_deleted=$3,deleted_at_utc=case when $3 then clock_timestamp() end,version=version+1,updated_at_utc=clock_timestamp(),updated_by=$4 where event_id=$1 and id=$2 returning to_jsonb(t)',tab)
 into after_row using p_event_id,p_id,p_deleted,auth.uid();
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,auth.uid(),tab,p_id::text,case when p_deleted then 'DELETE' else 'RESTORE' end,before_row-'creation_request_id'-'creation_payload',after_row-'creation_request_id'-'creation_payload');
end; $$;

create function public.save_apartment(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select accommodation_private.save('apartment',p_event_id,p_request_id,p_id,p_expected_version,p_fields); $$;
create function public.delete_apartment(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('apartment',p_event_id,p_id,p_expected_version,true); $$;
create function public.restore_apartment(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('apartment',p_event_id,p_id,p_expected_version,false); $$;
create function public.list_apartments(p_event_id uuid) returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return query select (to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('total_cost',total_cost::text) from public.apartments t where event_id=p_event_id order by created_at_utc,id;
end; $$;

create function public.save_room(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select accommodation_private.save('room',p_event_id,p_request_id,p_id,p_expected_version,p_fields); $$;
create function public.delete_room(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('room',p_event_id,p_id,p_expected_version,true); $$;
create function public.restore_room(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('room',p_event_id,p_id,p_expected_version,false); $$;
create function public.list_rooms(p_event_id uuid) returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return query select to_jsonb(t)-'creation_request_id'-'creation_payload' from public.rooms t where event_id=p_event_id order by created_at_utc,id;
end; $$;

create function public.save_sleeping_place(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select accommodation_private.save('sleeping_place',p_event_id,p_request_id,p_id,p_expected_version,p_fields); $$;
create function public.delete_sleeping_place(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('sleeping_place',p_event_id,p_id,p_expected_version,true); $$;
create function public.restore_sleeping_place(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('sleeping_place',p_event_id,p_id,p_expected_version,false); $$;
create function public.list_sleeping_places(p_event_id uuid) returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return query select to_jsonb(t)-'creation_request_id'-'creation_payload' from public.sleeping_places t where event_id=p_event_id order by created_at_utc,id;
end; $$;

create function public.save_accommodation_assignment(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select accommodation_private.save('accommodation_assignment',p_event_id,p_request_id,p_id,p_expected_version,p_fields); $$;
create function public.delete_accommodation_assignment(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('accommodation_assignment',p_event_id,p_id,p_expected_version,true); $$;
create function public.restore_accommodation_assignment(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select accommodation_private.set_deleted('accommodation_assignment',p_event_id,p_id,p_expected_version,false); $$;
create function public.list_accommodation_assignments(p_event_id uuid) returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 return query select to_jsonb(t)-'creation_request_id'-'creation_payload' from public.accommodation_assignments t where event_id=p_event_id order by created_at_utc,id;
end; $$;

-- A single statement returns a consistent hierarchy plus canonical overlap pairs.
-- No stored warning cache to become stale; locks never suppress these advisories.
create function public.read_accommodation(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id,false);
 select jsonb_build_object(
 'apartments',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('total_cost',total_cost::text) order by created_at_utc,id) from public.apartments t where event_id=p_event_id),'[]'::jsonb),
 'rooms',coalesce((select jsonb_agg(to_jsonb(t)-'creation_request_id'-'creation_payload' order by created_at_utc,id) from public.rooms t where event_id=p_event_id),'[]'::jsonb),
 'sleeping_places',coalesce((select jsonb_agg(to_jsonb(t)-'creation_request_id'-'creation_payload' order by created_at_utc,id) from public.sleeping_places t where event_id=p_event_id),'[]'::jsonb),
 'accommodation_assignments',coalesce((select jsonb_agg(to_jsonb(t)-'creation_request_id'-'creation_payload' order by created_at_utc,id) from public.accommodation_assignments t where event_id=p_event_id),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'event_id',event_id,'label',first_name||' '||last_name,'is_deleted',is_deleted) order by last_name,first_name,id) from public.people where event_id=p_event_id),'[]'::jsonb),
 'overlaps',coalesce((select jsonb_agg(jsonb_build_object('rule_code','ACCOMMODATION_OVERLAP','first_id',a.id,'second_id',b.id) order by a.id,b.id)
 from public.accommodation_assignments a join public.accommodation_assignments b on a.event_id=b.event_id and a.sleeping_place_id=b.sleeping_place_id and a.id<b.id
 where a.event_id=p_event_id and not a.is_deleted and not b.is_deleted and a.status<>'CANCELLED' and b.status<>'CANCELLED'
 and greatest(a.start_date,b.start_date)<least(a.end_date,b.end_date)),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on all functions in schema accommodation_private from public,anon,authenticated;
do $$ declare fn regprocedure; begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_apartment','delete_apartment','restore_apartment','list_apartments','save_room','delete_room','restore_room','list_rooms','save_sleeping_place','delete_sleeping_place','restore_sleeping_place','list_sleeping_places','save_accommodation_assignment','delete_accommodation_assignment','restore_accommodation_assignment','list_accommodation_assignments','read_accommodation') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn);
 execute format('grant execute on function %s to authenticated',fn);
 end loop;
end; $$;
alter publication supabase_realtime add table public.apartments,public.rooms,public.sleeping_places,public.accommodation_assignments;
commit;
