-- Private reporting foundation; independently disabled until operator review.
begin;
alter table haven_members.configuration add column reporting_enabled boolean not null default false;
create table haven_members.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  submission_key uuid not null,
  circle_slug text check(circle_slug in ('recovery-healing','choices-change','mental-wellness','veterans-connection','family-relationships','reentry-new-beginnings','purpose-personal-growth')),
  category text not null check(category in ('safety','privacy','harassment','other')),
  details text not null check(char_length(details) between 10 and 1000),
  status text not null default 'open' check(status in ('open','in_review','closed')),
  resolution text check(resolution in ('review_complete','duplicate','outside_scope')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(reporter_id,submission_key),
  check((status='closed' and resolution is not null and closed_at is not null)
    or (status<>'closed' and resolution is null and closed_at is null))
);
create index reports_reporter_created on haven_members.reports(reporter_id,created_at);
create index reports_queue on haven_members.reports(status,created_at,id);
create table haven_members.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references haven_members.reports(id),
  actor_id uuid references auth.users(id) on delete set null,
  from_status text check(from_status in ('open','in_review','closed')),
  to_status text not null check(to_status in ('open','in_review','closed')),
  resolution text check(resolution in ('review_complete','duplicate','outside_scope')),
  created_at timestamptz not null default now()
);
create index report_events_report_created on haven_members.report_events(report_id,created_at,id);
alter table haven_members.reports enable row level security;
alter table haven_members.report_events enable row level security;
revoke all on haven_members.reports,haven_members.report_events from public,anon,authenticated,service_role;
revoke all on sequence haven_members.report_events_id_seq from public,anon,authenticated,service_role;
-- No direct table access. Public wrappers are invokers; privileged functions
-- remain in the private schema and independently authorize every request.
create function haven_members.require_reporting_member() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=haven_members.require_active_profile_member();
begin
 if not exists(select 1 from haven_members.configuration where singleton and reporting_enabled) then
   raise insufficient_privilege using message='Access denied';
 end if;
 return actor;
end $$;
create function haven_members.submit_report(p_submission_key uuid,p_circle_slug text,p_category text,p_details text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; item haven_members.reports%rowtype;
begin
 perform pg_advisory_xact_lock(72134681);
 actor:=haven_members.require_reporting_member();
 if p_submission_key is null or p_category is null or p_category not in ('safety','privacy','harassment','other')
   or p_details is null or char_length(btrim(p_details)) not between 10 and 1000
   or p_details ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F\200B-\200F\202A-\202E\2060-\206F]'
   or (p_circle_slug is not null and p_circle_slug not in ('recovery-healing','choices-change','mental-wellness','veterans-connection','family-relationships','reentry-new-beginnings','purpose-personal-growth')) then
   raise invalid_parameter_value using message='Invalid request';
 end if;
 select * into item from haven_members.reports where reporter_id=actor and submission_key=p_submission_key;
 if found then
   if item.circle_slug is distinct from p_circle_slug or item.category<>p_category or item.details<>btrim(p_details) then
     raise invalid_parameter_value using message='Invalid request';
   end if;
   return jsonb_build_object('id',item.id,'status',item.status);
 end if;
 if (select count(*) from haven_members.reports where reporter_id=actor and created_at>now()-interval '24 hours')>=5 then
   raise sqlstate 'P0003' using message='Report limit reached';
 end if;
 insert into haven_members.reports(reporter_id,submission_key,circle_slug,category,details)
   values(actor,p_submission_key,p_circle_slug,p_category,btrim(p_details)) returning * into item;
 insert into haven_members.report_events(report_id,actor_id,to_status) values(item.id,actor,'open');
 return jsonb_build_object('id',item.id,'status',item.status);
end $$;
create function haven_members.my_reports() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=haven_members.require_reporting_member(); items jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'circle',circle_slug,'status',status,
   'resolution',resolution,'createdAt',created_at) order by created_at desc,id desc),'[]'::jsonb)
 into items from (select * from haven_members.reports where reporter_id=actor order by created_at desc,id desc limit 10) r;
 return jsonb_build_object('memberId',actor,'reports',items);
