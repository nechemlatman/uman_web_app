-- Additive Web operations. Existing source records and RPCs are not rewritten.
begin;
create schema web_private;
revoke all on schema web_private from public,anon,authenticated;

create table public.tasks(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique,creation_payload jsonb not null,
 title text not null check(length(btrim(title)) between 1 and 200),description text check(length(description)<=10000),
 assignee_id uuid,priority text not null check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
 due_date_utc timestamptz,status text not null check(status in ('NEW','IN_PROGRESS','WAITING','COMPLETED','CANCELLED')),
 completed_at_utc timestamptz,cancelled_at_utc timestamptz,notes text check(length(notes)<=10000),
 is_deleted boolean not null default false,deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(),updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0),unique(event_id,id),
 foreign key(event_id,assignee_id) references public.people(event_id,id),
 check(is_deleted=(deleted_at_utc is not null)),
 check((status='COMPLETED')=(completed_at_utc is not null)),check((status='CANCELLED')=(cancelled_at_utc is not null))
);
create table public.apartment_issues(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique,creation_payload jsonb not null,
 title text not null check(length(btrim(title)) between 1 and 200),description text check(length(description)<=10000),
 apartment_id uuid not null,reporter_id uuid,priority text not null check(priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
 status text not null check(status in ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
 resolved_at_utc timestamptz,resolution_notes text check(length(resolution_notes)<=10000),notes text check(length(notes)<=10000),
 is_deleted boolean not null default false,deleted_at_utc timestamptz,
 created_at_utc timestamptz not null default now(),updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 version bigint not null default 1 check(version>0),unique(event_id,id),
 foreign key(event_id,apartment_id) references public.apartments(event_id,id),
 foreign key(event_id,reporter_id) references public.people(event_id,id),check(is_deleted=(deleted_at_utc is not null))
);
create table public.payments(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique,creation_payload jsonb not null,person_id uuid not null,
 amount numeric(20,4) not null check(amount>0 and amount<'Infinity'),currency text not null check(currency ~ '^[A-Z]{3}$'),
 base_amount numeric(20,4),base_currency text not null,exchange_rate numeric(24,10) check(exchange_rate>0 and exchange_rate<'Infinity'),
 exchange_rate_source text not null default 'MANUAL' check(exchange_rate_source='MANUAL'),exchange_rate_timestamp_utc timestamptz,
 payment_date date not null,payment_method text not null check(payment_method in ('CASH','BANK_TRANSFER','CREDIT_CARD','CHECK','OTHER','CUSTOM')),
 reference text check(length(reference)<=320),notes text check(length(notes)<=10000),is_locked boolean not null default true check(is_locked),
 reversed_at_utc timestamptz,reversed_by uuid references auth.users(id),
 is_deleted boolean not null default false check(not is_deleted),deleted_at_utc timestamptz check(deleted_at_utc is null),
 created_at_utc timestamptz not null default now(),updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),version bigint not null default 1 check(version>0),
 unique(event_id,id),foreign key(event_id,person_id) references public.people(event_id,id),
 check((exchange_rate is null)=(base_amount is null)),check((reversed_at_utc is null)=(reversed_by is null))
);
create table public.expenses(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),
 creation_request_id uuid not null unique,creation_payload jsonb not null,
 description text not null check(length(btrim(description)) between 1 and 10000),category text check(length(category)<=320),payer_id uuid,
 original_amount numeric(20,4) not null check(original_amount>0 and original_amount<'Infinity'),original_currency text not null check(original_currency ~ '^[A-Z]{3}$'),
 base_amount numeric(20,4),base_currency text not null,exchange_rate numeric(24,10) check(exchange_rate>0 and exchange_rate<'Infinity'),
 exchange_rate_source text not null default 'MANUAL' check(exchange_rate_source='MANUAL'),exchange_rate_timestamp_utc timestamptz,
 expense_date date not null,receipt_reference text check(length(receipt_reference)<=320),notes text check(length(notes)<=10000),
 is_locked boolean not null default true check(is_locked),reversed_at_utc timestamptz,reversed_by uuid references auth.users(id),
 is_deleted boolean not null default false check(not is_deleted),deleted_at_utc timestamptz check(deleted_at_utc is null),
 created_at_utc timestamptz not null default now(),updated_at_utc timestamptz not null default now(),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),version bigint not null default 1 check(version>0),
 unique(event_id,id),foreign key(event_id,payer_id) references public.people(event_id,id),
 check((exchange_rate is null)=(base_amount is null)),check((reversed_at_utc is null)=(reversed_by is null))
);
-- Use the existing authoritative ISO currency allowlist without inventing a second list.
do $$ declare expr text;begin
 select pg_get_constraintdef(oid) into expr from pg_constraint where conrelid='public.events'::regclass and conname='events_base_currency_iso';
 if expr is null then
 select pg_get_constraintdef(oid) into expr from pg_constraint where conrelid='public.events'::regclass and contype='c' and pg_get_constraintdef(oid) like '%base_currency = ANY%';
 end if;
 if expr is null then raise exception 'Existing currency contract required';end if;
 execute 'alter table public.payments add constraint payment_currency_iso '||replace(expr,'base_currency','currency');
 execute 'alter table public.expenses add constraint expense_currency_iso '||replace(expr,'base_currency','original_currency');
