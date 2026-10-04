-- Additive Web bed board. Interval contracts, old rows and payment semantics stay intact.
begin;
alter table public.sleeping_places
 add column bed_code text check(bed_code is null or (length(btrim(bed_code)) between 1 and 64)),
 add column listed_price numeric(20,4) check(listed_price >= 0 and listed_price < 'Infinity');
alter table public.accommodation_assignments
 add column agreed_price numeric(20,4) check(agreed_price >= 0 and agreed_price < 'Infinity');
create unique index sleeping_places_room_code on public.sleeping_places(event_id,room_id,lower(btrim(bed_code)))
 where not is_deleted and bed_code is not null and room_id is not null;

create or replace function accommodation_private.save(p_kind text,p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare tab text; cols text[]; selected text; assignments text; before_row jsonb; after_row jsonb; rid uuid; actor uuid:=auth.uid();
begin
 perform transport_private.authorize(p_event_id,true);
 -- One event lock orders all hierarchy writes and assignment lifecycle changes.
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,31));
 case p_kind
 when 'apartment' then tab:='apartments'; cols:=array['name','address','hebrew_address','floor','entry_code','landlord_name','landlord_phone','notes','status','total_cost','cost_currency','cost_notes'];
 when 'room' then tab:='rooms'; cols:=array['apartment_id','name_or_number','floor','description','notes'];
 when 'sleeping_place' then tab:='sleeping_places'; cols:=array['room_id','label','type','custom_type_name','position_notes','is_active','bed_code','listed_price'];
 when 'accommodation_assignment' then tab:='accommodation_assignments'; cols:=array['sleeping_place_id','person_id','start_date','end_date','status','notes','is_locked','agreed_price'];
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
  if (p_kind='room' and before_row->>'apartment_id' is not null and before_row->'apartment_id' is distinct from p_fields->'apartment_id')
   or (p_kind='sleeping_place' and before_row->>'room_id' is not null and before_row->'room_id' is distinct from p_fields->'room_id')
   or (p_kind='accommodation_assignment' and (before_row->>'has_been_operational')::boolean and (before_row->'sleeping_place_id' is distinct from p_fields->'sleeping_place_id' or before_row->'person_id' is distinct from p_fields->'person_id'))
   then raise exception using errcode='22023',message='Create a new record to move; preserve history'; end if;
 end if;
 -- Provided references are enforced by the unchanged composite foreign keys.
 -- Null references represent incomplete data, never a cross-event relationship.
 -- Tombstones retain children. Managers may end/cancel or correct history under a tombstoned parent.
 -- New active assignments require a live hierarchy/person; inactive status is advisory, never an inferred override.
 if p_id is null
  or (p_kind='room' and before_row->>'apartment_id' is null)
  or (p_kind='sleeping_place' and before_row->>'room_id' is null)
  or (p_kind='accommodation_assignment' and before_row->>'status' not in ('ACTIVE','TEMPORARY') and p_fields->>'status' in ('ACTIVE','TEMPORARY')) then
  if p_kind='room' and exists(select 1 from public.apartments where id=(p_fields->>'apartment_id')::uuid and is_deleted)
   or p_kind='sleeping_place' and exists(select 1 from public.rooms r left join public.apartments a on a.event_id=r.event_id and a.id=r.apartment_id where r.id=(p_fields->>'room_id')::uuid and (r.is_deleted or a.is_deleted))
   or p_kind='accommodation_assignment' and (exists(select 1 from public.people where id=(p_fields->>'person_id')::uuid and is_deleted)
    or exists(select 1 from public.sleeping_places b left join public.rooms r on r.event_id=b.event_id and r.id=b.room_id left join public.apartments a on a.event_id=r.event_id and a.id=r.apartment_id where b.id=(p_fields->>'sleeping_place_id')::uuid and (b.is_deleted or r.is_deleted or a.is_deleted)))
   then raise exception using errcode='23503',message='Restore the referenced record before creating'; end if;
  if p_kind='accommodation_assignment' and p_fields->>'status' in ('ACTIVE','TEMPORARY') and exists(select 1 from public.events where id=p_event_id and lifecycle_stage='CLOSEOUT') then
   raise exception using errcode='40001',message='No new assignments in closeout'; end if;
 end if;
 -- Activation needs a complete hierarchy; inactive status remains an advisory.
 if p_kind='accommodation_assignment' and p_fields->>'sleeping_place_id' is not null
 and not exists(select 1 from public.sleeping_places where event_id=p_event_id and id=(p_fields->>'sleeping_place_id')::uuid) then
  raise exception using errcode='23503',message='Sleeping place unavailable in this event';
 end if;
 if p_kind='accommodation_assignment' and p_fields->>'status' in ('ACTIVE','TEMPORARY')
 and not exists(select 1 from public.sleeping_places b join public.rooms r on (r.event_id,r.id)=(b.event_id,b.room_id)
 join public.apartments a on (a.event_id,a.id)=(r.event_id,r.apartment_id)
 where b.event_id=p_event_id and b.id=(p_fields->>'sleeping_place_id')::uuid) then
  raise exception using errcode='23514',message='Choose a sleeping place with a room and apartment before activation';
 end if;
 -- Preserve additive fields omitted by older clients.
 if p_kind='sleeping_place' then
  if not (p_fields ? 'bed_code') then cols:=array_remove(cols,'bed_code'); end if;
  if not (p_fields ? 'listed_price') then cols:=array_remove(cols,'listed_price'); end if;
 elsif p_kind='accommodation_assignment' and not (p_fields ? 'agreed_price') then cols:=array_remove(cols,'agreed_price');
 end if;
 if (p_fields->>'listed_price' is not null and p_fields->>'listed_price' !~ '^[0-9]{1,16}(\.[0-9]{1,4})?$')
 or (p_fields->>'agreed_price' is not null and p_fields->>'agreed_price' !~ '^[0-9]{1,16}(\.[0-9]{1,4})?$') then
  raise exception using errcode='22023',message='Price must be nonnegative with at most four decimal places';
 end if;
 select string_agg(format('%I',c),',') into selected from unnest(cols) c;
 if p_id is null then
  execute format('insert into public.%I(event_id,creation_request_id,creation_payload,created_by,updated_by,%s) select $1,$2,$3,$4,$4,%s from jsonb_populate_record(null::public.%I,$3) returning id',tab,selected,selected,tab) into rid using p_event_id,p_request_id,p_fields,actor;
 else
  select string_agg(format('%I=x.%I',c,c),',') into assignments from unnest(cols) c;
  execute format('update public.%I t set %s,version=t.version+1,updated_at_utc=clock_timestamp(),updated_by=$3 from jsonb_populate_record(null::public.%I,$4) x where t.id=$1 and t.event_id=$2 returning t.id',tab,assignments,tab) into rid using p_id,p_event_id,actor,p_fields;
 end if;
 if p_kind='accommodation_assignment' then
  update public.accommodation_assignments set has_been_operational=has_been_operational or status in ('ACTIVE','TEMPORARY') where id=rid;
 end if;
 execute format('select to_jsonb(t)-''creation_request_id''-''creation_payload'' from public.%I t where id=$1',tab) into after_row using rid;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,tab,rid::text,case when p_id is null then 'CREATE' else 'UPDATE' end,before_row-'creation_request_id'-'creation_payload',after_row);
 return rid;
