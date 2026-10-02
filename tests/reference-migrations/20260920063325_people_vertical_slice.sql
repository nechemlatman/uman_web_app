begin;
create schema if not exists people_private;
revoke all on schema people_private from public, anon, authenticated;

-- Published rows contain only operational list fields, never passport details.
create table public.people (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete restrict,
 creation_request_id uuid not null unique,
 first_name text not null check(length(btrim(first_name)) between 1 and 200),
 last_name text not null default '' check(length(last_name)<=200),
 hebrew_first_name text check(length(hebrew_first_name)<=200),
 hebrew_last_name text check(length(hebrew_last_name)<=200),
 phone text not null default '' check(length(phone)<=100),
 whatsapp_phone text check(length(whatsapp_phone)<=100),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 is_deleted boolean not null default false,
 deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(),
 updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0),
 unique(event_id,id),
 check(is_deleted=(deleted_at_utc is not null))
);
create index people_event_active_name on public.people(event_id,is_deleted,last_name,first_name,id);
create index people_created_by on public.people(created_by);
create index people_updated_by on public.people(updated_by);
create table people_private.person_details (
 event_id uuid not null,
 person_id uuid primary key,
 email text, passport_name text, passport_number text,
 passport_expiration_date date, date_of_birth date, nationality text,
 emergency_contact_name text, emergency_contact_phone text, notes text,
 custom_fields jsonb not null default '{}' check(jsonb_typeof(custom_fields)='object'),
 creation_fingerprint text not null,
 foreign key(event_id,person_id) references public.people(event_id,id) on delete restrict
);
create index person_details_event on people_private.person_details(event_id,person_id);
alter table public.people enable row level security;
alter table people_private.person_details enable row level security;
create policy people_read on public.people for select to authenticated
 using(public.is_event_admin(event_id) and exists(
 select 1 from public.events e where e.id=event_id and not e.is_deleted));
-- No client DML policies: all mutations go through narrowly checked RPCs.
revoke all on public.people from public,anon,authenticated;
grant select on public.people to authenticated;
revoke all on people_private.person_details from public,anon,authenticated;

create function people_private.authorize(p_event_id uuid,p_write boolean)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
 perform 1 from public.event_members where event_id=p_event_id
 and user_id=auth.uid() and role='administrator' for share;
 if auth.uid() is null or not found then
 raise exception using errcode='42501',message='Not authorized'; end if;
 -- Serialize with Event archive/delete and other Person writes.
 select * into e from public.events where id=p_event_id for share;
 if not found or e.is_deleted then
 raise exception using errcode='42501',message='Event unavailable'; end if;
 if p_write and e.lifecycle_stage='ARCHIVED' then
 raise exception using errcode='40001',message='Event is read-only'; end if;
end; $$;

create function people_private.validate_fields(p_fields jsonb)
returns void language plpgsql set search_path='' as $$
declare k text; v jsonb;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or
 length(btrim(coalesce(p_fields->>'first_name',''))) not between 1 and 200 or
 coalesce(p_fields->>'status','') not in ('ACTIVE','INACTIVE') then
 raise exception using errcode='22023',message='Invalid Person fields'; end if;
 for k,v in select * from jsonb_each(p_fields) loop
 if k not in ('first_name','last_name','hebrew_first_name','hebrew_last_name',
 'phone','whatsapp_phone','email','passport_name','passport_number',
 'passport_expiration_date','date_of_birth','nationality','emergency_contact_name',
 'emergency_contact_phone','notes','custom_fields','status') then
 raise exception using errcode='22023',message='Unknown Person field'; end if;
 if k='custom_fields' then
 if jsonb_typeof(v)<>'object' or octet_length(v::text)>16384 then
 raise exception using errcode='22023',message='Invalid custom fields'; end if;
 elsif jsonb_typeof(v) not in ('string','null') or
 length(p_fields->>k)>(case when k='notes' then 10000
 when k in ('phone','whatsapp_phone','emergency_contact_phone') then 100
 when k='email' then 320 else 200 end) then
 raise exception using errcode='22023',message='Invalid Person field'; end if;
 end loop;
 if nullif(p_fields->>'email','') is not null and
 p_fields->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
 raise exception using errcode='22023',message='Invalid email'; end if;
 foreach k in array array['date_of_birth','passport_expiration_date'] loop
 if p_fields->>k is not null then
 if p_fields->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
 raise exception using errcode='22023',message='Invalid date'; end if;
 perform (p_fields->>k)::date;
 end if;
 end loop;