end; $$;

do $$ declare tab text;begin foreach tab in array array['tasks','apartment_issues','payments','expenses'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('create policy member_read on public.%I for select to authenticated using (public.is_event_admin(event_id))',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create index on public.%I(event_id,is_deleted,created_at_utc desc,id)',tab);
 execute format('create index on public.%I(created_by)',tab);
 execute format('create index on public.%I(updated_by)',tab);
 execute format('alter publication supabase_realtime add table public.%I',tab);
end loop;end; $$;
create index on public.tasks(event_id,assignee_id);
create index on public.tasks(event_id,status,due_date_utc) where not is_deleted;
create index on public.apartment_issues(event_id,apartment_id);
create index on public.apartment_issues(event_id,reporter_id);
create index on public.payments(event_id,person_id);
create index on public.expenses(event_id,payer_id);
create index on public.payments(reversed_by);
create index on public.expenses(reversed_by);

create function web_private.save(p_kind text,p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare tab text;cols text[];selected text;assignments text;old_doc jsonb;new_doc jsonb;payload jsonb:=p_fields;rid uuid;actor uuid:=auth.uid();
 base text;source_currency text;amount numeric;rate numeric;financial boolean:=p_kind in ('payment','expense');
begin
 perform transport_private.authorize(p_event_id,true);
 case p_kind
 when 'task' then tab:='tasks';cols:=array['title','description','assignee_id','priority','due_date_utc','status','notes','completed_at_utc','cancelled_at_utc'];
 when 'apartment_issue' then tab:='apartment_issues';cols:=array['title','description','apartment_id','reporter_id','priority','status','resolution_notes','notes','resolved_at_utc'];
 when 'payment' then tab:='payments';cols:=array['person_id','amount','currency','payment_date','payment_method','reference','notes','exchange_rate','exchange_rate_timestamp_utc','base_currency','base_amount'];
 when 'expense' then tab:='expenses';cols:=array['description','category','payer_id','original_amount','original_currency','expense_date','receipt_reference','notes','exchange_rate','exchange_rate_timestamp_utc','base_currency','base_amount'];
 else raise exception using errcode='22023',message='Unknown kind';end case;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or exists(select 1 from jsonb_object_keys(p_fields) k where not k=any(cols) or k=any(array['base_currency','base_amount','completed_at_utc','cancelled_at_utc','resolved_at_utc'])) then raise exception using errcode='22023',message='Invalid fields';end if;
 if p_id is null then
  if p_request_id is null then raise exception using errcode='22023',message='Request required';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,91));
  execute format('select to_jsonb(t) from public.%I t where creation_request_id=$1',tab) into old_doc using p_request_id;
  if old_doc is not null then
   if old_doc->>'event_id'<>p_event_id::text or old_doc->>'created_by'<>actor::text then raise exception using errcode='42501',message='Not authorized';end if;
   if old_doc->'creation_payload' is distinct from p_fields then raise exception using errcode='40001',message='Creation payload changed';end if;
   return (old_doc->>'id')::uuid;
  end if;
 else
  if financial then raise exception using errcode='22023',message='Reverse and create a corrected entry';end if;
  execute format('select to_jsonb(t) from public.%I t where event_id=$1 and id=$2 for update',tab) into old_doc using p_event_id,p_id;
  if old_doc is null then raise exception using errcode='42501',message='Unavailable';end if;
  if (old_doc->>'version')::bigint is distinct from p_expected_version or (old_doc->>'is_deleted')::boolean then raise exception using errcode='40001',message='Changed';end if;
 end if;
 if financial then
  select base_currency into base from public.events where id=p_event_id;
  if base is null then raise exception using errcode='22023',message='Set event currency first';end if;
  source_currency:=case when p_kind='payment' then p_fields->>'currency' else p_fields->>'original_currency' end;
  if coalesce(case when p_kind='payment' then p_fields->>'amount' else p_fields->>'original_amount' end,'') !~ '^[0-9]+(\.[0-9]{1,4})?$' then raise exception using errcode='22023',message='Amount precision';end if;
  amount:=(case when p_kind='payment' then p_fields->>'amount' else p_fields->>'original_amount' end)::numeric;
  if p_fields->>'exchange_rate' is not null and p_fields->>'exchange_rate' !~ '^[0-9]+(\.[0-9]{1,10})?$' then raise exception using errcode='22023',message='Rate precision';end if;
  rate:=(p_fields->>'exchange_rate')::numeric;
  if source_currency=base then
   if rate is not null and rate<>1 then raise exception using errcode='22023',message='Same currency rate must be one';end if;
   rate:=1;
  end if;
  if rate is not null and rate<=0 then raise exception using errcode='22023',message='Rate must be positive';end if;
  if rate is not null and source_currency<>base and p_fields->>'exchange_rate_timestamp_utc' is null then raise exception using errcode='22023',message='Rate timestamp required';end if;
  payload:=payload||jsonb_build_object('base_currency',base,'exchange_rate',rate,'base_amount',case when rate is not null then round(amount/rate,4) end);
 end if;
 if p_kind='task' then payload:=payload||jsonb_build_object('completed_at_utc',case when payload->>'status'='COMPLETED' then coalesce(old_doc->>'completed_at_utc',clock_timestamp()::text) end,'cancelled_at_utc',case when payload->>'status'='CANCELLED' then coalesce(old_doc->>'cancelled_at_utc',clock_timestamp()::text) end);end if;
 if p_kind='apartment_issue' then payload:=payload||jsonb_build_object('resolved_at_utc',case when payload->>'status' in ('RESOLVED','CLOSED') then coalesce(old_doc->>'resolved_at_utc',clock_timestamp()::text) end);end if;
 select string_agg(format('%I',c),',') into selected from unnest(cols)c;
 if p_id is null then
 execute format('insert into public.%I(event_id,creation_request_id,creation_payload,created_by,updated_by,%s) select $1,$2,$3,$4,$4,%s from jsonb_populate_record(null::public.%I,$5) returning id',tab,selected,selected,tab) into rid using p_event_id,p_request_id,p_fields,actor,payload;
 else
 select string_agg(format('%I=x.%I',c,c),',') into assignments from unnest(cols)c;
 execute format('update public.%I t set %s,version=t.version+1,updated_by=$3,updated_at_utc=clock_timestamp() from jsonb_populate_record(null::public.%I,$4)x where t.event_id=$1 and t.id=$2 returning t.id',tab,assignments,tab) into rid using p_event_id,p_id,actor,payload;
 end if;
 execute format('select to_jsonb(t)-''creation_request_id''-''creation_payload'' from public.%I t where id=$1',tab) into new_doc using rid;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,actor,tab,rid::text,case when p_id is null then 'CREATE' else 'UPDATE' end,old_doc-'creation_payload'-'creation_request_id',new_doc);
 return rid;
