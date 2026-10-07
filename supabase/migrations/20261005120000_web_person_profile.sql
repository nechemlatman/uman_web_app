-- Targeted Participant 360 read RPC. Returns person's relational chain in one scoped query.
begin;
create function public.web_person_profile(p_event_id uuid, p_person_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform transport_private.authorize(p_event_id, false);
 select jsonb_build_object(
  'person', (select to_jsonb(p) - 'creation_request_id' - 'creation_payload' from public.people p where p.event_id = p_event_id and p.id = p_person_id),
  'flight_passengers', coalesce((select jsonb_agg(to_jsonb(fp) - 'creation_request_id' - 'creation_payload') from public.flight_passengers fp where fp.event_id = p_event_id and fp.person_id = p_person_id and not fp.is_deleted), '[]'::jsonb),
  'flights', coalesce((select jsonb_agg(to_jsonb(f) - 'creation_request_id' - 'creation_payload') from public.flights f where f.event_id = p_event_id and f.id in (select flight_id from public.flight_passengers where event_id = p_event_id and person_id = p_person_id and not is_deleted) and not f.is_deleted), '[]'::jsonb),
  'trip_passengers', coalesce((select jsonb_agg(to_jsonb(tp) - 'creation_request_id' - 'creation_payload') from public.trip_passengers tp where tp.event_id = p_event_id and tp.person_id = p_person_id and not tp.is_deleted), '[]'::jsonb),
  'trips', coalesce((select jsonb_agg(to_jsonb(t) - 'creation_request_id' - 'creation_payload') from public.trips t where t.event_id = p_event_id and t.id in (select trip_id from public.trip_passengers where event_id = p_event_id and person_id = p_person_id and not is_deleted) and not t.is_deleted), '[]'::jsonb),
  'accommodation_assignments', coalesce((select jsonb_agg((to_jsonb(a) - 'creation_request_id' - 'creation_payload') || jsonb_build_object('agreed_price', agreed_price::text)) from public.accommodation_assignments a where a.event_id = p_event_id and a.person_id = p_person_id and not a.is_deleted), '[]'::jsonb),
  'sleeping_places', coalesce((select jsonb_agg((to_jsonb(sp) - 'creation_request_id' - 'creation_payload') || jsonb_build_object('listed_price', listed_price::text)) from public.sleeping_places sp where sp.event_id = p_event_id and sp.id in (select sleeping_place_id from public.accommodation_assignments where event_id = p_event_id and person_id = p_person_id and not is_deleted) and not sp.is_deleted), '[]'::jsonb),
  'rooms', coalesce((select jsonb_agg(to_jsonb(r) - 'creation_request_id' - 'creation_payload') from public.rooms r where r.event_id = p_event_id and r.id in (select room_id from public.sleeping_places where event_id = p_event_id and id in (select sleeping_place_id from public.accommodation_assignments where event_id = p_event_id and person_id = p_person_id and not is_deleted)) and not r.is_deleted), '[]'::jsonb),
  'apartments', coalesce((select jsonb_agg((to_jsonb(ap) - 'creation_request_id' - 'creation_payload') || jsonb_build_object('total_cost', total_cost::text)) from public.apartments ap where ap.event_id = p_event_id and ap.id in (select apartment_id from public.rooms where event_id = p_event_id and id in (select room_id from public.sleeping_places where event_id = p_event_id and id in (select sleeping_place_id from public.accommodation_assignments where event_id = p_event_id and person_id = p_person_id and not is_deleted))) and not ap.is_deleted), '[]'::jsonb),
  'payments', coalesce((select jsonb_agg((to_jsonb(p) - 'creation_request_id' - 'creation_payload') || jsonb_build_object('amount', amount::text, 'base_amount', base_amount::text, 'exchange_rate', exchange_rate::text)) from public.payments p where p.event_id = p_event_id and p.person_id = p_person_id), '[]'::jsonb),
  'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'creation_request_id' - 'creation_payload') from public.tasks t where t.event_id = p_event_id and t.assignee_id = p_person_id and not t.is_deleted), '[]'::jsonb)
 ) into result;
 return result;
end; $$;
revoke all on function public.web_person_profile(uuid,uuid) from public,anon;
grant execute on function public.web_person_profile(uuid,uuid) to authenticated;
commit;
