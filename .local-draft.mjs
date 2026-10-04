import fs from 'node:fs';
const funcs=JSON.parse(fs.readFileSync('.local-hosted-functions.json','utf8').replace(/^\uFEFF/,''));
const get=n=>funcs.find(f=>f.name===n).definition.replaceAll('\r\n','\n');
let sql=`begin;
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
`;
let s=get('people_private.validate_fields');s=s.replace(" length(btrim(coalesce(p_fields->>'first_name',''))) not between 1 and 200 or",` not exists(select 1 from unnest(array['first_name','last_name','hebrew_first_name','hebrew_last_name','phone','whatsapp_phone','email','passport_name','notes']) identity_key where coalesce(p_fields->>identity_key,'') ~ '[^[:space:]]') or`);sql+=s+';\n';
s=get('public.save_person');s=s.replaceAll("first_name=p_fields->>'first_name'","first_name=coalesce(p_fields->>'first_name','')").replace("values(p_event_id,p_request_id,p_fields->>'first_name',","values(p_event_id,p_request_id,coalesce(p_fields->>'first_name',''),");sql+=s+';\n';
s=get('public.person_duplicates');s=s.replace("or (lower(btrim(p.first_name))", "or (coalesce(p_fields->>'first_name','') ~ '[^[:space:]]' and lower(btrim(p.first_name))");sql+=s+';\n';
s=get('public.save_driver');s=s.replace("    length(btrim(coalesce(p_fields->>'full_name', ''))) = 0 or\n",'');sql+=s+';\n';
s=get('public.save_vehicle');s=s.replace("    length(btrim(coalesce(p_fields->>'name', ''))) = 0 or\n",'').replace("coalesce((p_fields->>'capacity')::integer, 0) < 1",()=>"(p_fields->>'capacity' is not null and (p_fields->>'capacity' !~ '^[0-9]+$' or (p_fields->>'capacity')::integer < 1))");sql+=s+';\n';
// Safe operational labels contain public identity/contact only; private identity remains behind authorized RPCs.
s=get('public.read_accommodation');s=s.replace("first_name||' '||last_name", "coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),nullif(btrim(concat_ws(' ',hebrew_first_name,hebrew_last_name)),''),nullif(btrim(phone),''),nullif(btrim(whatsapp_phone),''),'')");sql+=s+';\n';
sql+=`create function public.web_list_people(p_event_id uuid,p_query text default '',p_deleted boolean default false,p_limit integer default 40,p_offset integer default 0,p_sort text default 'newest',p_id uuid default null,p_status text default null)
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
`;
fs.writeFileSync('supabase/migrations/20261004115753_draft_quick_capture.sql',sql);