end; $$;
revoke all on function web_private.save(text,uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;

create function web_private.lifecycle(p_kind text,p_event_id uuid,p_id uuid,p_expected_version bigint,p_deleted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare tab text;old_doc jsonb;new_doc jsonb;financial boolean:=p_kind in ('payment','expense');
begin
 perform transport_private.authorize(p_event_id,true);
 tab:=case p_kind when 'task' then 'tasks' when 'apartment_issue' then 'apartment_issues' when 'payment' then 'payments' when 'expense' then 'expenses' end;
 if tab is null or p_deleted is null then raise exception using errcode='22023',message='Invalid operation';end if;
 execute format('select to_jsonb(t) from public.%I t where event_id=$1 and id=$2 for update',tab) into old_doc using p_event_id,p_id;
 if old_doc is null then raise exception using errcode='42501',message='Unavailable';end if;
 if (old_doc->>'version')::bigint is distinct from p_expected_version then raise exception using errcode='40001',message='Changed';end if;
 if financial then
  if old_doc->>'reversed_at_utc' is not null then return;end if;
  execute format('update public.%I set reversed_at_utc=clock_timestamp(),reversed_by=$3,updated_by=$3,updated_at_utc=clock_timestamp(),version=version+1 where event_id=$1 and id=$2',tab) using p_event_id,p_id,auth.uid();
 else
  execute format('update public.%I set is_deleted=$3,deleted_at_utc=case when $3 then clock_timestamp() end,updated_by=$4,updated_at_utc=clock_timestamp(),version=version+1 where event_id=$1 and id=$2',tab) using p_event_id,p_id,p_deleted,auth.uid();
 end if;
 execute format('select to_jsonb(t)-''creation_request_id''-''creation_payload'' from public.%I t where id=$1',tab) into new_doc using p_id;
 insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
 values(p_event_id,auth.uid(),tab,p_id::text,case when financial then 'REVERSE' when p_deleted then 'DELETE' else 'RESTORE' end,old_doc-'creation_request_id'-'creation_payload',new_doc);
end; $$;
revoke all on function web_private.lifecycle(text,uuid,uuid,bigint,boolean) from public,anon,authenticated;

create function public.save_task(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select web_private.save('task',p_event_id,p_request_id,p_id,p_expected_version,p_fields) $$;
 revoke all on function public.save_task(uuid,uuid,uuid,bigint,jsonb) from public,anon;
 grant execute on function public.save_task(uuid,uuid,uuid,bigint,jsonb) to authenticated;
create function public.set_task_deleted(p_event_id uuid,p_id uuid,p_expected_version bigint,p_deleted boolean) returns void language sql security definer set search_path='' as $$ select web_private.lifecycle('task',p_event_id,p_id,p_expected_version,p_deleted) $$;
revoke all on function public.set_task_deleted(uuid,uuid,bigint,boolean) from public,anon;
grant execute on function public.set_task_deleted(uuid,uuid,bigint,boolean) to authenticated;

create function public.save_apartment_issue(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select web_private.save('apartment_issue',p_event_id,p_request_id,p_id,p_expected_version,p_fields) $$;
 revoke all on function public.save_apartment_issue(uuid,uuid,uuid,bigint,jsonb) from public,anon;
 grant execute on function public.save_apartment_issue(uuid,uuid,uuid,bigint,jsonb) to authenticated;
create function public.set_apartment_issue_deleted(p_event_id uuid,p_id uuid,p_expected_version bigint,p_deleted boolean) returns void language sql security definer set search_path='' as $$ select web_private.lifecycle('apartment_issue',p_event_id,p_id,p_expected_version,p_deleted) $$;
revoke all on function public.set_apartment_issue_deleted(uuid,uuid,bigint,boolean) from public,anon;
grant execute on function public.set_apartment_issue_deleted(uuid,uuid,bigint,boolean) to authenticated;

create function public.save_payment(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select web_private.save('payment',p_event_id,p_request_id,p_id,p_expected_version,p_fields) $$;
 revoke all on function public.save_payment(uuid,uuid,uuid,bigint,jsonb) from public,anon;
 grant execute on function public.save_payment(uuid,uuid,uuid,bigint,jsonb) to authenticated;
create function public.reverse_payment(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select web_private.lifecycle('payment',p_event_id,p_id,p_expected_version,true) $$;
revoke all on function public.reverse_payment(uuid,uuid,bigint) from public,anon;
grant execute on function public.reverse_payment(uuid,uuid,bigint) to authenticated;

create function public.save_expense(p_event_id uuid,p_request_id uuid,p_id uuid,p_expected_version bigint,p_fields jsonb) returns uuid language sql security definer set search_path='' as $$ select web_private.save('expense',p_event_id,p_request_id,p_id,p_expected_version,p_fields) $$;
 revoke all on function public.save_expense(uuid,uuid,uuid,bigint,jsonb) from public,anon;
 grant execute on function public.save_expense(uuid,uuid,uuid,bigint,jsonb) to authenticated;
create function public.reverse_expense(p_event_id uuid,p_id uuid,p_expected_version bigint) returns void language sql security definer set search_path='' as $$ select web_private.lifecycle('expense',p_event_id,p_id,p_expected_version,true) $$;
revoke all on function public.reverse_expense(uuid,uuid,bigint) from public,anon;
grant execute on function public.reverse_expense(uuid,uuid,bigint) to authenticated;

-- Decimal JSON values are strings at the public boundary.
create function public.web_ledger(p_event_id uuid,p_kind text,p_id uuid default null,p_query text default '',p_offset integer default 0,p_person_id uuid default null)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 if p_kind='payment' then
 return query select (to_jsonb(t)-'creation_request_id'-'creation_payload')||jsonb_build_object('amount',amount::text,'base_amount',base_amount::text,'exchange_rate',exchange_rate::text)
 from public.payments t where event_id=p_event_id and (p_id is null or id=p_id) and (p_person_id is null or person_id=p_person_id) and (p_query='' or reference ilike '%'||p_query||'%')
 order by created_at_utc desc,id limit 40 offset greatest(p_offset,0);
 elsif p_kind='expense' then
 return query select (to_jsonb(t)-'creation_request_id'-'creation_payload')||jsonb_build_object('original_amount',original_amount::text,'base_amount',base_amount::text,'exchange_rate',exchange_rate::text)
 from public.expenses t where event_id=p_event_id and (p_id is null or id=p_id) and (p_person_id is null or payer_id=p_person_id) and (p_query='' or description ilike '%'||p_query||'%')
 order by created_at_utc desc,id limit 40 offset greatest(p_offset,0);
 else raise exception using errcode='22023',message='Unknown ledger';end if;
end; $$;
revoke all on function public.web_ledger(uuid,text,uuid,text,integer,uuid) from public,anon;
grant execute on function public.web_ledger(uuid,text,uuid,text,integer,uuid) to authenticated;

create function web_private.protect_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.base_currency is distinct from old.base_currency and (exists(select 1 from public.payments where event_id=old.id) or exists(select 1 from public.expenses where event_id=old.id)) then
 raise exception using errcode='22023',message='Event currency is fixed after financial entries';end if;
 return new;
end; $$;
revoke all on function web_private.protect_currency() from public,anon,authenticated;
create trigger web_currency_integrity before update of base_currency on public.events for each row execute function web_private.protect_currency();

create function public.web_command_center(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id,false);
 with
 alert_rows as (
 select 'OVERDUE_TASK'::text rule,'task'::text kind,id entity_id,title label,'HIGH'::text severity,''::text scope_key
 from public.tasks where event_id=p_event_id and not is_deleted and status not in ('COMPLETED','CANCELLED') and due_date_utc<now()
 union all select 'UNRESOLVED_APARTMENT_ISSUE','apartment_issue',id,title,case when priority='CRITICAL' then 'CRITICAL' else 'MEDIUM' end,'' from public.apartment_issues where event_id=p_event_id and not is_deleted and status in ('OPEN','IN_PROGRESS')
 union all select case when status='CANCELLED' then 'FLIGHT_CANCELLED' else 'FLIGHT_DELAY_IMPACT' end,'flight',id,coalesce(flight_number,'—'),case when status='CANCELLED' then 'CRITICAL' else 'MEDIUM' end,'' from public.flights where event_id=p_event_id and not is_deleted and status in ('CANCELLED','DELAYED')
 union all select 'FLIGHT_MISSING_INFO','flight',id,coalesce(flight_number,'—'),'MEDIUM','' from public.flights where event_id=p_event_id and not is_deleted and status<>'CANCELLED' and (departure_airport is null or arrival_airport is null or scheduled_departure_utc is null or scheduled_arrival_utc is null)
 union all select 'TRN_NO_DRIVER','trip',id,coalesce(origin,'—')||' → '||coalesce(destination,'—'),'HIGH','' from public.trips where event_id=p_event_id and not is_deleted and status not in ('CANCELLED','COMPLETED') and driver_id is null and scheduled_departure_utc between now() and now()+interval '2 hours'
 union all select 'VEHICLE_OVER_CAPACITY','trip',t.id,coalesce(t.origin,'—')||' → '||coalesce(t.destination,'—'),'HIGH','' from public.trips t join public.vehicles v on v.event_id=t.event_id and v.id=t.vehicle_id where t.event_id=p_event_id and not t.is_deleted and t.status<>'CANCELLED' and (select count(*) from public.trip_passengers p where p.event_id=t.event_id and p.trip_id=t.id and not p.is_deleted and p.passenger_status<>'CANCELLED')>v.capacity
 union all select 'ACCOMMODATION_OVERLAP','accommodation_assignment',a.id,coalesce(b.label,'—'),'HIGH',a.id::text||'|'||c.id::text from public.accommodation_assignments a join public.accommodation_assignments c on c.event_id=a.event_id and c.sleeping_place_id=a.sleeping_place_id and a.id<c.id join public.sleeping_places b on b.event_id=a.event_id and b.id=a.sleeping_place_id where a.event_id=p_event_id and not a.is_deleted and not c.is_deleted and a.status in ('ACTIVE','TEMPORARY') and c.status in ('ACTIVE','TEMPORARY') and a.start_date<c.end_date and c.start_date<a.end_date
 union all select 'EXPENSE_WITHOUT_RATE','payment',id,coalesce(reference,'—'),'MEDIUM','' from public.payments where event_id=p_event_id and reversed_at_utc is null and base_amount is null
 union all select 'EXPENSE_WITHOUT_RATE','expense',id,description,'MEDIUM','' from public.expenses where event_id=p_event_id and reversed_at_utc is null and base_amount is null

 union all select 'PERSON_WITHOUT_SLEEPING_PLACE','person',p.id,p.first_name||' '||p.last_name,'HIGH',e.start_date::text||'|'||e.end_date::text
 from public.people p join public.events e on e.id=p.event_id where p.event_id=p_event_id and not p.is_deleted and p.status='ACTIVE' and e.start_date<e.end_date
 and not coalesce((select range_agg(daterange(a.start_date,a.end_date,'[)')) @> daterange(e.start_date,e.end_date,'[)') from public.accommodation_assignments a where a.event_id=p_event_id and a.person_id=p.id and not a.is_deleted and a.status in ('ACTIVE','TEMPORARY')),false)
 union all select 'PERSON_WITHOUT_TRANSPORT','person',p.id,p.first_name||' '||p.last_name||' · '||d.direction,'HIGH',d.direction
 from public.people p cross join (values('INBOUND'),('OUTBOUND'))d(direction)
 where p.event_id=p_event_id and not p.is_deleted and p.status='ACTIVE' and not exists(select 1 from public.trip_passengers tp join public.trips t on t.event_id=tp.event_id and t.id=tp.trip_id where tp.event_id=p_event_id and tp.person_id=p.id and not tp.is_deleted and tp.passenger_status<>'CANCELLED' and not t.is_deleted and t.status<>'CANCELLED' and t.direction=d.direction)
 union all select 'PASSPORT_EXPIRY_RISK','person',p.id,p.first_name||' '||p.last_name,'HIGH',''
 from public.people p join people_private.person_details d on d.person_id=p.id join public.events e on e.id=p.event_id
 where p.event_id=p_event_id and not p.is_deleted and p.status='ACTIVE' and d.passport_expiration_date<e.start_date+interval '6 months'
 union all select 'TRIP_VEHICLE_UNAVAILABLE','trip',t.id,coalesce(t.origin,'—')||' → '||coalesce(t.destination,'—'),'HIGH',''
 from public.trips t join public.vehicles v on v.event_id=t.event_id and v.id=t.vehicle_id where t.event_id=p_event_id and not t.is_deleted and t.status<>'CANCELLED' and v.status in ('MAINTENANCE','UNAVAILABLE')
 union all select 'UNLINKED_FLIGHT_ARRIVAL','person',p.id,p.first_name||' '||p.last_name||' · '||coalesce(f.flight_number,'—'),'MEDIUM',f.id::text
 from public.flight_passengers fp join public.flights f on f.event_id=fp.event_id and f.id=fp.flight_id join public.people p on p.event_id=fp.event_id and p.id=fp.person_id
 where fp.event_id=p_event_id and not fp.is_deleted and fp.status<>'CANCELLED' and not f.is_deleted and f.status<>'CANCELLED' and f.direction='INBOUND' and not p.is_deleted
 and f.scheduled_arrival_utc is not null and not exists(select 1 from public.trip_passengers tp join public.trips t on t.id=tp.trip_id and t.event_id=tp.event_id where tp.event_id=p_event_id and tp.person_id=p.id and not tp.is_deleted and tp.passenger_status<>'CANCELLED' and not t.is_deleted and t.status<>'CANCELLED' and t.scheduled_departure_utc between f.scheduled_arrival_utc and f.scheduled_arrival_utc+interval '3 hours')
 union all select 'DUPLICATE_FLIGHT_ASSIGNMENT','person',p.id,p.first_name||' '||p.last_name,'HIGH',a.id::text||'|'||b.id::text
 from public.flight_passengers a join public.flight_passengers b on b.event_id=a.event_id and b.person_id=a.person_id and a.id<b.id
 join public.flights f on f.id=a.flight_id and f.event_id=a.event_id join public.flights g on g.id=b.flight_id and g.event_id=b.event_id
 join public.people p on p.id=a.person_id and p.event_id=a.event_id
 where a.event_id=p_event_id and not a.is_deleted and not b.is_deleted and a.status<>'CANCELLED' and b.status<>'CANCELLED' and not f.is_deleted and not g.is_deleted and f.status<>'CANCELLED' and g.status<>'CANCELLED' and f.direction=g.direction
 and (abs(extract(epoch from f.scheduled_departure_utc-g.scheduled_departure_utc))<=43200 or (f.scheduled_departure_utc<g.scheduled_arrival_utc and g.scheduled_departure_utc<f.scheduled_arrival_utc))
 union all select 'OVERFLOW_ROOM_CAPACITY','room',r.id,r.name_or_number,'HIGH',''
 from public.rooms r where r.event_id=p_event_id and not r.is_deleted and exists(
 select 1 from public.accommodation_assignments a join public.sleeping_places b on b.event_id=a.event_id and b.id=a.sleeping_place_id
 where a.event_id=p_event_id and b.room_id=r.id and not a.is_deleted and a.status in ('ACTIVE','TEMPORARY')
 and (select count(*) from public.accommodation_assignments x join public.sleeping_places y on y.event_id=x.event_id and y.id=x.sleeping_place_id where x.event_id=p_event_id and y.room_id=r.id and not x.is_deleted and x.status in ('ACTIVE','TEMPORARY') and x.start_date<=a.start_date and a.start_date<x.end_date) >
 (select count(*) from public.sleeping_places z where z.event_id=p_event_id and z.room_id=r.id and not z.is_deleted and z.is_active))

 ),
 schedule_rows as (
 select 'flight'::text kind,id,coalesce(flight_number,'—') label,scheduled_departure_utc at,null::date civil_date,'departure'::text milestone from public.flights where event_id=p_event_id and not is_deleted and status<>'CANCELLED'
 union all select 'trip',id,coalesce(origin,'—')||' → '||coalesce(destination,'—'),scheduled_departure_utc,null::date,'departure' from public.trips where event_id=p_event_id and not is_deleted and status<>'CANCELLED'
 union all select 'task',id,title,due_date_utc,null::date,'deadline' from public.tasks where event_id=p_event_id and not is_deleted and status not in ('COMPLETED','CANCELLED')
 union all select 'accommodation_assignment',a.id,coalesce(p.first_name,'—')||' · '||coalesce(b.label,'—'),a.start_date::timestamp at time zone 'Europe/Kyiv',a.start_date,'checkIn' from public.accommodation_assignments a left join public.people p on p.id=a.person_id and p.event_id=a.event_id left join public.sleeping_places b on b.id=a.sleeping_place_id and b.event_id=a.event_id where a.event_id=p_event_id and not a.is_deleted and a.status in ('ACTIVE','TEMPORARY')
 union all select 'accommodation_assignment',a.id,coalesce(p.first_name,'—')||' · '||coalesce(b.label,'—'),a.end_date::timestamp at time zone 'Europe/Kyiv',a.end_date,'checkOut' from public.accommodation_assignments a left join public.people p on p.id=a.person_id and p.event_id=a.event_id left join public.sleeping_places b on b.id=a.sleeping_place_id and b.event_id=a.event_id where a.event_id=p_event_id and not a.is_deleted and a.status in ('ACTIVE','TEMPORARY')
 )
 select jsonb_build_object(
 'counts',jsonb_build_object(
 'people',(select count(*) from public.people where event_id=p_event_id and not is_deleted and status='ACTIVE'),
 'tasks',(select count(*) from public.tasks where event_id=p_event_id and not is_deleted and status not in ('COMPLETED','CANCELLED')),
 'issues',(select count(*) from public.apartment_issues where event_id=p_event_id and not is_deleted and status in ('OPEN','IN_PROGRESS')),
 'assignments',(select count(*) from public.accommodation_assignments where event_id=p_event_id and not is_deleted and status in ('ACTIVE','TEMPORARY')),
 'beds',(select count(*) from public.sleeping_places where event_id=p_event_id and not is_deleted and is_active),
 'flights',(select count(*) from public.flights where event_id=p_event_id and not is_deleted),
 'trips',(select count(*) from public.trips where event_id=p_event_id and not is_deleted)
 ),
 'alerts',coalesce((select jsonb_agg(to_jsonb(x)) from (select encode(sha256(convert_to(rule||'|'||kind||'|'||entity_id::text||'|'||scope_key,'UTF8')),'hex') id,rule,kind,entity_id,label,severity from alert_rows order by case severity when 'CRITICAL' then 0 when 'HIGH' then 1 else 2 end,rule,entity_id limit 100)x),'[]'::jsonb),
 'schedule',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from schedule_rows where at>=now()-interval '1 day' order by at,id limit 100)x),'[]'::jsonb),
 'finance',jsonb_build_object(
 'payments',(select coalesce(sum(base_amount),0)::text from public.payments where event_id=p_event_id and reversed_at_utc is null),
 'expenses',(select coalesce(sum(base_amount),0)::text from public.expenses where event_id=p_event_id and reversed_at_utc is null),
 'currency',(select base_currency from public.events where id=p_event_id),
 'unconverted',(select count(*) from public.payments where event_id=p_event_id and reversed_at_utc is null and base_amount is null)+(select count(*) from public.expenses where event_id=p_event_id and reversed_at_utc is null and base_amount is null)
 )) into result;
 return result;
end; $$;
revoke all on function public.web_command_center(uuid) from public,anon;
grant execute on function public.web_command_center(uuid) to authenticated;

create function public.web_assignment_review(p_event_id uuid,p_kind text,p_id uuid,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]';item jsonb;
begin
 perform transport_private.authorize(p_event_id,false);
 if p_kind='accommodation_assignment' and p_fields->>'status' in ('ACTIVE','TEMPORARY') then
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'rule','ACCOMMODATION_OVERLAP','label',start_date::text||' – '||end_date::text)),'[]') into result
 from public.accommodation_assignments where event_id=p_event_id and id is distinct from p_id and not is_deleted and status in ('ACTIVE','TEMPORARY')
 and (sleeping_place_id=(p_fields->>'sleeping_place_id')::uuid or person_id=(p_fields->>'person_id')::uuid)
 and start_date<(p_fields->>'end_date')::date and (p_fields->>'start_date')::date<end_date;
 elsif p_kind='trip' and p_fields->>'status'<>'CANCELLED' then
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'rule','operationalWarning','label',coalesce(origin,'—')||' → '||coalesce(destination,'—'))),'[]') into result
 from public.trips where event_id=p_event_id and id is distinct from p_id and not is_deleted and status<>'CANCELLED'
 and (driver_id=(p_fields->>'driver_id')::uuid or vehicle_id=(p_fields->>'vehicle_id')::uuid)
 and scheduled_departure_utc<(p_fields->>'scheduled_arrival_utc')::timestamptz and (p_fields->>'scheduled_departure_utc')::timestamptz<scheduled_arrival_utc;
 elsif p_kind='trip_passenger' and p_fields->>'passenger_status'<>'CANCELLED' then
 select jsonb_build_object('id',t.id,'rule','VEHICLE_OVER_CAPACITY','label',v.name) into item
 from public.trips t join public.vehicles v on v.id=t.vehicle_id and v.event_id=t.event_id
 where t.event_id=p_event_id and t.id=(p_fields->>'trip_id')::uuid and
 (select count(*)+1 from public.trip_passengers where event_id=p_event_id and trip_id=t.id and id is distinct from p_id and not is_deleted and passenger_status<>'CANCELLED')>v.capacity;
 if item is not null then result:=jsonb_build_array(item);end if;
 end if;
 return result;
