# Owner-observed synthetic member staging verification — 2026-10-10

Tim performed these checks through the protected Vercel deployment and a new
isolated Supabase development project. Screenshots and confirmations were reviewed
in the conversation. No credentials or invitation codes are preserved here.

Member-app source: main merge a0b51b4 (PR #19). Stable tested origin:
https://haven-80kane.vercel.app. Vercel labels the main deployment Production, but
MEMBER_APP_ENVIRONMENT=staging and the Supabase project is havenforward-staging.
The production public site and its database were not used for these member tests.

## Observed passes

- Fresh signed-out InPrivate navigation reached the Vercel login gate.
- Closed UI and database switch initially reported unavailable/false.
- Verified fictional Auth user with ordinary active membership signed in.
- Page reload retained the session (this does not prove expired-token rotation).
- Logout returned to login; direct /member navigation then required sign-in.
- SQL suspension denied an existing session on reload, redirecting to invitation.
- Restoring ordinary active membership restored the private entry screen.
- Verified fictional account without membership reached invitation; direct /member
  redirected back to invitation.
- Dummy invitation rejection did not grant member access.
- A valid one-hour invitation prepared by the SQL Editor owner was accepted by
  its intended account after explicit consent; the database recorded consumption
  by that account, member role, active status and member-v1 consent.
- At session end the SQL enabled switch returned false and /login showed the
  closed-access screen after the owner disabled the UI and redeployed.

A sign-in 401 was resolved after the operator rechecked the staging publishable
key and redeployed. The specific earlier failure cause was not independently
established. A missing favicon returned 404. An esbuild install-script approval
warning did not prevent the successful Next build.

## Not established by this session

MFA-protected staff issuance/revocation, invitation replay/expiry/wrong-recipient
rejection, concurrency, expired/invalid refresh token handling, outage logout,
independent simultaneous browsers, direct signup denial and cloud abuse limits
remain to verify. The valid invitation was a privileged SQL staging fixture, not
a staff aal2 issuance test. SQL Editor state changes were also fixtures rather
than tests of the staff mutation RPC/audit workflow. No real participant readiness
or broad security audit is claimed.

The three fictional accounts and used invitation are retained for future tests.
The next UI milestone is described in member-admin-mfa.md and defaults closed.
