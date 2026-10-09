-- Additive invitation foundation. Review/apply only in isolated development.
-- Auth account provisioning and email delivery are separate operations.
begin;
create schema haven_members;
revoke all on schema haven_members from public, anon, authenticated, service_role;
grant usage on schema haven_members to authenticated;

create table haven_members.configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into haven_members.configuration values(true,false);

create table haven_members.members (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  status text not null default 'active' check (status in ('active','suspended','removed')),
  consent_version text not null check (consent_version = 'member-v1'),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table haven_members.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  intended_email text not null check (length(intended_email) between 3 and 254 and intended_email = lower(btrim(intended_email))),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  check (expires_at > created_at and expires_at <= created_at + interval '7 days'),
  check (consumed_at is null or revoked_at is null)
);
create index invitations_issuer_created on haven_members.invitations(invited_by,created_at);
create table haven_members.redemption_attempts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  hour timestamptz not null,
  attempts integer not null check(attempts between 1 and 21),
  primary key(actor_id,hour)
);
create table haven_members.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references haven_members.invitations(id) on delete set null,
  action text not null check (action in ('invite_issued','invite_revoked','invite_redeemed','status_changed','role_changed','admin_bootstrapped')),
  old_value text,
  new_value text,
  check (old_value is null or old_value in ('member','moderator','admin','active','suspended','removed')),
  check (new_value is null or new_value in ('member','moderator','admin','active','suspended','removed')),
  created_at timestamptz not null default now()
);
alter table haven_members.members enable row level security;
alter table haven_members.invitations enable row level security;
alter table haven_members.audit_events enable row level security;
alter table haven_members.configuration enable row level security;
alter table haven_members.redemption_attempts enable row level security;
revoke all on all tables in schema haven_members from public,anon,authenticated,service_role;
revoke all on all sequences in schema haven_members from public,anon,authenticated,service_role;
grant select on haven_members.members to authenticated;
create policy own_active_member on haven_members.members for select to authenticated
  using (id = (select auth.uid()) and status = 'active');
-- No client table writes or audit/invitation enumeration. All RPCs use caller JWT.

create function haven_members.require_verified_user() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists(select 1 from haven_members.configuration where singleton and enabled)
    or actor is null or not exists (
    select 1 from auth.users where id=actor and email_confirmed_at is not null
      and email is not null and is_anonymous is not true
      and (banned_until is null or banned_until <= now())
  ) then raise insufficient_privilege using message='Access denied'; end if;
  return actor;
end $$;

create function haven_members.require_admin() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := haven_members.require_verified_user();
begin
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' or not exists (
    select 1 from haven_members.members where id=actor and role='admin' and status='active'
  ) then raise insufficient_privilege using message='Access denied'; end if;
  return actor;
end $$;
revoke all on function haven_members.require_verified_user(),haven_members.require_admin() from public,anon,authenticated,service_role;

create function public.haven_member_self() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := haven_members.require_verified_user(); result jsonb;
begin
  select jsonb_build_object('id',id,'role',role,'status',status,'consentVersion',consent_version)
    into result from haven_members.members where id=actor and status='active';
  if result is null then raise insufficient_privilege using message='Access denied'; end if;
  return result;
end $$;

