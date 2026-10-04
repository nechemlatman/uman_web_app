begin;
-- No existing business rows are rewritten. Missing names remain genuine missing values.
alter table public.people drop constraint people_first_name_check;
alter table public.people add constraint people_first_name_check check(length(first_name)<=200);
alter table public.apartments alter column name drop not null;
alter table public.rooms alter column name_or_number drop not null;
alter table public.drivers alter column full_name drop not null;
alter table public.vehicles alter column name drop not null, alter column capacity drop not null;
alter table public.drivers add constraint drivers_meaningful check(coalesce(full_name,'')||coalesce(phone_number,'')||coalesce(whatsapp_phone,'')||coalesce(license_number,'')||coalesce(notes,'') ~ '[^[:space:]]') not valid;
alter table public.drivers add constraint drivers_operational check(status not in ('AVAILABLE','BUSY') or coalesce(full_name,'') ~ '[^[:space:]]') not valid;
alter table public.vehicles add constraint vehicles_meaningful check(coalesce(name,'')||coalesce(license_plate,'')||coalesce(notes,'') ~ '[^[:space:]]') not valid;
alter table public.vehicles add constraint vehicles_operational check(status not in ('AVAILABLE','IN_USE') or (coalesce(name,'') ~ '[^[:space:]]' and capacity is not null)) not valid;
alter table public.tasks alter column title drop not null;
alter table public.apartment_issues alter column title drop not null, alter column apartment_id drop not null;
alter table public.tasks add constraint tasks_meaningful check(coalesce(title,'')||coalesce(description,'')||coalesce(notes,'') ~ '[^[:space:]]') not valid;
alter table public.apartment_issues add constraint issues_meaningful check(coalesce(title,'')||coalesce(description,'')||coalesce(notes,'') ~ '[^[:space:]]') not valid;
alter table public.apartment_issues add constraint issues_operational check(status='OPEN' or apartment_id is not null) not valid;
-- NOT VALID preserves legacy rows while enforcing new/updated records.
CREATE OR REPLACE FUNCTION people_private.validate_fields(p_fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare k text; v jsonb;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or
 not exists(select 1 from unnest(array['first_name','last_name','hebrew_first_name','hebrew_last_name','phone','whatsapp_phone','email','passport_name','notes']) identity_key where coalesce(p_fields->>identity_key,'') ~ '[^[:space:]]') or
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_person(p_event_id uuid, p_request_id uuid, p_id uuid, p_expected_version bigint, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 values(p_event_id,p_request_id,coalesce(p_fields->>'first_name',''),coalesce(p_fields->>'last_name',''),
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
 update public.people set first_name=coalesce(p_fields->>'first_name',''),last_name=coalesce(p_fields->>'last_name',''),
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.person_duplicates(p_event_id uuid, p_fields jsonb, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS SETOF people
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform people_private.authorize(p_event_id,false);
 return query select p.* from public.people p where p.event_id=p_event_id
 and not p.is_deleted and (p_exclude is null or p.id<>p_exclude) and (
 (length(regexp_replace(coalesce(p_fields->>'phone',''),'[^0-9]','','g'))>0 and
 regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(p_fields->>'phone','[^0-9]','','g'))
 or (coalesce(p_fields->>'first_name','') ~ '[^[:space:]]' and lower(btrim(p.first_name))=lower(btrim(p_fields->>'first_name')) and
 (lower(btrim(p.last_name))=lower(btrim(coalesce(p_fields->>'last_name',''))) or
 (length(btrim(coalesce(p_fields->>'last_name','')))>2 and
 starts_with(lower(p.last_name),lower(btrim(p_fields->>'last_name')))))))
 order by p.id limit 20;
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_driver(p_event_id uuid, p_request_id uuid, p_id uuid, p_expected_version bigint, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.drivers; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform transport_private.authorize(p_event_id, true);

 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or
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
      coalesce(a.new_value->>'notes','') is distinct from coalesce(p_fields->>'notes','') or coalesce(a.new_value->>'whatsapp_phone','') is distinct from coalesce(p_fields->>'whatsapp_phone','') or coalesce(a.new_value->>'phone_number','') is distinct from coalesce(p_fields->>'phone_number','') or
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_vehicle(p_event_id uuid, p_request_id uuid, p_id uuid, p_expected_version bigint, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.vehicles; before_row jsonb; actor uuid:=auth.uid(); created boolean:=p_id is null;
begin
 perform transport_private.authorize(p_event_id, true);

 if p_fields is null or jsonb_typeof(p_fields) <> 'object' or
    length(coalesce(p_fields->>'name', '')) > 100 or
    coalesce(p_fields->>'vehicle_type','') not in ('CAR', 'VAN', 'MINIBUS', 'BUS', 'CUSTOM') or
    coalesce(p_fields->>'status','') not in ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'UNAVAILABLE') or
    (p_fields->>'capacity' is not null and (p_fields->>'capacity' !~ '^[0-9]+$' or (p_fields->>'capacity')::integer < 1)) then
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.read_accommodation(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id,false);
 select jsonb_build_object(
 'apartments',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('total_cost',total_cost::text) order by created_at_utc,id) from public.apartments t where event_id=p_event_id),'[]'::jsonb),
 'rooms',coalesce((select jsonb_agg(to_jsonb(t)-'creation_request_id'-'creation_payload' order by created_at_utc,id) from public.rooms t where event_id=p_event_id),'[]'::jsonb),
 'sleeping_places',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('listed_price',listed_price::text) order by created_at_utc,id) from public.sleeping_places t where event_id=p_event_id),'[]'::jsonb),
 'accommodation_assignments',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('agreed_price',agreed_price::text) order by created_at_utc,id) from public.accommodation_assignments t where event_id=p_event_id),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'event_id',event_id,'label',coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),nullif(btrim(concat_ws(' ',hebrew_first_name,hebrew_last_name)),''),nullif(btrim(phone),''),nullif(btrim(whatsapp_phone),''),''),'is_deleted',is_deleted) order by last_name,first_name,id) from public.people where event_id=p_event_id),'[]'::jsonb),
 'overlaps',coalesce((select jsonb_agg(jsonb_build_object('rule_code','ACCOMMODATION_OVERLAP','first_id',a.id,'second_id',b.id) order by a.id,b.id)
 from public.accommodation_assignments a join public.accommodation_assignments b on a.event_id=b.event_id and a.sleeping_place_id=b.sleeping_place_id and a.id<b.id
 where a.event_id=p_event_id and not a.is_deleted and not b.is_deleted and a.status in ('ACTIVE','TEMPORARY') and b.status in ('ACTIVE','TEMPORARY')
 and greatest(a.start_date,b.start_date)<least(a.end_date,b.end_date)),'[]'::jsonb)) into result;
 return result;
