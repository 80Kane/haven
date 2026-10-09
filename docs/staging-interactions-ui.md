# Preview interaction page

This page adds the first frontend for the existing public interaction APIs.
It does not change the landing page or open member registration. It is part of
draft PR #13 and must remain in preview until live provider checks pass.

## Where it runs

Open the stable branch URL, after signing in through Cloudflare Access:

`https://feat-public-interactions-bac.haven-77v.pages.dev/staging-interactions`

The Pages Function serves HTML only on this exact hostname, with matching
`APP_ORIGIN`, `PUBLIC_INTERACTIONS_ENABLED=true`, and all eight backend bindings
configured. Production, immutable deployment URLs and other previews receive
404, even if someone accidentally enables their flag. There is no static form
page in the build artifact. The public Site key was supplied by the project
owner; it is intentionally not a secret. The page's CSP allows Cloudflare's
challenge script and iframe; the landing page keeps its original restrictive CSP.

The `SUPABASE_URL`, `APP_ORIGIN` and flag can be text or encrypted string
bindings. The owner configured preview explicitly with Wrangler's `--env preview`
after the dashboard initially placed bindings in production. Production's
interaction flag remains off. Do not deploy development credentials or merge
this draft into production. See [backend setup](public-backend-staging.md).

## Behavior and acceptance criteria

- Count reads come from the API, not an invented or browser-local counter.
  Buttons stay unavailable until the initial count has a valid response.
- Verification is loaded only after the user chooses Prepare verification.
  Hug and email widgets use separate `hugs` and `interest` actions and answers.
  Invalid, expired or consumed answers cannot be submitted again by the UI.
- Hug save displays the returned total and whether the network already shared
  a gesture today. Reload reads the persisted aggregate again.
- Email requires native validation, a checkbox that is not selected by default,
  and a fresh email-specific challenge. Consent version is `interest-v1`.
  Submission never creates a community account. Success uses fixed neutral copy
  and does not promise delivery; the input is cleared after an accepted response.
- Every submit prevents concurrent duplicate clicks, bounds network waiting,
  handles unavailable services and rate limits, and requires fresh verification
  before retry. No automatic mutation retries, browser storage or sensitive logs.
- Native controls are labeled, status messages use polite announcements, keyboard
  focus is visible, layouts support 320–1440px, and no-JavaScript controls remain
  disabled with an explanation and support links. Real CAPTCHA keyboard and
  screen-reader behavior still needs manual review.
- The staging notice explains provider processing and the development database.
  Use a controlled test inbox only; do not collect public interest registrations
  before production privacy, retention, maintenance and rollback readiness.

## Verification evidence and remaining live tests

Local checks: nine Node/static route tests, 25 browser tests, and 21 backend
tests using real localhost PostgreSQL. Browser CAPTCHA/API responses and backend
Resend/Turnstile are explicit fakes, never production bypasses. Automated axe
checks include WCAG 2.2 AA tags; they are not a complete accessibility review.
No test mail has been sent by these suites. The owner showed a live preview
`GET /api/public/hugs` response of `{"total":0}` before the UI change, confirming
the edge-to-development-database count read. This does not validate mutations,
email delivery or the new UI. An unauthenticated request from this agent now redirects to Cloudflare Access.
Authenticated live mutations still require the owner’s browser session.

Before release, use the actual preview and complete:

1. Confirm a fresh unauthenticated browser is challenged by Cloudflare Access
   and only the intended allowlisted testers can sign in. Check the full Access
   policy; a login screen alone is not proof of the allowlist. Production must
   keep serving its public page normally.
2. Load the preview interaction page and choose Prepare Hug verification.
   Complete a real challenge, then Send a Hug. Expect one increment and a saved
   message. Reload, prepare again and retry; expect the same count and a clear
   network-limit message. Record results, not CAPTCHA tokens.
3. Enter an inbox you own, select consent and complete email verification.
   Request the email once. Verify actual inbox delivery and sender; a neutral
   API acknowledgement alone is not enough. Never send unsolicited test mail.
4. Open the confirmation link: GET must not confirm. Use its explicit button,
   verify confirmation, and check replay rejection. Test a fresh token's expiry
   separately after 24 hours or with a deliberately expired fixture in development.