create function public.haven_issue_member_invitation(p_email text,p_token_hash text,p_expires_hours integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; invite_id uuid; email text := lower(btrim(p_email)); expiry timestamptz;
begin
  -- Serializes staff changes with redemption; permissions are checked after lock.
  perform pg_advisory_xact_lock(72134681);
  actor := haven_members.require_admin();
  if email is null or length(email) not between 3 and 254 or email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_hours is null or p_expires_hours not between 1 and 168 then
    raise invalid_parameter_value using message='Invalid request';
  end if;
  if (select count(*) from haven_members.invitations where invited_by=actor and created_at > now()-interval '1 hour') >= 10 then
    raise sqlstate 'P0001' using message='Invitation limit reached';
  end if;
  expiry := now()+make_interval(hours=>p_expires_hours);
  insert into haven_members.invitations(intended_email,token_hash,invited_by,expires_at)
    values(email,p_token_hash,actor,expiry) returning id into invite_id;
  insert into haven_members.audit_events(actor_id,invitation_id,action) values(actor,invite_id,'invite_issued');
  return jsonb_build_object('id',invite_id,'expiresAt',expiry);
end $$;

create function public.haven_revoke_member_invitation(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; changed uuid;
begin
  perform pg_advisory_xact_lock(72134681);
  actor := haven_members.require_admin();
  update haven_members.invitations set revoked_at=now()
    where id=p_invitation_id and consumed_at is null and revoked_at is null returning id into changed;
  if changed is not null then
    insert into haven_members.audit_events(actor_id,invitation_id,action) values(actor,changed,'invite_revoked');
  end if;
  return jsonb_build_object('revoked',true);
end $$;

create function public.haven_redeem_member_invitation(p_token_hash text,p_consent_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; email text; invite_id uuid; attempt_count integer;
begin
  perform pg_advisory_xact_lock(72134681);
  actor := haven_members.require_verified_user();
  insert into haven_members.redemption_attempts(actor_id,hour,attempts)
    values(actor,date_trunc('hour',now()),1)
    on conflict(actor_id,hour) do update set attempts=least(haven_members.redemption_attempts.attempts+1,21)
    returning attempts into attempt_count;
  if attempt_count > 20 then return jsonb_build_object('accepted',false); end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_consent_version is distinct from 'member-v1' then
    return jsonb_build_object('accepted',false);
  end if;
  select lower(btrim(u.email)) into email from auth.users u where u.id=actor;
  select i.id into invite_id from haven_members.invitations i
    join haven_members.members issuer on issuer.id=i.invited_by and issuer.role='admin' and issuer.status='active'
    where i.token_hash=p_token_hash and i.intended_email=email
      and i.expires_at > now() and i.revoked_at is null and i.consumed_at is null for update of i;
  -- Existing/suspended/removed records cannot be reactivated via a new invite.
  if invite_id is null or exists(select 1 from haven_members.members where id=actor) then
    return jsonb_build_object('accepted',false);
  end if;
  insert into haven_members.members(id,consent_version) values(actor,p_consent_version);
  update haven_members.invitations set consumed_at=now(),consumed_by=actor where id=invite_id;
  insert into haven_members.audit_events(actor_id,subject_id,invitation_id,action) values(actor,actor,invite_id,'invite_redeemed');
  return jsonb_build_object('accepted',true);
end $$;

create function public.haven_set_member_access(p_member_id uuid,p_status text,p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; old_status text; old_role text; invite_id uuid;
begin
  perform pg_advisory_xact_lock(72134681);
  actor := haven_members.require_admin();
  if p_member_id is null or p_member_id=actor or p_status is null or p_status not in ('active','suspended','removed')
    or p_role is null or p_role not in ('member','moderator','admin') then
    raise invalid_parameter_value using message='Invalid request';
  end if;
  select status,role into old_status,old_role from haven_members.members where id=p_member_id for update;
  if old_status is null then raise invalid_parameter_value using message='Invalid request'; end if;
  -- Removal is terminal; deletion/export belongs to the account-lifecycle work.
  if old_status='removed' and p_status <> 'removed' then
    raise invalid_parameter_value using message='Invalid request';
  end if;
  update haven_members.members set status=p_status,role=p_role,updated_at=now() where id=p_member_id;
  if old_status <> p_status then
    insert into haven_members.audit_events(actor_id,subject_id,action,old_value,new_value) values(actor,p_member_id,'status_changed',old_status,p_status);
  end if;
  if old_role <> p_role then
    insert into haven_members.audit_events(actor_id,subject_id,action,old_value,new_value) values(actor,p_member_id,'role_changed',old_role,p_role);
  end if;
  if p_status <> 'active' or p_role <> 'admin' then
    for invite_id in update haven_members.invitations set revoked_at=now()
      where invited_by=p_member_id and revoked_at is null and consumed_at is null returning id loop
      insert into haven_members.audit_events(actor_id,subject_id,invitation_id,action)
        values(actor,p_member_id,invite_id,'invite_revoked');
    end loop;
  end if;
  return jsonb_build_object('updated',true);
end $$;

revoke all on function public.haven_member_self(),
  public.haven_issue_member_invitation(text,text,integer),public.haven_revoke_member_invitation(uuid),
  public.haven_redeem_member_invitation(text,text),public.haven_set_member_access(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.haven_member_self(),
  public.haven_issue_member_invitation(text,text,integer),public.haven_revoke_member_invitation(uuid),
  public.haven_redeem_member_invitation(text,text),public.haven_set_member_access(uuid,text,text)
  to authenticated;
-- Do not expose haven_members through Data API settings. No Auth settings changed.
commit;
