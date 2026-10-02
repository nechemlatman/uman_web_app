begin;

-- Cover attribution foreign keys without removing the event/time audit index.
create index events_created_by on public.events(created_by);
create index events_updated_by on public.events(updated_by);
create index event_members_created_by on public.event_members(created_by);
create index audit_entries_actor on public.audit_entries(actor_user_id);

-- Explicit field operation: settings, lifecycle and deletion are not generic edits.
create function public.edit_event_details(p_id uuid, p_expected_version bigint,
  p_name text, p_hebrew_name text, p_description text, p_manager_notes text,
  p_year integer, p_start_date date, p_end_date date, p_base_currency text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then
    raise exception using errcode='42501', message='Not authorized';
  end if;
  if p_expected_version is null or p_expected_version < 1 or
    p_name is null or length(btrim(p_name)) not between 1 and 200 or
    length(p_hebrew_name) > 200 or length(p_description) > 10000 or
    length(p_manager_notes) > 10000 or p_year is null or p_year not between 1900 and 2200 or
    p_start_date is null or p_end_date is null or p_end_date < p_start_date or
    p_base_currency is null or p_base_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='22023', message='Invalid Event fields';
  end if;
  update public.events set name=p_name, hebrew_name=p_hebrew_name,
    description=p_description, manager_notes=p_manager_notes, year=p_year,
    start_date=p_start_date, end_date=p_end_date, base_currency=p_base_currency,
    version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
    where id=p_id and version=p_expected_version and not is_deleted
      and lifecycle_stage <> 'ARCHIVED' returning * into result;
  if not found then raise exception using errcode='40001', message='Record changed or is read-only'; end if;
  return result;
end;
$$;

-- Only explicitly specified operational transitions. READY entry is blocked
-- until the owner defines minimum setup. Archive has its own operation.
create function public.transition_event(p_id uuid, p_expected_version bigint, p_stage text)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then raise exception using errcode='42501', message='Not authorized'; end if;
  select * into result from public.events where id=p_id for update;
  if not found or result.version is distinct from p_expected_version or result.is_deleted
    or result.lifecycle_stage='ARCHIVED' then
    raise exception using errcode='40001', message='Record changed or is read-only';
  end if;
  if p_stage is null or not (
    (result.lifecycle_stage='READY' and p_stage in ('PLANNING','TRAVEL')) or
    (result.lifecycle_stage='TRAVEL' and p_stage='IN_UMAN') or
    (result.lifecycle_stage='IN_UMAN' and p_stage='DEPARTURE') or
    (result.lifecycle_stage='DEPARTURE' and p_stage='CLOSEOUT')) then
    raise exception using errcode='22023', message='Transition unavailable';
  end if;
  update public.events set lifecycle_stage=p_stage, version=version+1,
    updated_at_utc=clock_timestamp(), updated_by=actor where id=p_id returning * into result;
  return result;
end;
$$;

create function public.archive_event(p_id uuid, p_expected_version bigint)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then raise exception using errcode='42501', message='Not authorized'; end if;
  update public.events set lifecycle_stage='ARCHIVED', version=version+1,
    updated_at_utc=clock_timestamp(), updated_by=actor
    where id=p_id and version=p_expected_version and not is_deleted
      and lifecycle_stage <> 'ARCHIVED' returning * into result;
  if not found then raise exception using errcode='40001', message='Record changed or is read-only'; end if;
  return result;
end;
$$;

create function public.soft_delete_event(p_id uuid, p_expected_version bigint)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then raise exception using errcode='42501', message='Not authorized'; end if;
  update public.events set is_deleted=true, deleted_at_utc=clock_timestamp(),
    version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
    where id=p_id and version=p_expected_version and not is_deleted
      and lifecycle_stage <> 'ARCHIVED' returning * into result;
  if not found then raise exception using errcode='40001', message='Record changed or is read-only'; end if;
  return result;
end;
$$;

create function public.restore_event(p_id uuid, p_expected_version bigint)
returns public.events language plpgsql security definer set search_path = '' as $$
declare result public.events; actor uuid := auth.uid();
begin
  perform 1 from public.event_members where event_id=p_id and user_id=actor
    and role='administrator' for share;
  if actor is null or not found then raise exception using errcode='42501', message='Not authorized'; end if;
  update public.events set is_deleted=false, deleted_at_utc=null,
    version=version+1, updated_at_utc=clock_timestamp(), updated_by=actor
    where id=p_id and version=p_expected_version and is_deleted returning * into result;
  if not found then raise exception using errcode='40001', message='Record changed or is not deleted'; end if;
  return result;
end;
$$;

revoke all on function public.edit_event_details(uuid,bigint,text,text,text,text,integer,date,date,text) from public,anon;
revoke all on function public.transition_event(uuid,bigint,text) from public,anon;
revoke all on function public.archive_event(uuid,bigint) from public,anon;
revoke all on function public.soft_delete_event(uuid,bigint) from public,anon;
revoke all on function public.restore_event(uuid,bigint) from public,anon;
grant execute on function public.edit_event_details(uuid,bigint,text,text,text,text,integer,date,date,text) to authenticated;
grant execute on function public.transition_event(uuid,bigint,text) to authenticated;
grant execute on function public.archive_event(uuid,bigint) to authenticated;
grant execute on function public.soft_delete_event(uuid,bigint) to authenticated;
grant execute on function public.restore_event(uuid,bigint) to authenticated;
commit;