end; $$;

create or replace function public.read_accommodation(p_event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id,false);
 select jsonb_build_object(
 'apartments',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('total_cost',total_cost::text) order by created_at_utc,id) from public.apartments t where event_id=p_event_id),'[]'::jsonb),
 'rooms',coalesce((select jsonb_agg(to_jsonb(t)-'creation_request_id'-'creation_payload' order by created_at_utc,id) from public.rooms t where event_id=p_event_id),'[]'::jsonb),
 'sleeping_places',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('listed_price',listed_price::text) order by created_at_utc,id) from public.sleeping_places t where event_id=p_event_id),'[]'::jsonb),
 'accommodation_assignments',coalesce((select jsonb_agg((to_jsonb(t)-'creation_request_id'-'creation_payload') || jsonb_build_object('agreed_price',agreed_price::text) order by created_at_utc,id) from public.accommodation_assignments t where event_id=p_event_id),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'event_id',event_id,'label',first_name||' '||last_name,'is_deleted',is_deleted) order by last_name,first_name,id) from public.people where event_id=p_event_id),'[]'::jsonb),
 'overlaps',coalesce((select jsonb_agg(jsonb_build_object('rule_code','ACCOMMODATION_OVERLAP','first_id',a.id,'second_id',b.id) order by a.id,b.id)
 from public.accommodation_assignments a join public.accommodation_assignments b on a.event_id=b.event_id and a.sleeping_place_id=b.sleeping_place_id and a.id<b.id
 where a.event_id=p_event_id and not a.is_deleted and not b.is_deleted and a.status in ('ACTIVE','TEMPORARY') and b.status in ('ACTIVE','TEMPORARY')
 and greatest(a.start_date,b.start_date)<least(a.end_date,b.end_date)),'[]'::jsonb)) into result;
 return result;
end; $$;

-- Only definer RPCs access retry records; no client DML or public read policy.
create table accommodation_private.web_requests (
 request_id uuid primary key, event_id uuid not null references public.events(id),
 actor_id uuid not null references auth.users(id), payload jsonb not null, result uuid[] not null
);
alter table accommodation_private.web_requests enable row level security;
revoke all on accommodation_private.web_requests from public,anon,authenticated;
create index web_stay_requests_event on accommodation_private.web_requests(event_id);
create index web_stay_requests_actor on accommodation_private.web_requests(actor_id);

