-- Private, caller-owned profile settings for the isolated member pilot.
begin;
create table haven_members.profiles (
  member_id uuid primary key references haven_members.members(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z][a-z0-9_]{2,23}$'),
  display_name text not null check (char_length(display_name) between 2 and 40),
  directory_listed boolean not null default false,
  hug_notifications boolean not null default false,
  name_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table haven_members.profile_events (
  id bigint generated always as identity primary key,
  member_id uuid not null references haven_members.members(id) on delete cascade,
  action text not null check(action in ('profile_created','name_changed','preferences_changed')),
  created_at timestamptz not null default now()
);
create index profile_events_member_created on haven_members.profile_events(member_id,created_at);
alter table haven_members.profiles enable row level security;
alter table haven_members.profile_events enable row level security;
revoke all on haven_members.profiles,haven_members.profile_events from public,anon,authenticated,service_role;
revoke all on sequence haven_members.profile_events_id_seq from public,anon,authenticated,service_role;
-- Intentionally no table policies/grants: only the caller-owned RPCs below
-- reach these unexposed tables. No directory enumeration endpoint is added.

create function haven_members.require_active_profile_member() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := haven_members.require_verified_user();
begin
  if not exists(select 1 from haven_members.members where id=actor and status='active') then
    raise insufficient_privilege using message='Access denied';
  end if;
  return actor;
end $$;

create function haven_members.profile_self() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := haven_members.require_active_profile_member(); result jsonb;
begin
  select jsonb_build_object('handle',handle,'displayName',display_name,
    'directoryListed',directory_listed,'hugNotifications',hug_notifications,
    'renameAvailableAt',name_changed_at+interval '7 days')
    into result from haven_members.profiles where member_id=actor;
  return jsonb_build_object('memberId',actor,'profile',result);
end $$;

create function haven_members.save_profile(p_handle text,p_display_name text,p_directory_listed boolean,p_hug_notifications boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; existing haven_members.profiles%rowtype; change_name boolean; change_preferences boolean;
begin
  -- Same lock as role/status changes: authorize after serializing the write.
  perform pg_advisory_xact_lock(72134681);
  actor := haven_members.require_active_profile_member();
  if p_handle is null or p_handle !~ '^[a-z][a-z0-9_]{2,23}$'
    or p_handle ~ '^(admin|administrator|moderator|staff|havenforward|support)(_|$)'
    or p_display_name is null or char_length(p_display_name) not between 2 and 40
    or p_display_name <> btrim(p_display_name)
    or p_display_name ~ '[[:cntrl:]]'
    or p_display_name ~ U&'[\200B-\200F\202A-\202E\2060-\206F]'
    or p_display_name ~* '\m(admin|administrator|moderator|staff|havenforward)\M'
    or p_directory_listed is null or p_hug_notifications is null then
      raise invalid_parameter_value using message='Invalid request';
  end if;
  select * into existing from haven_members.profiles where member_id=actor for update;
  if existing.member_id is not null and existing.handle <> p_handle then
    raise invalid_parameter_value using message='Invalid request';
  end if;
  change_name := existing.member_id is not null and existing.display_name <> p_display_name;
  change_preferences := existing.member_id is not null and
    (existing.directory_listed <> p_directory_listed or existing.hug_notifications <> p_hug_notifications);
  if existing.member_id is not null and not change_name and not change_preferences then
    return haven_members.profile_self();
  end if;
  if change_name and existing.name_changed_at > now()-interval '7 days' then
    raise sqlstate 'P0002' using message='Name change unavailable';
  end if;
  -- Withdrawal of either privacy preference is always allowed, even at the
  -- update limit; the limit prevents repeated profile edits growing audit data.
  if (select count(*) from haven_members.profile_events where member_id=actor and created_at>now()-interval '1 hour')>=30
    and not (existing.member_id is not null and not change_name
      and (not p_directory_listed or existing.directory_listed)
      and (not p_hug_notifications or existing.hug_notifications)) then
    raise sqlstate 'P0003' using message='Update limit reached';
  end if;
  if existing.member_id is null then
    insert into haven_members.profiles(member_id,handle,display_name,directory_listed,hug_notifications)
      values(actor,p_handle,p_display_name,p_directory_listed,p_hug_notifications);
    insert into haven_members.profile_events(member_id,action) values(actor,'profile_created');
  else
    update haven_members.profiles set display_name=p_display_name,
      directory_listed=p_directory_listed,hug_notifications=p_hug_notifications,
      name_changed_at=case when change_name then now() else name_changed_at end,updated_at=now()
      where member_id=actor;
    if change_name then
      insert into haven_members.profile_events(member_id,action) values(actor,'name_changed');
    end if;
    if change_preferences then
      insert into haven_members.profile_events(member_id,action) values(actor,'preferences_changed');
    end if;
  end if;
  return haven_members.profile_self();
end $$;

-- Public wrappers run as the caller. The privileged work is confined to the
-- private schema, with explicit execute grants and a current-identity check.
create function public.haven_profile_self() returns jsonb
language sql security invoker set search_path = '' as $$ select haven_members.profile_self() $$;
create function public.haven_save_profile(p_handle text,p_display_name text,p_directory_listed boolean,p_hug_notifications boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select haven_members.save_profile(p_handle,p_display_name,p_directory_listed,p_hug_notifications)
$$;
revoke all on function haven_members.require_active_profile_member(),haven_members.profile_self(),
  haven_members.save_profile(text,text,boolean,boolean),public.haven_profile_self(),
  public.haven_save_profile(text,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function haven_members.profile_self(),haven_members.save_profile(text,text,boolean,boolean),
  public.haven_profile_self(),public.haven_save_profile(text,text,boolean,boolean) to authenticated;
commit;
