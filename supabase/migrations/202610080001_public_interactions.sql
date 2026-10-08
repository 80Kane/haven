-- Development/staging only until privacy, abuse, and delivery gates pass.
-- No member accounts, roles, invitations, or conversation data are created here.
begin;
create schema haven_public;
revoke all on schema haven_public from public, anon, authenticated;
grant usage on schema haven_public to service_role;

create table haven_public.hug_total (
  singleton boolean primary key default true check (singleton),
  total bigint not null default 0 check (total >= 0)
);
insert into haven_public.hug_total values (true, 0);
create table haven_public.hug_receipts (
  actor_hash text not null check (actor_hash ~ '^[a-f0-9]{64}$'),
  day date not null,
  primary key (actor_hash, day)
);
create table haven_public.rate_buckets (
  actor_hash text not null check (actor_hash ~ '^[a-f0-9]{64}$'),
  hour timestamptz not null,
  attempts integer not null check (attempts between 1 and 6),
  primary key (actor_hash, hour)
);
create table haven_public.interests (
  email text primary key check (length(email) between 3 and 254),
  confirmation_hash text not null unique check (confirmation_hash ~ '^[a-f0-9]{64}$'),
  unsubscribe_hash text not null unique check (unsubscribe_hash ~ '^[a-f0-9]{64}$'),
  consent_version text not null check (consent_version = 'interest-v1'),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  confirmed_at timestamptz
);
alter table haven_public.hug_total enable row level security;
alter table haven_public.hug_receipts enable row level security;
alter table haven_public.rate_buckets enable row level security;
alter table haven_public.interests enable row level security;
-- No client policies. All interaction is through narrowly scoped server RPCs.
revoke all on all tables in schema haven_public from public, anon, authenticated, service_role;

create function public.haven_hug_count() returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('total', total) from haven_public.hug_total where singleton $$;

create function public.haven_send_hug(p_actor_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare inserted_count integer; result_total bigint;
begin
  insert into haven_public.hug_receipts(actor_hash, day)
    values (p_actor_hash, (now() at time zone 'UTC')::date)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    update haven_public.hug_total set total = total + 1 where singleton returning total into result_total;
  else
    select total into result_total from haven_public.hug_total where singleton;
  end if;
  return jsonb_build_object('accepted', inserted_count = 1, 'total', result_total);
end $$;

create function public.haven_request_interest(
  p_actor_hash text, p_email text, p_confirmation_hash text, p_unsubscribe_hash text, p_consent_version text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare attempts_count integer; inserted_count integer;
begin
  insert into haven_public.rate_buckets(actor_hash,hour,attempts)
    values (p_actor_hash,date_trunc('hour',now()),1)
    on conflict (actor_hash,hour) do update
      set attempts = least(6,haven_public.rate_buckets.attempts + 1)
    returning attempts into attempts_count;
  if attempts_count > 5 then return jsonb_build_object('rate_limited',true); end if;
  if p_email <> lower(trim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
  -- Pending entries expire; confirmed entries require unsubscribe before re-enrollment.
  delete from haven_public.interests where email=p_email and confirmed_at is null and expires_at <= now();
  insert into haven_public.interests(email,confirmation_hash,unsubscribe_hash,consent_version)
    values (p_email,p_confirmation_hash,p_unsubscribe_hash,p_consent_version)
    on conflict(email) do nothing;
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('send_confirmation',inserted_count = 1);
end $$;

create function public.haven_confirm_interest(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare changed_count integer;
begin
  update haven_public.interests set confirmed_at=now()
    where confirmation_hash=p_token_hash and confirmed_at is null and expires_at > now();
  get diagnostics changed_count = row_count;
  return jsonb_build_object('confirmed',changed_count = 1);
end $$;

create function public.haven_unsubscribe_interest(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin
  delete from haven_public.interests where unsubscribe_hash=p_token_hash;
  -- Deliberately identical for unknown or already-used tokens.
  return jsonb_build_object('removed',true);
end $$;

create function public.haven_cancel_pending_interest(p_token_hash text) returns void
language sql security definer set search_path = ''
as $$ delete from haven_public.interests where confirmation_hash=p_token_hash and confirmed_at is null $$;

create function public.haven_cleanup_public_interactions() returns void
language plpgsql security definer set search_path = ''
as $$ begin
  delete from haven_public.hug_receipts where day < (now() at time zone 'UTC')::date;
  delete from haven_public.rate_buckets where hour < now() - interval '24 hours';
  delete from haven_public.interests where confirmed_at is null and expires_at < now() - interval '6 days';
end $$;

-- Functions have default PUBLIC execution grants: explicitly remove them.
revoke all on function public.haven_hug_count() from public, anon, authenticated;
revoke all on function public.haven_send_hug(text) from public, anon, authenticated;
revoke all on function public.haven_request_interest(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.haven_confirm_interest(text) from public, anon, authenticated;
revoke all on function public.haven_unsubscribe_interest(text) from public, anon, authenticated;
revoke all on function public.haven_cancel_pending_interest(text) from public, anon, authenticated;
revoke all on function public.haven_cleanup_public_interactions() from public, anon, authenticated;
grant execute on function public.haven_hug_count(), public.haven_send_hug(text),
  public.haven_request_interest(text,text,text,text,text), public.haven_confirm_interest(text),
  public.haven_unsubscribe_interest(text), public.haven_cancel_pending_interest(text),
  public.haven_cleanup_public_interactions() to service_role;
commit;
