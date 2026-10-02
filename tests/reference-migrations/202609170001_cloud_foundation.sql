begin;
create table public.events (
  id uuid primary key default gen_random_uuid(),
  creation_request_id uuid not null unique,
  name text not null check (length(btrim(name)) between 1 and 200),
  hebrew_name text, description text, manager_notes text,
  year integer not null check (year between 1900 and 2200),
  start_date date not null, end_date date not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  lifecycle_stage text not null default 'PLANNING' check (lifecycle_stage in
    ('PLANNING','READY','TRAVEL','IN_UMAN','DEPARTURE','CLOSEOUT','ARCHIVED')),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  is_deleted boolean not null default false, deleted_at_utc timestamptz,
  created_at_utc timestamptz not null default now(),
  updated_at_utc timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version bigint not null default 1 check (version > 0),
  check (end_date >= start_date),
  check (is_deleted = (deleted_at_utc is not null))
);
create table public.event_members (
  event_id uuid not null references public.events(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'administrator' check (role = 'administrator'),
  created_at_utc timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  primary key (event_id, user_id)
);
create index event_members_user on public.event_members(user_id, event_id);
create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  actor_user_id uuid not null references auth.users(id),
  timestamp_utc timestamptz not null default now(),
  entity_type text not null, entity_id text not null,
  operation text not null,
  old_value jsonb, new_value jsonb
);
create index audit_event_time on public.audit_entries(event_id, timestamp_utc desc);

create function public.is_event_admin(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.event_members
    where event_id = p_event_id and user_id = (select auth.uid()) and role = 'administrator');
$$;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.audit_entries enable row level security;
create policy events_read on public.events for select to authenticated
  using (public.is_event_admin(id));
create policy members_read on public.event_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy audit_read on public.audit_entries for select to authenticated
  using (public.is_event_admin(event_id));

create function public.audit_material_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid; old_doc jsonb; new_doc jsonb; scope uuid; entity text; op text;
begin
  old_doc := case when TG_OP <> 'INSERT' then to_jsonb(old) end;
  new_doc := case when TG_OP <> 'DELETE' then to_jsonb(new) end;
  actor := auth.uid();
  if actor is null then raise exception using errcode='42501', message='Authenticated audit actor required'; end if;
  if TG_TABLE_NAME = 'events' then
    scope := coalesce(new.id, old.id); entity := scope::text;
  else
    scope := coalesce(new.event_id, old.event_id);
    entity := coalesce(new.user_id, old.user_id)::text;
  end if;
  op := case when TG_OP = 'INSERT' then 'CREATE' when TG_OP = 'DELETE' then 'DELETE'
    when old_doc->>'is_deleted' = 'false' and new_doc->>'is_deleted' = 'true' then 'DELETE'
    when old_doc->>'is_deleted' = 'true' and new_doc->>'is_deleted' = 'false' then 'RESTORE'
    when old_doc->>'lifecycle_stage' <> 'ARCHIVED' and new_doc->>'lifecycle_stage' = 'ARCHIVED' then 'ARCHIVE'
    else 'UPDATE' end;
  insert into public.audit_entries(event_id,actor_user_id,entity_type,entity_id,operation,old_value,new_value)
    values(scope,actor,TG_TABLE_NAME,entity,op,old_doc,new_doc);
  return coalesce(new,old);
end;
$$;
create trigger audit_event after insert or update on public.events
  for each row execute function public.audit_material_change();
create trigger audit_member after insert or update or delete on public.event_members
  for each row execute function public.audit_material_change();

-- Only an approved existing event administrator can create another event.
-- Initial provisioning is an operator migration/script, never a public signup.
create function public.create_event(p_request_id uuid, p_name text, p_year integer,
  p_start_date date, p_end_date date, p_base_currency text) returns public.events
language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where user_id = actor order by event_id limit 1 for share;
  if actor is null or not found then
    raise exception using errcode='42501', message='Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into result from public.events where creation_request_id = p_request_id;
  if found then
    if result.created_by <> actor or not public.is_event_admin(result.id) then
      raise exception using errcode='42501', message='Not authorized';
    end if;
    if (result.name,result.year,result.start_date,result.end_date,result.base_currency)
      is distinct from (p_name,p_year,p_start_date,p_end_date,p_base_currency) then
      raise exception using errcode='40001', message='Creation already committed; reload existing event';
    end if;
    return result;
  end if;
  insert into public.events(creation_request_id,name,year,start_date,end_date,base_currency,created_by,updated_by)
    values(p_request_id,p_name,p_year,p_start_date,p_end_date,p_base_currency,actor,actor) returning * into result;
  insert into public.event_members(event_id,user_id,created_by) values(result.id,actor,actor);
  return result;
end;
$$;
create function public.update_event(p_id uuid, p_expected_version bigint, p_name text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events;
begin
  -- Lock membership to serialize revocation with mutation authorization.
  perform 1 from public.event_members where event_id=p_id and user_id=auth.uid() for share;
  if not found then raise exception using errcode='42501', message='Not authorized'; end if;
  update public.events set name=p_name, version=version+1,
    updated_at_utc=clock_timestamp(), updated_by=auth.uid()
    where id=p_id and version=p_expected_version and not is_deleted and lifecycle_stage <> 'ARCHIVED'
    returning * into result;
  if not found then raise exception using errcode='40001', message='Record changed or is read-only'; end if;
  return result;
end;
$$;
revoke all on public.events, public.event_members, public.audit_entries from anon, authenticated;
grant select on public.events, public.event_members, public.audit_entries to authenticated;
revoke all on function public.is_event_admin(uuid) from public, anon;
revoke all on function public.audit_material_change() from public, anon, authenticated;
revoke all on function public.create_event(uuid,text,integer,date,date,text) from public, anon;
revoke all on function public.update_event(uuid,bigint,text) from public, anon;
grant execute on function public.is_event_admin(uuid) to authenticated;
grant execute on function public.create_event(uuid,text,integer,date,date,text) to authenticated;
grant execute on function public.update_event(uuid,bigint,text) to authenticated;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.event_members;
commit;
