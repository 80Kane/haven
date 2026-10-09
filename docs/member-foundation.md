# Invitation and member authorization foundation

This is the first implementation under issues [#2](https://github.com/80Kane/haven/issues/2)
and [#3](https://github.com/80Kane/haven/issues/3). It builds on the proposed
[architecture](https://github.com/80Kane/haven/blob/development/docs/adr/0001-invitation-only-pilot.md)
and the [staging record](staging-verification-2026-10-09.md).

## Delivered boundary

The migration introduces private invitation records, minimal membership status
and roles, bounded issuance/redemption attempts, and an append-only audit boundary
for ordinary application callers. Tokens have 256 bits of random entropy and
only SHA-256 hashes are stored. Invitations last 1-168 hours, work once, bind to
the current verified Auth email, and always create the ordinary member role.
Email normalization only trims whitespace and lowercases; it does not remove
plus tags or dots. Redemption records explicit member-v1 consent separately from
email-interest consent. An email-interest signup cannot enroll a member.

Five framework-neutral JSON routes have a Cloudflare staging adapter. They
validate current identities through Supabase Auth's user endpoint and call RPCs
with the caller's bearer token and publishable key. They never use the service
secret. SQL independently uses auth.uid(), current Auth email/verification, current
membership and signed-token MFA assurance. Role information in user metadata is
not trusted. Every staff write requires an active admin and aal2; moderators
cannot issue invitations or grant roles. Client table writes, invitation/audit
reads and anonymous/service-role RPC execution are denied. Active users can read
only their own minimal membership row via RLS if schema access is available.
The private schema must remain outside the exposed Data API schemas.

Staff access changes immediately block member RPCs and own-row reads for
suspended/removed users. Removing membership is terminal in this API; it is not
physical deletion of the Auth account or a completed privacy deletion request.
Demoting/suspending an issuer revokes their unused invitations. Staff cannot edit
their own access. A shared database transaction lock serializes invitation and
staff mutations so concurrent redemption or mutual admin suspension cannot bypass
fresh permission checks. Rate limits are ten issued invitations per admin per
rolling hour and twenty redemption attempts per verified account per clock hour.
Global serialization is deliberately simple for a small pilot; load testing and
scaling are future work.

## Runtime and defaults

This PR preserves the existing static public site and does not create a Next.js
application or reinterpret the proposed ADR as approved. The database/RPC contract
can support the separate Next.js member app described by that ADR. The existing
Cloudflare adapter is only for isolated foundation testing; it allows the exact
stable feature preview origin, not production or other branch previews.

Both switches default to disabled: MEMBER_FOUNDATION_ENABLED at the host and
haven_members.configuration.enabled in SQL. SQL checks its switch on every RPC,
including direct caller RPCs that bypass the Cloudflare adapter. Public email/Hug
flags are independent. No runtime changes become enabled just by applying the
migration or merging this PR.

## Endpoint contract

All requests require a Supabase Auth Authorization: Bearer access token. POSTs
also require the exact MEMBER_APP_ORIGIN header and application/json. No cookies,
CORS permission, URL-token parameters or browser-storage session handling are
introduced. GETs cannot issue, revoke, redeem or change access. Responses are
no-store/no-referrer. Never copy real tokens into chat, GitHub, analytics or logs.

| Route                          | Method and body                                     | Authorization/result                                                       |
| ------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| /api/member/self               | GET                                                 | Active verified member; minimal own identity/role/consent                  |
| /api/member/invitations        | POST: email, expiresHours                           | Active admin with MFA; returns invitation ID, expiry and raw token once    |
| /api/member/invitations/revoke | POST: invitationId                                  | Active admin with MFA; neutral idempotent revocation                       |
| /api/member/invitations/redeem | POST: token, consent=true, consentVersion=member-v1 | Intended verified Auth identity; single-use atomic membership insertion    |
| /api/member/access             | POST: memberId, status, role                        | Active admin with MFA; another member only; records old/new status or role |

The invitation token is returned only to an authorized issuing admin. There is
no automated email transport or invite URL in this milestone. The eventual staff
UI must display it only as part of a reviewed delivery flow, then discard it.
Unknown, expired, revoked, used and mismatched-recipient tokens receive the same
redemption error. Invalid identities and permissions never reach active access.
Provider errors produce fixed diagnostic codes without response bodies, tokens,
email addresses or exception text.

## Development setup after migration review

Do not apply this migration to production or rerun it over an existing schema.
It is additive and transactional; migration history must record it once.

1. Confirm isolated development Supabase project, Auth signup disabled, email
   confirmation enabled, anonymous signup disabled, and exact future callback
   allowlist. Disable/restrict alternative identity providers so they cannot
   create accounts outside the approved provisioning flow. These settings are
   not inspected or changed by this PR.
2. Review/apply supabase/migrations/202610090002_member_foundation.sql through
   the development SQL Editor. It does not modify the public interaction schema,
   Auth tables/settings, create Auth accounts or send emails. Leave its DB switch
   false initially. Do not expose haven_members in Data API settings.
3. Provision only synthetic test Auth users through the trusted administrator
   workflow. A verified Auth account must exist before custom invite redemption;
   account creation and application membership are different steps. There is no
   public create-account or password endpoint in this implementation.
4. Bootstrap the first synthetic admin through SQL Editor as the database owner,
   using the reviewed template below. No API caller can bootstrap themselves.
   Enable MFA for that identity and obtain an aal2 access token through the provider
   test flow. A JWT copied from a normal password login has only aal1.
5. Add Preview bindings MEMBER_FOUNDATION_ENABLED=false,
   MEMBER_APP_ORIGIN=https://feat-public-interactions-bac.haven-77v.pages.dev,
   and SUPABASE_PUBLISHABLE_KEY for this development project. Preserve the public
   workflow's existing bindings. Never substitute SUPABASE_SECRET_KEY here.
6. After review, enable both development switches and redeploy the existing
   feature preview containing this change. A branch-specific preview will return
   404 because its origin is deliberately not allowed. Use a reviewed integration
   merge; never weaken the origin restriction to test an arbitrary preview.
7. Using only local test tooling that keeps bearer/invitation tokens private,
   verify issuance, scanner GET denial, intended identity, MFA denial/approval,
   redemption/replay/concurrency, current membership and suspension. Match the
   deployed revision, record sanitized outcomes and disable both switches afterward.

Bootstrap template (replace the placeholder locally; no real UUID is recorded):

```sql
begin;
do $$
declare admin_id uuid := 'REPLACE-WITH-VERIFIED-TEST-AUTH-USER-UUID';
begin
  if exists(select 1 from haven_members.members where role='admin') then
    raise exception 'Admin already bootstrapped';
  end if;
  if not exists(select 1 from auth.users where id=admin_id
    and email_confirmed_at is not null and is_anonymous is not true
    and (banned_until is null or banned_until <= now())) then
    raise exception 'Verified test user required';
  end if;
  insert into haven_members.members(id,role,consent_version)
    values(admin_id,'admin','member-v1');
  insert into haven_members.audit_events(actor_id,subject_id,action)
    values(admin_id,admin_id,'admin_bootstrapped');
end $$;
commit;
```

After reviewed development configuration only:

```sql
update haven_members.configuration set enabled=true where singleton;
```

Rollback closes entry through both switches, preserving data and the public
site. Do not drop the schema or restore old data to roll back an API release.
Database operators can inspect enrollment/audit rows; this is not protection
against privileged provider administrators. Retention for invitations, audit
records and redemption buckets plus cleanup scheduling requires a separate
policy/review before real invitations.

## Verification and outstanding work

Node API tests use fake Auth/Data API responses and no real email or identities.
The separate localhost haven_member_tests database runs the migration with
minimal local Auth-schema fixtures and request.jwt.claims helpers. It tests real
SQL authorization, RLS, MFA assurance, expiry/revocation, concurrent redemption,
role escalation, immediate suspension, rollback after partial membership failure,
rate limits and audit protection. It does not validate GoTrue, a real signed JWT,
provider MFA enrollment, cloud RLS settings or Auth provisioning.

The next member-app change must implement trusted account provisioning/invite
email delivery, sign-in, secure session/refresh/logout/recovery, staff MFA UI,
consent copy approved by Tim, a protected entry screen, export/deletion and
retention/maintenance. No member UI or Figma fidelity is claimed here. Full
private-pilot issues #2-#5/#8 remain open. Do not invite real participants before
those lifecycle, privacy, moderation and end-to-end release checks are complete.

Sources for the implementation contract:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/users
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