5. Open the unsubscribe link: GET must not remove the record. Its button must
   remove it; repeat must be idempotent. Use a restricted SQL Editor inspection
   for the controlled test record only, without publishing addresses/tokens.
6. Check failed/mismatched/reused CAPTCHA and wrong Origin requests cannot
   mutate. Configure the maintenance schedule, verify execution and data
   retention, and review shared-network limits and manual accessibility.

Do not expose unrestricted messaging or private community routes. Invitations,
staff MFA, scoped member authorization and moderation are separate pilot work.

## Disable and rollback

To stop new preview requests, set the preview interaction flag to `false` and
redeploy only the feature preview. This also removes the test page. Preserve
confirmation/unsubscribe endpoints and credentials while test signups exist.
Unsubscribe/delete test records before decommissioning the development services.
Never copy a downloaded Wrangler configuration into the repository or deploy
from the temporary inspection directory. Review production release separately.

## Diagnosing a failed preview submission

A working count establishes database reads only. If a submission returns 503,
read the Support code beside the staging form error. The UI displays only
recognized fixed codes, falling back to HTTP 503 when no code is available.
Alternatively inspect the POST response in browser developer tools, Network → Response.
The fixed `code` identifies missing trusted edge metadata, verification transport
or decoding, network hashing, or a specific database RPC request/HTTP/decoding
failure. The same code appears in Pages Function logs. Do not share request
payloads, CAPTCHA answers, credentials or provider response bodies. These codes
never include provider text or user data. They do not relax verification or
network limits. Delivery failures keep the existing neutral email acknowledgement.

Turnstile non-success HTTP responses now include their numeric HTTP status and,
when present, one recognized error from Cloudflare’s documented allowlist.
Unknown error text and response fields are discarded. The owner’s live
`verification_http` failure confirms the request stops at Siteverify, before the
Hug RPC; its precise HTTP status and reason remain pending a fresh attempt.

## Existing-widget Spin integration

Follow Cloudflare’s existing-widget flow at
https://developers.cloudflare.com/turnstile/spin/prompt.md. The hosted prompt was
read from the official cloudflare/cloudflare-docs public/turnstile/spin/prompt.md
mirror when the documentation host was inaccessible in this environment.

Existing widget: `0x4AAAAAAFRxDw6rDpsxwBGl`. Preserve it and its clearance setting.
Frontend surfaces map `hugs` → POST /api/public/hugs and `interest` →
POST /api/public/interest. The existing Pages Function calls Siteverify using
URL-encoded form data, a ten-second timeout and a trusted edge network address.
It rejects empty/oversized tokens, requires boolean success exactly true, and
checks the action and exact hostname derived from APP_ORIGIN before the existing
handler runs. Each surface owns its widget and clears/removes it after submission;
a new preparation creates a fresh token. No verification runs in the browser.

Secret destination: Cloudflare account `85755e3970a9d60445f76d889af78ec1`, Pages
project `haven`, environment `preview`, binding `TURNSTILE_SECRET_KEY`. Do not
rename this existing binding to the prompt’s generic TURNSTILE_SECRET example or
write to production. Required widget hostname:
`feat-public-interactions-bac.haven-77v.pages.dev`; deployment validation never
allows localhost for this hosted preview.

The current agent environment has no Cloudflare auth or installed Wrangler.
Spin requires an approved canonical absolute Wrangler executable outside the
project, version 4.109 or later, exact account and destination, and a reviewed
write manifest before a secret-bearing getter or write. Do not invoke npx or a
project-local executable for that recovery. Secret binding names alone do not
validate values. Cloudflare reported invalid-input-secret for the current preview;
recovery and live verification remain incomplete.

For automatic recovery, validate widget sitekey/domains and preserve clearance,
retrieve the secret without printing/exporting/persisting it, validate it with
Siteverify’s dummy probe expecting invalid-input-response, then write via the
platform secret manager’s standard-input sink for the exact preview destination.
Use the official flow’s log-sanitization guards. Never store credentials in Git,
chat or temporary files. If the approved tooling is unavailable, use the host’s
normal secret-management flow before redeploying the latest feature preview.

After recovery, a fresh real CAPTCHA must permit one Hug. Replaying that same
answer must fail; requesting a new answer may return the unchanged daily-limit
count. These are different checks. Repeat action-scoped verification for the
controlled email test without changing its consent/delivery behavior. Automated
provider fixtures do not establish live provider readiness.