end; $$;

create function public.read_person(p_event_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform people_private.authorize(p_event_id,false);
 select (to_jsonb(p)-'creation_request_id') ||
 (to_jsonb(d)-array['event_id','person_id','creation_fingerprint'])
 into result from public.people p join people_private.person_details d on d.person_id=p.id
 where p.event_id=p_event_id and p.id=p_id;
 if result is null then raise exception using errcode='42501',message='Person unavailable'; end if;
 return result;
end; $$;

create function public.list_people(p_event_id uuid,p_query text default '',
 p_deleted boolean default false,p_limit integer default 51,p_offset integer default 0)
returns setof public.people language plpgsql security definer set search_path='' as $$
begin
 perform people_private.authorize(p_event_id,false);
 if p_limit is null or p_limit not between 1 and 501 or p_offset is null or p_offset<0
 or p_query is null or length(p_query)>200 or p_deleted is null then
 raise exception using errcode='22023',message='Invalid search'; end if;
 return query select p.* from public.people p
 join people_private.person_details d on d.person_id=p.id
 where p.event_id=p_event_id and p.is_deleted=p_deleted
 and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),'[[:space:]]+') token
 where token<>'' and strpos(lower(concat_ws(' ',p.first_name,p.last_name,
 p.hebrew_first_name,p.hebrew_last_name,p.phone,p.whatsapp_phone,d.notes)),token)=0
 and (regexp_replace(token,'[^0-9]','','g')='' or
 strpos(regexp_replace(p.phone||coalesce(p.whatsapp_phone,''),'[^0-9]','','g'),
 regexp_replace(token,'[^0-9]','','g'))=0))
 order by p.last_name,p.first_name,p.id limit p_limit offset p_offset;
end; $$;

create function public.person_duplicates(p_event_id uuid,p_fields jsonb,p_exclude uuid default null)
returns setof public.people language plpgsql security definer set search_path='' as $$
begin
 perform people_private.authorize(p_event_id,false);
 return query select p.* from public.people p where p.event_id=p_event_id
 and not p.is_deleted and (p_exclude is null or p.id<>p_exclude) and (
 (length(regexp_replace(coalesce(p_fields->>'phone',''),'[^0-9]','','g'))>0 and
 regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(p_fields->>'phone','[^0-9]','','g'))
 or (lower(btrim(p.first_name))=lower(btrim(p_fields->>'first_name')) and
 (lower(btrim(p.last_name))=lower(btrim(coalesce(p_fields->>'last_name',''))) or
 (length(btrim(coalesce(p_fields->>'last_name','')))>2 and
 starts_with(lower(p.last_name),lower(btrim(p_fields->>'last_name')))))))
 order by p.id limit 20;
end; $$;

