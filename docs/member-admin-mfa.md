# Staging administrator MFA and invitation tools

The member app now includes authenticator setup and verification, invitation
creation, and revocation of unused invitations. Administrator tools remain closed
unless MEMBER_ADMIN_UI_ENABLED=true, independently of MEMBER_UI_ENABLED. Both
application switches and the existing database configuration switch default to
false. No cloud setting, database migration, account, email or DNS change is made
by this change.

## Access and handling

Every administrator page and POST checks the provider-verified Auth identity and
fresh haven_member_self membership. Members, moderators and suspended/removed
accounts cannot use these tools. First TOTP enrollment is available only to an
active administrator. Existing verified TOTP factors cannot be removed through
these screens. Restarting first setup removes only the caller's unfinished TOTP
factors. Factor IDs submitted to verification must belong to that caller.

Verification uses the request-scoped Supabase server client and writes the
upgraded session to the existing HttpOnly cookies. Invitation creation/revocation
also require aal2 in the application; the existing SQL RPCs independently verify
the signed JWT assurance and current admin permission after acquiring their
transaction lock. Application role checks do not replace SQL authorization.

Mutation handlers accept only bounded, exact-origin URL-encoded POSTs; GET and
forged POST requests cannot enroll, verify, issue or revoke. Results are private,
uncached server-rendered pages. Authenticator setup keys and raw invitation codes
are returned only in their POST result body, never redirects, URLs, cookies,
browser storage, or RPC parameters. Dynamic HTML text is escaped and QR SVG is
encoded into a passive image data URL. A missing, unexpected or oversized QR
image falls back to the provider-issued manual setup key; it does not grant access
without authenticator verification. SVG presentation is bounded at 1 MB.
Enrollment failures log only fixed stage codes, never provider payloads, keys,
factor IDs or exception text. No browser SDK, third-party resources,
service key or new dependency is introduced. Authenticator factors, invitation
IDs and codes are sensitive: disable request/response body capture, session replay
and screenshot/trace collection in the host and test environment.

Creation is restricted to reserved @example.test recipients for this development
milestone. It uses 32 cryptographically random bytes and stores only a SHA-256
hash through haven_issue_member_invitation. SQL retains the ten-per-hour issuance
limit and 1–168 hour lifetime. Recipient account provisioning remains separate.
The private schema remains outside Data API exposed schemas. There is no invitation
list, automatic email delivery, participant provisioning or password/MFA recovery.
Revocation accepts an invitation ID and uses the SQL idempotent response; it does
not disclose whether an ID existed and cannot undo consumed membership.

POST result pages intentionally show a setup key or invitation code once. Save
the authenticator in your app before navigating away; an unfinished factor's secret
cannot be retrieved through the GET page. Use the return link rather than reloading
a POST result. Browser POST resubmission may restart unfinished setup or issue
another invitation within the SQL limit. Idempotent issuance is future work.

## Protected staging test after merge

1. Keep Vercel Authentication on All Deployments. Use only the isolated
   havenforward-staging Supabase project and fictional test accounts. Preserve
   MEMBER_APP_ENVIRONMENT=staging and the exact stable MEMBER_UI_ORIGIN.
2. Start with both UI switches and haven_members.configuration.enabled=false.
   Merge/deploy this reviewed change while closed. No additional migration is
   needed if 202610090002_member_foundation.sql was already applied once.
3. For the short synthetic test session only, enable the SQL switch,
   MEMBER_UI_ENABLED=true and MEMBER_ADMIN_UI_ENABLED=true; redeploy. Supabase
   TOTP MFA must be enabled, and provider/host abuse controls must be configured.
4. Sign in as the bootstrapped fictional admin, open /admin, then set up an
   authenticator. Keep its QR/key and six-digit codes private. An incorrect code
   must leave the tools inaccessible. A current code should open /admin.
5. Issue an invitation for a prepared verified account without membership using
   its @example.test address. Save the code and invitation ID privately. In a
   separate browser session, verify recipient matching, explicit consent,
   acceptance, replay rejection, and absence of browser-token storage. Use
   separate invitations for wrong-recipient, expired and revoked tests.
6. Use the saved ID to revoke an unused invitation. It must fail redemption.
   Verify a password-only admin cannot issue/revoke, a member/moderator cannot
   use the tools, and suspension/demotion blocks an already elevated session.
7. Verify independent browser sessions, logout, expired/invalid refresh tokens,
   provider-outage behavior, direct signup denial and small-screen accessibility.
   Provider-issued signed JWT assurance must be verified on this real staging
   provider; local fake-provider tests cannot establish it.
8. Restore all three switches to false and redeploy. Keep access protection.
   Record sanitized results and the exact deployed revision; never record codes,
   keys, passwords, cookies, bearer tokens or QR screenshots in repository issues.

## Verification boundaries

Node tests exercise fresh authorization, MFA ownership/elevation, fail-closed
behavior, token generation/hashing, input limits and HTML escaping. Browser tests
run the actual Next route handlers and real Supabase SSR adapter with a strictly
test-process-only fake provider, including HttpOnly cookie elevation, QR loading,
POST-only mutation, forged-origin rejection, no browser storage, accessible forms,
issuance and revocation. The fixture is not imported by application code. Existing
real PostgreSQL authorization tests remain the independent SQL check.

Live MFA enrollment/assurance, abuse settings, concurrent provider sessions,
invitation replay/expiry/revocation and lifecycle requirements remain release work.
These screens do not make the app ready for real participants.

References:

- https://supabase.com/docs/guides/auth/auth-mfa/totp
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/rate-limits

## Live enrollment troubleshooting

On October 10, the operator observed Supabase POST /factors returning 200 with
factor_in_progress while the app displayed setup unavailable. This establishes
that the provider created an unfinished factor, but does not establish which
application validation or rendering step failed. The former 100 KB QR cutoff
and exact prefix requirement could reject successful responses. The manual-key
fallback removes QR presentation as a prerequisite, and fixed stage logging
identifies future failures without exposing enrollment secrets.

After this change is deployed, return to /admin/mfa and use Restart authenticator
setup to replace only the caller's unfinished TOTP factor. Do not reload the failed
POST or delete a verified factor. If unavailable persists, inspect Vercel logs for
Member MFA enrollment: followed by list_factors, remove_pending, provider_enroll,
invalid_result or render_result. qr_fallback is a presentation warning rather than
an enrollment failure. Live retesting remains necessary.
