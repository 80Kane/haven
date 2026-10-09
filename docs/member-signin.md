# Member sign-in and private entry

This adds a separate Next.js App Router/TypeScript application in member-app,
using the SQL foundation from PR #18. The public static build and its domain stay
independent. This is a disabled development milestone, not a live participant pilot.
The architecture ADR remains proposed. The linked Figma file returned a selection
error through its design tool; these are functional interim screens, not an approved
Figma implementation.

## What works

Existing verified test Auth users can sign in with a password, enter a matching
invitation code with explicit member-v1 consent, reach a minimal private entry
screen after SQL membership verification, refresh their session, and sign out of
the current browser. There is no signup route. Password sign-in cannot create an
Auth account or grant membership. Suspended/removed members cannot enter the
private screen or reactivate by redeeming another invitation.

Each request creates its own Supabase server client using only the publishable
key. There is no browser Supabase client, browser token storage, service secret,
or role supplied by the user. The server verifies current Auth identity with
getUser and checks haven_member_self before rendering private entry. SQL handles
recipient binding, expiry, replay, membership status and authorization independently.
The Next app calls these user-scoped RPCs directly; it does not proxy credentials
through the feature-preview Cloudflare endpoint.

Session cookies are HttpOnly, SameSite=Lax, path=/ and Secure on HTTPS, using the
__Host-haven-auth prefix with no Domain attribute. Cookie chunks are preserved on
refresh. A Next Proxy refreshes sessions before read-only pages; POST handlers use
a writable cookie boundary themselves. POST logout can still clear local cookies
when the provider is unavailable. Cookie lifetime is eight hours from writing;
this is not an absolute provider-session time limit. Local HTTP is accepted only
for next dev on http://127.0.0.1:4180, with the non-Secure development cookie name.

Form POSTs require the exact configured request/Origin origin, a bounded streamed
URL-encoded body, supported fields and no duplicate fields. Raw invitation codes
are accepted only in POST bodies and hashed before database calls. Codes never
appear in generated URLs. Same-origin referrers preserve native POST Origin
validation and send no referrer to external destinations. Null origins remain denied. GET cannot sign in, redeem or sign out. Error messages
are neutral and redirects go only to fixed local routes. Passwords are not echoed
in responses. Disable body logging, session replay and sensitive telemetry at the
host; this application does not configure external logging infrastructure.

All pages are dynamically rendered. Responses are private/no-store with
same-origin referrers, framing restrictions and a per-request script nonce. Do not override
these with CDN caching. Production CSP has no unsafe-inline or unsafe-eval scripts;
development permits unsafe-eval for the framework's development runtime. There
are no trackers, external fonts, personal journals, posts or messages.

Sign-out calls the provider with scope=local and clears all local Auth chunks.
Other devices remain signed in. If revocation fails, the UI says that local logout
completed without confirmation of provider revocation. A previously copied access
JWT can remain valid until expiry; suspension/removal at the database membership
boundary is the immediate private-access control, not cookie deletion alone.

## Run locally with synthetic users only

1. Review/apply the existing member foundation migration once in an isolated
   development Supabase project. Keep public signup and anonymous signup disabled.
   Prepare verified synthetic Auth accounts using the trusted operator workflow.
   Follow docs/member-foundation.md for bootstrap and test invitation issuance.
2. In member-app run npm ci --ignore-scripts. Use Node 22 or 24. Copy .env.example
   to .env.local, which is ignored by Git.
3. Leave MEMBER_UI_ENABLED=false to see the closed-access screen first. Then set
   MEMBER_APP_ENVIRONMENT=staging, MEMBER_UI_ORIGIN=http://127.0.0.1:4180,
   and the development project's SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
   Do not supply a secret/service key. Enable MEMBER_UI_ENABLED only for reviewed
   synthetic tests. The database enabled switch must also be true for membership.
4. Run npm run dev and open http://127.0.0.1:4180. Sign in as a synthetic active
   member to check entry, reload and logout. Sign in as a verified non-member to
   check invitation failure and acceptance. Repeat after suspension in SQL.
5. Restore both UI and database switches to false when finished. Keep the public
   email/Hug flags independent.

For a separate protected staging deployment, use a Node-capable Next.js host with
member-app as the project root, npm ci, npm run build and the host's Next runtime.
The existing static Cloudflare Pages build cannot serve this app. Set the exact
reviewed HTTPS staging origin in MEMBER_UI_ORIGIN; the placeholder .invalid origin
and the public havenforward.com domain/subdomains are rejected. Require access
protection and synthetic-only data. Do not move DNS or set production credentials.
No host, domain, cloud setting or migration is changed by this PR.

## Verification and limits

Member Node tests exercise authorization, input/origin validation and the real
@supabase/ssr adapter against a fake provider, including cookie flags, refresh,
local logout and independent browser sessions. Browser tests run the actual Next
route handlers with a test-process-only fake fetch provider and reserved example.test
accounts, including active/pending/suspended users, invitation failure/acceptance,
GET and forged-POST denial, reload/logout, small-screen layout, keyboard entry and
axe checks. The fixture preload is never imported by application code and must
never be used for a deployment. Browser traces are disabled to avoid recording
authentication form fields. Existing real PostgreSQL authorization tests still run.

Fake provider tests do not establish real signed-JWT verification, GoTrue settings,
cloud MFA, CDN behavior, live provider rate limits or actual email delivery. Before
activation, record the deployed revision and perform real synthetic staging checks,
including invalid/expired refresh tokens, provider outage logout, suspension during
an existing session, direct signup denial and simultaneous browser isolation.
Configure provider and host sign-in abuse limits before exposing the endpoint.

Trusted account provisioning, invitation email delivery, password recovery, staff
MFA screens, owner-approved consent copy, privacy export/deletion, retention,
moderation and reviewed Figma screens remain future work. There are no staff-write
controls in this UI: existing database staff RPCs still require aal2. Do not invite
real participants until those lifecycle and release prerequisites are complete.

References:

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://nextjs.org/docs/app/guides/authentication
- https://nextjs.org/docs/app/guides/content-security-policy
