begin;
-- Preserve both published signatures; remove PostgreSQL default PUBLIC execute.
do $$
declare fn regprocedure;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('read_flight','list_flights','save_flight',
 'set_flight_deleted','list_flight_passengers','save_flight_passenger','set_flight_passenger_deleted')
 loop
  execute format('revoke all on function %s from public, anon, authenticated',fn);
  execute format('grant execute on function %s to authenticated',fn);
 end loop;
end; $$;
revoke all on function flights_private.authorize(uuid,boolean) from public,anon,authenticated;
revoke all on function flights_private.validate_fields(jsonb) from public,anon,authenticated;
commit;