end; $$;
revoke all on function public.web_assignment_review(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.web_assignment_review(uuid,text,uuid,jsonb) to authenticated;
-- Read-only confirmation for an uncertain creation response. A request belongs to its creator.
create function public.web_request_status(p_event_id uuid,p_kind text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare tab text;result uuid;
begin
 perform transport_private.authorize(p_event_id,false);
 tab:=case p_kind when 'person' then 'people' when 'flight' then 'flights' when 'flight_passenger' then 'flight_passengers'
 when 'driver' then 'drivers' when 'vehicle' then 'vehicles' when 'trip' then 'trips' when 'trip_passenger' then 'trip_passengers'
 when 'apartment' then 'apartments' when 'room' then 'rooms' when 'sleeping_place' then 'sleeping_places'
 when 'accommodation_assignment' then 'accommodation_assignments' when 'task' then 'tasks' when 'apartment_issue' then 'apartment_issues'
 when 'payment' then 'payments' when 'expense' then 'expenses' end;
 if tab is null then raise exception using errcode='22023',message='Unknown kind';end if;
 execute format('select id from public.%I where event_id=$1 and creation_request_id=$2 and created_by=$3',tab) into result using p_event_id,p_request_id,auth.uid();
 return result;
end;$$;
revoke all on function public.web_request_status(uuid,text,uuid) from public,anon;
grant execute on function public.web_request_status(uuid,text,uuid) to authenticated;

create function public.web_availability(p_event_id uuid,p_start date,p_end date,p_offset integer default 0,p_available_only boolean default false)
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform transport_private.authorize(p_event_id,false);
 if p_start is null or p_end is null or p_start>=p_end then raise exception using errcode='22023',message='Invalid stay interval';end if;
 return query
 select jsonb_build_object('id',b.id,'label',b.label,'room_id',r.id,'room',r.name_or_number,'apartment_id',a.id,'apartment',a.name,
 'available',not exists(select 1 from public.accommodation_assignments x where x.event_id=p_event_id and x.sleeping_place_id=b.id and not x.is_deleted and x.status in ('ACTIVE','TEMPORARY') and x.start_date<p_end and p_start<x.end_date),
 'occupants',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',x.id,'person_id',p.id,'name',p.first_name||' '||p.last_name,'start_date',x.start_date,'end_date',x.end_date,'status',x.status) order by x.start_date,x.id)
 from public.accommodation_assignments x left join public.people p on p.id=x.person_id and p.event_id=x.event_id
 where x.event_id=p_event_id and x.sleeping_place_id=b.id and not x.is_deleted and x.status in ('ACTIVE','TEMPORARY') and x.start_date<p_end and p_start<x.end_date),'[]'::jsonb))
 from public.sleeping_places b join public.rooms r on r.id=b.room_id and r.event_id=b.event_id join public.apartments a on a.id=r.apartment_id and a.event_id=r.event_id
 where b.event_id=p_event_id and not b.is_deleted and b.is_active and not r.is_deleted and not a.is_deleted and a.status='ACTIVE'
 and (not p_available_only or not exists(select 1 from public.accommodation_assignments x where x.event_id=p_event_id and x.sleeping_place_id=b.id and not x.is_deleted and x.status in ('ACTIVE','TEMPORARY') and x.start_date<p_end and p_start<x.end_date))
 order by a.name,r.name_or_number,b.label,b.id limit 40 offset greatest(p_offset,0);
end;$$;
revoke all on function public.web_availability(uuid,date,date,integer,boolean) from public,anon;
grant execute on function public.web_availability(uuid,date,date,integer,boolean) to authenticated;

commit;