create function public.web_create_beds(p_event_id uuid,p_room_id uuid,p_request_id uuid,p_count integer,p_start_code text,p_listed_price text default null)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare old accommodation_private.web_requests; payload jsonb; result uuid[]:='{}'; i integer; prefix text; digits text; code text; first_number bigint; rid uuid;
begin
 perform transport_private.authorize(p_event_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,31));
 if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,32));
 payload:=jsonb_build_object('kind','bulk','room',p_room_id,'count',p_count,'start',p_start_code,'price',p_listed_price);
 select * into old from accommodation_private.web_requests where request_id=p_request_id;
 if found then
  if old.event_id<>p_event_id or old.actor_id<>auth.uid() then raise exception using errcode='42501',message='Not authorized'; end if;
  if old.payload is distinct from payload then raise exception using errcode='40001',message='Request changed'; end if;
  return old.result;
 end if;
 if p_count is null or p_count not between 1 and 100 or p_start_code is null or length(btrim(p_start_code)) not between 1 and 56 then
  raise exception using errcode='22023',message='Use 1 to 100 beds and a short starting code';
 end if;
 if not exists(select 1 from public.rooms r join public.apartments a on (a.event_id,a.id)=(r.event_id,r.apartment_id)
 where r.event_id=p_event_id and r.id=p_room_id and not r.is_deleted and not a.is_deleted) then
  raise exception using errcode='23503',message='Choose a live room in this event';
 end if;
 digits:=substring(btrim(p_start_code) from '[0-9]+$');
 if p_count>1 and (digits is null or length(digits)>9) then raise exception using errcode='22023',message='Multiple beds need a starting code ending in up to nine digits'; end if;
 prefix:=left(btrim(p_start_code),length(btrim(p_start_code))-coalesce(length(digits),0));
 first_number:=case when p_count=1 or digits is null then 0 else digits::bigint end;
 for i in 0..p_count-1 loop
  code:=case when p_count=1 then btrim(p_start_code) else prefix||lpad((first_number+i)::text,greatest(length(digits),length((first_number+i)::text)),'0') end;
  rid:=accommodation_private.save('sleeping_place',p_event_id,gen_random_uuid(),null,null,
   jsonb_build_object('room_id',p_room_id,'bed_code',code,'listed_price',p_listed_price,'label',null,'type','REGULAR_BED','custom_type_name',null,'position_notes',null,'is_active',true));
  result:=array_append(result,rid);
 end loop;
 insert into accommodation_private.web_requests values(p_request_id,p_event_id,auth.uid(),payload,result);
 return result;
end; $$;
revoke all on function public.web_create_beds(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.web_create_beds(uuid,uuid,uuid,integer,text,text) to authenticated;

-- A move cancels the original and creates a replacement in one audited transaction.
-- It never changes historical assignment identity or chooses a bed automatically.
create function public.web_move_stay(p_event_id uuid,p_id uuid,p_expected_version bigint,p_sleeping_place_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare old accommodation_private.web_requests; payload jsonb; source public.accommodation_assignments; fields jsonb; rid uuid; start_on date; end_on date;
begin
 perform transport_private.authorize(p_event_id,true);
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,31));
 if p_request_id is null then raise exception using errcode='22023',message='Request required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,32));
 payload:=jsonb_build_object('kind','move','id',p_id,'version',p_expected_version,'bed',p_sleeping_place_id);
 select * into old from accommodation_private.web_requests where request_id=p_request_id;
 if found then
  if old.event_id<>p_event_id or old.actor_id<>auth.uid() then raise exception using errcode='42501',message='Not authorized'; end if;
  if old.payload is distinct from payload then raise exception using errcode='40001',message='Request changed'; end if;
  return old.result[1];
 end if;
 select * into source from public.accommodation_assignments where event_id=p_event_id and id=p_id for update;
 if not found then raise exception using errcode='42501',message='Assignment unavailable'; end if;
 if source.version is distinct from p_expected_version or source.is_deleted or source.status='CANCELLED' then raise exception using errcode='40001',message='Assignment changed'; end if;
 if p_sleeping_place_id is null or p_sleeping_place_id is not distinct from source.sleeping_place_id then raise exception using errcode='22023',message='Choose another bed'; end if;
 select start_date,end_date into start_on,end_on from public.events where id=p_event_id;
 fields:=jsonb_build_object('person_id',source.person_id,'sleeping_place_id',source.sleeping_place_id,'start_date',source.start_date,'end_date',source.end_date,
 'status','CANCELLED','notes',source.notes,'is_locked',source.is_locked,'agreed_price',source.agreed_price::text);
 perform accommodation_private.save('accommodation_assignment',p_event_id,null,p_id,p_expected_version,fields);
 fields:=fields||jsonb_build_object('sleeping_place_id',p_sleeping_place_id,'status',source.status,'start_date',start_on,'end_date',end_on);
 rid:=accommodation_private.save('accommodation_assignment',p_event_id,gen_random_uuid(),null,null,fields);
 insert into accommodation_private.web_requests values(p_request_id,p_event_id,auth.uid(),payload,array[rid]);
 return rid;
end; $$;
revoke all on function public.web_move_stay(uuid,uuid,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.web_move_stay(uuid,uuid,bigint,uuid,uuid) to authenticated;
commit;