end $$;
create function haven_members.report_queue() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=haven_members.require_admin(); items jsonb;
begin
 perform haven_members.require_reporting_member();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'circle',circle_slug,'status',status,
   'resolution',resolution,'createdAt',created_at) order by created_at,id),'[]'::jsonb)
 into items from (select * from haven_members.reports where status<>'closed' order by created_at,id limit 25) r;
 return jsonb_build_object('reports',items);
end $$;
create function haven_members.report_detail(p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=haven_members.require_admin(); item haven_members.reports%rowtype; events jsonb;
begin
 perform haven_members.require_reporting_member();
 select * into item from haven_members.reports where id=p_report_id;
 if not found then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('from',from_status,'to',to_status,'resolution',resolution,'createdAt',created_at)
   order by created_at,id),'[]'::jsonb) into events from haven_members.report_events where report_id=item.id;
 return jsonb_build_object('id',item.id,'category',item.category,'circle',item.circle_slug,'status',item.status,
   'resolution',item.resolution,'createdAt',item.created_at,'details',item.details,'version',item.version,'events',events);
end $$;
create function haven_members.review_report(p_report_id uuid,p_version integer,p_status text,p_resolution text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; item haven_members.reports%rowtype;
begin
 perform pg_advisory_xact_lock(72134681);
 actor:=haven_members.require_admin();
 perform haven_members.require_reporting_member();
 select * into item from haven_members.reports where id=p_report_id for update;
 if not found then raise insufficient_privilege using message='Access denied'; end if;
 if p_version is null or p_version<>item.version then raise sqlstate 'P0002' using message='Refresh required'; end if;
 if p_status is null or not ((item.status='open' and p_status='in_review') or (item.status='in_review' and p_status='closed'))
   or (p_status='closed' and (p_resolution is null or p_resolution not in ('review_complete','duplicate','outside_scope')))
   or (p_status<>'closed' and p_resolution is not null) then raise invalid_parameter_value using message='Invalid request'; end if;
 update haven_members.reports set status=p_status,resolution=p_resolution,version=version+1,updated_at=now(),
   closed_at=case when p_status='closed' then now() else null end where id=item.id;
 insert into haven_members.report_events(report_id,actor_id,from_status,to_status,resolution)
   values(item.id,actor,item.status,p_status,p_resolution);
 return jsonb_build_object('updated',true);
end $$;
create function public.haven_submit_report(p_submission_key uuid,p_circle_slug text,p_category text,p_details text) returns jsonb
language sql security invoker set search_path='' as $$ select haven_members.submit_report(p_submission_key,p_circle_slug,p_category,p_details) $$;
create function public.haven_my_reports() returns jsonb language sql security invoker set search_path='' as $$ select haven_members.my_reports() $$;
create function public.haven_report_queue() returns jsonb language sql security invoker set search_path='' as $$ select haven_members.report_queue() $$;
create function public.haven_report_detail(p_report_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select haven_members.report_detail(p_report_id) $$;
create function public.haven_review_report(p_report_id uuid,p_version integer,p_status text,p_resolution text) returns jsonb
language sql security invoker set search_path='' as $$ select haven_members.review_report(p_report_id,p_version,p_status,p_resolution) $$;
revoke all on function haven_members.require_reporting_member(),haven_members.submit_report(uuid,text,text,text),haven_members.my_reports(),
 haven_members.report_queue(),haven_members.report_detail(uuid),haven_members.review_report(uuid,integer,text,text),
 public.haven_submit_report(uuid,text,text,text),public.haven_my_reports(),public.haven_report_queue(),public.haven_report_detail(uuid),
 public.haven_review_report(uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function haven_members.submit_report(uuid,text,text,text),haven_members.my_reports(),haven_members.report_queue(),
 haven_members.report_detail(uuid),haven_members.review_report(uuid,integer,text,text),public.haven_submit_report(uuid,text,text,text),
 public.haven_my_reports(),public.haven_report_queue(),public.haven_report_detail(uuid),public.haven_review_report(uuid,integer,text,text) to authenticated;
commit;
