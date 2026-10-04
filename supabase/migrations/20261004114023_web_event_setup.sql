begin;
-- Preserve existing creation and lifecycle RPCs for older clients.
create table web_private.event_creation_requests (
 request_id uuid primary key,
 actor_id uuid not null references auth.users(id),
 event_id uuid not null references public.events(id),
 payload jsonb not null
);
alter table web_private.event_creation_requests enable row level security;
revoke all on web_private.event_creation_requests from public,anon,authenticated;
create index event_creation_requests_actor on web_private.event_creation_requests(actor_id);
create index event_creation_requests_event on web_private.event_creation_requests(event_id);

create function public.web_can_create_event() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.event_members where user_id=auth.uid() and role='administrator');
$$;
revoke all on function public.web_can_create_event() from public,anon,authenticated;
grant execute on function public.web_can_create_event() to authenticated;

create function web_private.validate_event_setup(p_fields jsonb) returns void
language plpgsql set search_path='' as $$
declare value public.events;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception using errcode='22023',message='Invalid event fields'; end if;
 if exists(select 1 from jsonb_each(p_fields) x where x.key not in ('name','hebrew_name','description','manager_notes','year','start_date','end_date','base_currency')
  or (jsonb_typeof(x.value)<>'null' and jsonb_typeof(x.value)<>case when x.key='year' then 'number' else 'string' end)) then
  raise exception using errcode='22023',message='Invalid event fields'; end if;
 if p_fields->>'year' is not null and p_fields->>'year' !~ '^[0-9]{4}$' then raise exception using errcode='22023',message='Invalid year'; end if;
 if (p_fields->>'start_date' is not null and p_fields->>'start_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
 or (p_fields->>'end_date' is not null and p_fields->>'end_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception using errcode='22023',message='Invalid calendar date'; end if;
 select * into value from jsonb_populate_record(null::public.events,p_fields);
 if value.name is null or value.name !~ '[^[:space:]]' or length(btrim(value.name)) not between 1 and 200
 or length(value.hebrew_name)>200 or length(value.description)>10000 or length(value.manager_notes)>10000
 or value.year not between 1900 and 2200 or value.end_date<=value.start_date
 or value.base_currency !~ '^[A-Z]{3}$' then raise exception using errcode='22023',message='Invalid event fields'; end if;
 -- The existing events_base_currency_iso constraint is the authoritative allowlist.
end; $$;
revoke all on function web_private.validate_event_setup(jsonb) from public,anon,authenticated;

create function public.web_create_event(p_request_id uuid,p_fields jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); prior web_private.event_creation_requests; value public.events; rid uuid;
begin
 perform 1 from public.event_members where user_id=actor and role='administrator' order by event_id limit 1 for share;
 if actor is null or not found then raise exception using errcode='42501',message='Not authorized'; end if;
 if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
 -- Same namespace as legacy create_event serializes cross-client request collisions.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from web_private.event_creation_requests where request_id=p_request_id;
 if found then
  if prior.actor_id<>actor or not public.is_event_admin(prior.event_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  if prior.payload is distinct from p_fields then raise exception using errcode='40001',message='Creation request changed'; end if;
  return prior.event_id;
 end if;
 perform web_private.validate_event_setup(p_fields);
 select * into value from jsonb_populate_record(null::public.events,p_fields);
 insert into public.events(creation_request_id,name,hebrew_name,description,manager_notes,year,start_date,end_date,base_currency,created_by,updated_by)
 values(p_request_id,value.name,value.hebrew_name,value.description,value.manager_notes,value.year,value.start_date,value.end_date,value.base_currency,actor,actor) returning id into rid;
 insert into public.event_members(event_id,user_id,role,created_by) values(rid,actor,'administrator',actor);
 -- Existing audit_event and audit_member triggers record both operations atomically.
 insert into web_private.event_creation_requests values(p_request_id,actor,rid,p_fields);
 return rid;
end; $$;
revoke all on function public.web_create_event(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.web_create_event(uuid,jsonb) to authenticated;

create or replace function public.edit_event_details(p_id uuid,p_expected_version bigint,
 p_name text,p_hebrew_name text,p_description text,p_manager_notes text,
 p_year integer,p_start_date date,p_end_date date,p_base_currency text)
returns public.events language plpgsql security definer set search_path='' as $$
declare result public.events; actor uuid:=auth.uid();
begin
 perform 1 from public.event_members where event_id=p_id and user_id=actor and role='administrator' for share;
 if actor is null or not found then raise exception using errcode='42501',message='Not authorized'; end if;
 if p_expected_version is null or p_expected_version<1 then raise exception using errcode='22023',message='Invalid version'; end if;
 perform web_private.validate_event_setup(jsonb_build_object('name',p_name,'hebrew_name',p_hebrew_name,'description',p_description,'manager_notes',p_manager_notes,'year',p_year,'start_date',p_start_date,'end_date',p_end_date,'base_currency',p_base_currency));
 update public.events set name=p_name,hebrew_name=p_hebrew_name,description=p_description,manager_notes=p_manager_notes,year=p_year,
 start_date=p_start_date,end_date=p_end_date,base_currency=p_base_currency,version=version+1,updated_at_utc=clock_timestamp(),updated_by=actor
 where id=p_id and version=p_expected_version and not is_deleted and lifecycle_stage<>'ARCHIVED' returning * into result;
 if not found then raise exception using errcode='40001',message='Record changed or is read-only'; end if;
 return result;
end; $$;
revoke all on function public.edit_event_details(uuid,bigint,text,text,text,text,integer,date,date,text) from public,anon;
grant execute on function public.edit_event_details(uuid,bigint,text,text,text,text,integer,date,date,text) to authenticated;
commit;