create function public.save_person(p_event_id uuid,p_request_id uuid,p_id uuid,
 p_expected_version bigint,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.people; before_row jsonb; before_details jsonb; after_details jsonb;
 changed_fields jsonb; fingerprint text; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform people_private.authorize(p_event_id,true);
 perform people_private.validate_fields(p_fields);
 if created then
 if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,1));
 fingerprint:=encode(sha256(convert_to(p_fields::text,'UTF8')),'hex');
 select * into r from public.people where creation_request_id=p_request_id;
 if found then
 if r.event_id<>p_event_id or r.created_by<>actor then
 raise exception using errcode='42501',message='Not authorized'; end if;
 if (select creation_fingerprint from people_private.person_details where person_id=r.id)<>fingerprint then
 raise exception using errcode='40001',message='Creation already committed'; end if;
 return r.id;
 end if;
 insert into public.people(event_id,creation_request_id,first_name,last_name,hebrew_first_name,
 hebrew_last_name,phone,whatsapp_phone,status,created_by,updated_by)
 values(p_event_id,p_request_id,p_fields->>'first_name',coalesce(p_fields->>'last_name',''),
 p_fields->>'hebrew_first_name',p_fields->>'hebrew_last_name',coalesce(p_fields->>'phone',''),
 p_fields->>'whatsapp_phone',p_fields->>'status',actor,actor) returning * into r;
 insert into people_private.person_details(event_id,person_id,creation_fingerprint)
 values(p_event_id,r.id,fingerprint);
 else
 select * into r from public.people where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Person unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted then
 raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 select to_jsonb(d)-array['event_id','person_id','creation_fingerprint'] into before_details
 from people_private.person_details d where person_id=r.id;
 update public.people set first_name=p_fields->>'first_name',last_name=coalesce(p_fields->>'last_name',''),
 hebrew_first_name=p_fields->>'hebrew_first_name',hebrew_last_name=p_fields->>'hebrew_last_name',
 phone=coalesce(p_fields->>'phone',''),whatsapp_phone=p_fields->>'whatsapp_phone',
 status=p_fields->>'status',version=version+1,updated_at_utc=clock_timestamp(),updated_by=actor
 where id=r.id returning * into r;
 end if;
 update people_private.person_details set email=p_fields->>'email',
 passport_name=p_fields->>'passport_name',passport_number=p_fields->>'passport_number',
 passport_expiration_date=(p_fields->>'passport_expiration_date')::date,
 date_of_birth=(p_fields->>'date_of_birth')::date,nationality=p_fields->>'nationality',
 emergency_contact_name=p_fields->>'emergency_contact_name',
 emergency_contact_phone=p_fields->>'emergency_contact_phone',notes=p_fields->>'notes',
 custom_fields=coalesce(p_fields->'custom_fields','{}') where person_id=r.id;
 select to_jsonb(d)-array['event_id','person_id','creation_fingerprint'] into after_details
 from people_private.person_details d where person_id=r.id;
 select coalesce(jsonb_agg(key order by key),'[]') into changed_fields from jsonb_each(after_details)
 where value is distinct from before_details->key;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,'people',r.id::text,case when created then 'CREATE' else 'UPDATE' end,
 before_row,(to_jsonb(r)-'creation_request_id')||jsonb_build_object('detail_fields_changed',changed_fields));
 return r.id;
end; $$;

create function public.set_person_deleted(p_event_id uuid,p_id uuid,p_expected_version bigint,p_deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.people; before_row jsonb;
begin
 perform people_private.authorize(p_event_id,true);
 if p_deleted is null then raise exception using errcode='22023',message='Deletion state required'; end if;
 select * into r from public.people where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Person unavailable'; end if;
 if r.version is distinct from p_expected_version or r.is_deleted=p_deleted then
 raise exception using errcode='40001',message='Record changed'; end if;
 before_row:=to_jsonb(r)-'creation_request_id';
 update public.people set is_deleted=p_deleted,
 deleted_at_utc=case when p_deleted then clock_timestamp() end,
 version=version+1,updated_at_utc=clock_timestamp(),updated_by=auth.uid()
 where id=r.id returning * into r;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,auth.uid(),'people',r.id::text,case when p_deleted then 'DELETE' else 'RESTORE' end,
 before_row,to_jsonb(r)-'creation_request_id');
end; $$;
revoke all on all functions in schema people_private from public,anon,authenticated;
revoke all on function public.read_person(uuid,uuid) from public,anon;
revoke all on function public.list_people(uuid,text,boolean,integer,integer) from public,anon;
revoke all on function public.person_duplicates(uuid,jsonb,uuid) from public,anon;
revoke all on function public.save_person(uuid,uuid,uuid,bigint,jsonb) from public,anon;
revoke all on function public.set_person_deleted(uuid,uuid,bigint,boolean) from public,anon;
grant execute on function public.read_person(uuid,uuid) to authenticated;
grant execute on function public.list_people(uuid,text,boolean,integer,integer) to authenticated;
grant execute on function public.person_duplicates(uuid,jsonb,uuid) to authenticated;
grant execute on function public.save_person(uuid,uuid,uuid,bigint,jsonb) to authenticated;
grant execute on function public.set_person_deleted(uuid,uuid,bigint,boolean) to authenticated;
alter publication supabase_realtime add table public.people;
commit;
