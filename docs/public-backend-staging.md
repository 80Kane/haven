# Public interactions: development/staging backend

This change adds a server-only backend foundation. It does not open member
registration or activate production forms. The user confirmed that Supabase
project `jveofsddjgoqknpquxpx` is new development with no live member data.

## Implemented and locally verified

- Atomic persistent Hug counter; concurrent duplicate submissions from the same
  network accept only one per UTC day. Turnstile is mandatory before mutations.
  This conservative network limit can affect people sharing a connection; review
  pilot feedback before replacing it with a reviewed pseudonymous actor design.
- Email-interest consent version, pending registration, 24-hour confirmation,
  single-use confirmation, unsubscribe, and neutral duplicate responses.
  Interest registration never creates an Auth account or grants membership.
- Only SHA-256 token hashes are stored. Emails are private application data,
  not public rows. Abuse keys use a secret HMAC of scope/day/network; raw IP
  addresses are not stored in these tables.
- Database throttling: at most five interest attempts per network per clock hour.
  CAPTCHA action and hostname must match. Origin validation, no CORS, bounded
  streamed request bodies, no sensitive responses/logging, and fixed RPC names.
- Confirmation/unsubscribe GET renders an explicit POST form without consuming
  tokens. Email scanners cannot confirm or unsubscribe merely by visiting.
  Unsubscribe remains available when new interactions are disabled.
- Email transport uses Resend idempotency keys. An unsuccessful provider response
  removes only the new pending request so retry is possible. A late email after
  a network timeout can contain an invalidated token; request a new link. Do not
  describe transport acknowledgement as proof of inbox delivery.
  New/existing addresses receive the same neutral response even during a mail
  outage. The response acknowledges an attempt, not successful delivery. Generic
  failure metrics contain no addresses/tokens; cleanup failures need operator
  reconciliation and may delay retry until expiry.
- No anonymous/authenticated table or RPC access. The server role can call the
  narrowly scoped RPCs, but cannot directly enumerate subscribers through this
  schema. All exposed tables have RLS and no client policies. Privileged provider
  operators may still access data; this is not end-to-end encryption.

Tests use PostgreSQL 17 in an isolated named localhost test database. Production
hosts are rejected by the test runner. Turnstile and Resend are explicit fakes;
no real mail is sent and no cloud database is modified by tests. Do not describe
these as live provider or Supabase Auth/RLS pilot tests.

## Local development

```sh
docker run --name haven-public-backend-tests --rm -d \
  -e POSTGRES_PASSWORD=haven_local_tests_only \
  -p 127.0.0.1:55432:5432 \
  postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3
npm ci --ignore-scripts
npm run test:backend
```

The password is an intentionally nonsecret local fixture, not a cloud credential.
Stop only this container when finished: `docker stop haven-public-backend-tests`.
CI provisions the same isolated PostgreSQL image and runs the backend suite.

## Cloud staging setup (not performed automatically)

Project API keys authorize data APIs, not SQL schema administration. No SQL
management credentials or Cloudflare administrative access are present in the
cloud machine. The project secret must not be misrepresented as migration access.

1. Review `supabase/migrations/202610080001_public_interactions.sql` in the PR.
   In the confirmed development project only, open Supabase **SQL Editor**, paste
   the reviewed migration, and run it. It creates `haven_public` and seven RPCs;
   it does not modify Auth configuration, existing accounts, or member data.
   It is transactional and intentionally fails if its schema already exists;
   record application rather than blindly running it twice. Do not expose the
   `haven_public` schema through PostgREST settings.
2. Keep Supabase public Auth signup disabled before invitation-only enrollment.
   These public interactions do not implement the private pilot (#2–#6).
3. In Cloudflare Pages project `haven`, configure **preview/staging** bindings
   separately from production. Cloud Codex settings are not hosting bindings.
   Set `PUBLIC_INTERACTIONS_ENABLED=false` initially. Set `SUPABASE_URL` to the
   development project and `APP_ORIGIN` to the exact stable staging URL, without
   a trailing slash. Set `EMAIL_FROM` to an actually verified Resend sender.
   Cloudflare shortened this branch alias to
   `https://feat-public-interactions-bac.haven-77v.pages.dev`; use this actual
   hostname for the origin and Turnstile restriction.
4. Add secret bindings `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`,
   `TURNSTILE_SECRET_KEY`, and `ACTOR_HASH_SECRET` in Cloudflare's secure settings.
   Generate a high-entropy random HMAC secret (at least 32 bytes); do not reuse
   an API key. Create a Turnstile widget restricted to the staging hostname and
   record its public site key for the future UI. Never put these secret values
   in the repository, browser code, chat, or PR body.
5. After the schema and real challenge are verified, enable the feature flag in
   staging only. Redeploy the preview so new bindings apply. Do not copy the
   development project key into production bindings.

Cloudflare Pages Functions discovers `functions/api/[[path]].js`. Static `dist/`
is still an allowlisted public artifact; it does not include SQL or secrets.
The existing host's Functions build must succeed on the feature branch before
claiming an edge deployment. GitHub Pages cannot run these functions.

## API and release gates

Routes: `GET/POST /api/public/hugs`, `POST /api/public/interest`, and
`GET/POST /api/public/confirm` / `unsubscribe`. New mutation payloads include
`turnstileToken`; widget actions must be `hugs` or `interest`. Interest also
requires `email`, `consent: true`, and `consentVersion: "interest-v1"`.

The backend is disabled without required bindings. Unknown API routes return
404; unavailable known routes return 503. Member routes remain unavailable.
Anonymous count reads reveal only the aggregate. No public subscriber list exists.

Before any public UI activation:

- Apply the migration in development and run real staging RPC/permission tests.
- Verify a real Turnstile challenge, including action/hostname mismatch and reuse.
- With an explicitly authorized test inbox, verify confirmation email delivery,
  scanner-safe GET, actual POST confirmation, expiry/replay, unsubscribe, and
  rate limits. No unsolicited test messages.
- Configure hourly maintenance calling `haven_cleanup_public_interactions()`
  through a trusted scheduler. It removes previous-day Hug receipts, rate buckets
  older than 24 hours, and pending interest records after seven days. Verify it
  executes. Establish confirmed-list retention, withdrawal handling, private
  contact, vendor/log policies, and backup deletion before collection.
- Update public privacy/consent copy to match the activated service, review the
  accessible frontend form and challenge, and run staging browser tests.
- Obtain review and production approval; provision a separate production project
  and bindings. Keep confirmation/unsubscribe routes operating for existing
  subscribers even during a new-signup shutdown. Disabling functionality is not
  a substitute for deleting stored data.

No claims of production hugs, saved signup, or email delivery are justified by
local tests alone. Remaining pilot work: invitations, verified sessions, scoped
roles/staff MFA, moderation, private groups, privacy/export/account removal.