end; $function$
;
create function public.web_list_people(p_event_id uuid,p_query text default '',p_deleted boolean default false,p_limit integer default 40,p_offset integer default 0,p_sort text default 'newest',p_id uuid default null,p_status text default null)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform people_private.authorize(p_event_id,false);
 if p_query is null or length(p_query)>200 or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 or p_sort not in ('newest','name') or p_deleted is null then raise exception using errcode='22023',message='Invalid search';end if;
 return query select (to_jsonb(p)-'creation_request_id')||jsonb_build_object('display_label',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(btrim(concat_ws(' ',p.hebrew_first_name,p.hebrew_last_name)),''),nullif(btrim(p.phone),''),nullif(btrim(p.whatsapp_phone),''),nullif(btrim(d.email),''),nullif(btrim(d.passport_name),''),''))
 from public.people p join people_private.person_details d on (d.event_id,d.person_id)=(p.event_id,p.id)
 where p.event_id=p_event_id and (p_id is not null or p.is_deleted=p_deleted) and (p_id is null or p.id=p_id) and (p_status is null or p.status=p_status)
 and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),'[[:space:]]+') token where token<>'' and strpos(lower(concat_ws(' ',p.first_name,p.last_name,p.hebrew_first_name,p.hebrew_last_name,p.phone,p.whatsapp_phone,d.email,d.passport_name,d.notes)),token)=0)
 order by case when p_sort='name' then coalesce(nullif(p.first_name,''),nullif(p.hebrew_first_name,''),p.phone) end,case when p_sort='newest' then p.created_at_utc end desc,p.id limit p_limit offset p_offset;
end; $$;
revoke all on function public.web_list_people(uuid,text,boolean,integer,integer,text,uuid,text) from public,anon,authenticated;
grant execute on function public.web_list_people(uuid,text,boolean,integer,integer,text,uuid,text) to authenticated;
commit;
