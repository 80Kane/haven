# HavenForward Learning: hybrid library and implementation handoff

Date: 2026-10-08. Parent: [issue #11](https://github.com/80Kane/haven/issues/11).
Status: design and executable reference policy; no backend integration or production launch.
Baseline: `development` at `8eaaeb467b0a03d1ca5d75be508cbda2e79777b3`.
Alignment: proposed invitation-only architecture in [PR #10](https://github.com/80Kane/haven/pull/10).
Issue #11 supersedes that ADR's deferral of learning uploads for this design work;
production uploads remain behind review and a feature flag.

## Delivered artifacts

- Editable [Figma learning screens](https://www.figma.com/design/UEV0kB2dXWVNsiilzH8IBz?node-id=17-335): content studio, upload, course creator, catalog, player, institutional release manager and mobile catalog.
- `design/learning/index.html`: responsive interactive review prototype. Search/topic filters, learner previews, simulated staff-role restrictions, editable/reorderable modules and lessons, browser-local draft saving, JSON export, file-selection checks, and license-date validation.
- `design/learning/access-policy.mjs`: deny-by-default reference model for learner access and staff actions. It is not a production endpoint, RLS policy or authentication system.
- `design/learning/access-policy.test.mjs`: runnable positive and negative access tests.

The prototype has no network requests, video playback, real upload, real accounts,
publisher release or persistent learner progress. It uses only sample course records.
Creator attribution is a proposal, not proof of permission. Browser storage contains
draft metadata only. Never enter member information or credentials in the prototype.

## Product model: one content system, independently scoped releases

Course -> immutable Course Version -> ordered Modules -> ordered Lessons -> Assets.
A release exposes a specific version to one channel; it does not change ownership.
Public clips and full protected videos use separate asset IDs to avoid leaking
the full video through a preview. A public course may stand alone if explicitly approved.

| Access level | Eligible audience | Authorization and distribution |
|---|---|---|
| Public | Visitors | Only published public releases whose included assets have current public rights. No account needed. Public thumbnail and summary are separately approved marketing data. |
| Member | Verified, invited, active Haven members | Published member release plus current member-channel rights. Suspension/removal immediately denies new media tokens. No institutional redistribution implied. |
| Institutional web | Verified organization users with active facility/seat entitlement | Named organization, facilities, territory, course version, term, permitted operations and institution-channel rights must all match. Separate tenant scope; personal Haven membership not required or sufficient. |
| Edovo / Securus packages | Contractually named platform and facilities | Independently licensed release package and platform content approval. No web-member playback route for these channels. No integration, partnership or acceptance claimed. |

Default every new course, asset and release to private draft. Public catalog
metadata is its own approved projection: never filter confidential records in the
browser and never leak unreleased titles, rights documents or storage keys.
Institutions access a dedicated catalog, not member community posts or profiles.

## User journeys

1. **Public visitor:** open Learning -> filter/search approved public catalog ->
   watch public introduction or read transcript -> encounter invitation information
   for member course. Viewing creates no account; signup is not implicit.
2. **Invited member:** verify invitation and sign in -> browse permitted courses ->
   resume a lesson -> use captions/transcript -> optionally mark completion ->
   view/export/delete own activity. No public progress leaderboard.
3. **Contributor:** staff MFA -> create own draft -> request resumable upload ->
   provide metadata/captions/rights reference -> await processing -> submit review ->
   respond to requested changes. Submission never publishes.
4. **Publisher:** open queue -> preview through scoped staff endpoint -> validate
   rights and accessibility -> approve editorial version -> publish a channel release
   transactionally -> audit event. Unpublish without deleting the source asset.
5. **License manager:** record creator permission and executed institutional agreement ->
   bind version/assets/facilities/channel/term -> review export manifest -> approve
   authorized package or web entitlement -> monitor expiry/revocation.
6. **Institution learner:** use verified organization access -> see only licensed
   facility catalog -> play assigned version -> retain minimal own progress under
   institution-specific consent and retention. External-platform progress imports
   require a separate agreement and validated mapping; they are not assumed available.

## Figma frame-to-route map

Existing pilot screens were inspected. No Code Connect files, component instances,
local variables or local text styles existed in those screens. Learning views reuse
Simple Design System Button, Input Field and Card instances with editable text,
Inter typography and established Haven purple/dark palette. No flattened UI images.
These are review frames, not wired Figma navigation; the HTML prototype is interactive.

| Figma node | Screen | Proposed route |
|---|---|---|
| `17:335` | Content studio | `/staff/learning` |
| `17:438` | Upload media | `/staff/learning/media/new` |
| `17:504` | Course creator | `/staff/learning/courses/:id/edit` |
| `17:593` | Hybrid catalog | `/learning` |
| `17:684` | Lesson player | `/learning/:course/:version/:lesson` |
| `17:745` | Institutional releases | `/staff/learning/licenses` |
| `17:828` | Mobile catalog | `/learning` at mobile breakpoint |

Use explicit loading, empty, upload-paused, failed-processing, rejected-review,
missing-captions, expired-rights, expired-license and denied-access states in
implementation. Tell learners what action is available without revealing private data.
Mobile upload warns about data use and interrupted transfers. Keyboard move-up/down
controls supplement drag-and-drop. The HTML prototype uses those controls already.

## Staff permissions

Staff assignments are database-controlled, require verified identity + MFA, and
do not derive from client-selected roles or user-editable metadata. Roles can be
combined explicitly; admin does not automatically gain every permission.

| Action | Contributor | Publisher | License manager | Admin | Moderator |
|---|---|---|---|---|---|
| Create/edit/upload/submit own draft | Yes | Yes, any authorized draft | No | Only if assigned content role | No |
| Approve/publish/unpublish | No | Yes | No | Only with publisher role | No |
| Manage institutional agreements / export | No | No | Yes | Only with license-manager role | No |
| Manage staff assignments | No | No | No | Yes | No |
| Read own member progress | As member | As member | As member | As member | As member |
| Inspect flagged lesson | No | Yes | Only licensed release review | Explicit review grant | Scoped moderation grant |

Contributor ownership checks apply to both draft ID and every attached asset.
Staff preview has a separate endpoint, audited grant and short-lived media token;
learner endpoints never treat staff role as a blanket authorization bypass.
Moderation scope never grants access to private reflections or named progress.

## Architecture and provider choice

Keep the existing landing page and its deployment flow. Add Learning to the
proposed Next.js/TypeScript modular application after the pilot authentication
foundation is approved. Reuse one backend boundary rather than adding a second CMS.
Hosting choice for the application remains to be confirmed; no DNS changes needed
for this design PR. Isolated staging and production projects/secrets are required.

| Component | Proposed responsibility | Decision |
|---|---|---|
| Next.js server | Verified identity, validation, access decisions, media token broker, publishing | Align with PR #10; framework scaffolding is still pending |
| Supabase Auth/Postgres | Invitations/members, structured content, roles, licenses, progress, RLS | Build atop auth foundation; no project credentials supplied here |
| Supabase private Storage | PDF/audio/thumbnails/captions and private rights documents | Separate buckets; no public writable storage; downloads authorized |
| Cloudflare Stream | Video direct/resumable upload, transcoding, adaptive player, signed delivery | Preferred candidate, not activated |
| Resend | Neutral staff review notices and existing account mail | Optional for Learning MVP; no lesson activity or personal excerpts in mail |
| GitHub Actions / Node / Playwright / real DB tests | Checks, negative authorization tests, accessible browser journeys | Reference Node tests added; production CI and DB tests still pending |

Stream suits the existing Cloudflare context and supports direct uploads without
exposing provider credentials and delivery requiring signed tokens. Supabase Storage
policies work with RLS, but storage permissions must be implemented explicitly.
Neither service supplies Haven's invitation/license logic automatically.

Compare Mux before committing a paid provider using the same trial videos and
estimates for stored minutes, delivered minutes, resolution, caption support,
privacy controls, retry experience and export needs. Avoid self-hosted raw MP4
as the default mobile learning experience: it shifts transcoding/player work to us.
Do not invent pricing. Obtain current account-specific rates before activation.

Source documentation checked 2026-10-08:
- https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Proposed schema and constraints (not an applied migration)

| Table | Required fields and constraints |
|---|---|
| `learning_courses` | UUID, creator, collection, archived state, current draft/version references; immutable owner assignment through server |
| `learning_versions` | Course, unique version number, title/description/objectives, language, suitability/content warning, reviewer approval, content hash; published snapshot immutable |
| `learning_modules` / `learning_lessons` | Version/module FK, ordered position unique within parent, lesson type, text/reflection/quiz spec; bounded sizes |
| `learning_assets` | Owner, provider, private provider ID/key, type, byte size/duration, processing/scan state, captions/transcript status, checksum; no anonymous inserts |
| `learning_lesson_assets` | Version/lesson/asset relation; reuse allowed only with owner/staff authorization and scoped rights |
| `learning_rights` / `learning_rights_assets` | Private evidence reference, owner/creator attribution, version and asset scope, channel, operation, territory, start/end, approval, revocation; start < end |
| `learning_releases` | Version, one channel, draft/review/published/withdrawn state, publisher, timestamps; publication references current reviewed snapshot |
| `learning_organizations` / `learning_facilities` | Organization, verified facility scope; membership/seat tables separate from personal Haven membership |
| `learning_licenses` / `learning_license_assets` | Organization, facilities, version/assets, channel, territory, start/end, status, agreement reference, stream/download/export/adapt permissions, seat/device limits |
| `learning_progress` | Auth user, authorized lesson/version, position, optional completed-at, timestamps; unique user/lesson/version; users cannot set another actor |
| `learning_upload_jobs` | Owner, provider upload ID, expiry, reserved minutes, state, idempotency key, retries; server-only provider metadata |
| `learning_reviews` / `learning_audit_events` | Scoped editorial decisions, publication/rights/assignment/export/deletion events; append-only audit, no content bodies/tokens |
| `learning_export_jobs` | License, version, immutable asset manifest/hashes, approver, destination, expiry, delivery receipt and revocation notice state |

Private schema holds rights evidence, provider IDs, upload jobs, agreements and
audit data. Exposed tables get explicit grants and RLS before data is inserted.
Approved public views project only marketing fields. Views/functions must preserve
RLS and use reviewed search paths; security-definer privileges are narrowly granted.

## Access controls to implement and test

1. Verify identity server-side and load current membership/staff/tenant grants from
   trusted records. Never use the role selector, client JWT metadata or supplied owner ID.
2. Check release publication, exact version, asset relationship, readiness, applicable
   rights, operation, term, territory, tenant/facility/seat and license on each read,
   token, download and export. Missing/expired/unknown inputs deny by default.
3. Bind institutional licenses to exact asset manifests including worksheets,
   audio, captions and thumbnails. One licensed video cannot authorize another.
4. PDFs/audio and private thumbnails remain in private buckets. Issue expiring links
   only after the same authorization as video; never expose service-role keys.
5. All full videos require signed delivery from creation. Public preview copies may
   use a public release or short-lived tokens only after explicit rights approval.
   Allowed origins are additional protection, not authentication.
6. Token broker uses `Cache-Control: private, no-store` and no token logging. Proposed
   playback TTL: five minutes, capped by rights/license expiry. Refresh while playing
   only after reauthorization. Existing tokens may work until expiry after revocation;
   test provider behavior. They do not prevent screen recording or authorized copying.
7. Progress RLS allows only owner read/write/export/delete. No client-supplied user
   assignments, per-person institutional dashboards or private reflection analytics.
8. Publishing checks every child asset and current rights transactionally; edits
   create a new version. Optimistic locking stops stale review from approving edits.
9. Disable unpublish/expired rights immediately for new requests. Existing offline
   institutional packages require contractual recall/takedown; remote deletion is
   not guaranteed. Keep a delivery ledger and notify the named institutional owner.
10. Validate origins/CSRF, bounded requests, safe text rendering, exact callback URLs,
    provider event authenticity and replay/idempotency. Provider outages fail closed.

The executable reference policy covers access decisions only. It deliberately
does not generate tokens or enforce database/storage policies. Its inputs are
trusted-record assumptions; tests passing do not establish production security.
Staff actions need additional transactional editorial gates and tenant scoping.

## API contracts

| Method / route | Gate and behavior |
|---|---|
| `GET /api/learning/catalog` | Public projection or verified scoped catalog; paginate/filter on server; never expose confidential release data |
| `POST /api/staff/learning/courses` | Contributor/publisher + MFA; private draft, server owner; validated objective/metadata |
| `PATCH /api/staff/learning/courses/:id` | Own contributor draft or publisher grant + expected revision; no modification of immutable released version |
| `POST /api/staff/learning/uploads` | Authorized draft, quotas and MIME/size intentions; reserve budget; one-time scoped provider URL; private delivery enabled |
| `POST /api/learning/provider-events` | Provider signature/authentication + replay defense; lookup known upload; poll provider when event unsupported; no publication |
| `POST /api/staff/learning/courses/:id/review` | Submit current revision; contributor cannot approve own production release |
| `POST /api/staff/learning/releases/:id/publish` | Publisher + MFA + current editorial/rights/captions checks; transaction + audit; idempotency key |
| `POST /api/learning/lessons/:id/playback` | Identity/license rules; minimal token response, five-minute cap; no shared caching |
| `POST /api/learning/assets/:id/download` | Authorized lesson/version/asset + explicit operation rights; expiring link |
| `PUT /api/learning/progress/:lesson` | Authorized learner, own bounded position and completion; idempotent per user/version |
| `GET/DELETE /api/learning/me/progress` | Own export/deletion; no other learner data; disclosed retained audit/backup policy |
| `POST /api/staff/learning/licenses` | License manager + MFA; validated agreements/facilities/version/term; not automatically published |
| `POST /api/staff/learning/exports` | Explicit export/adaptation rights, valid license, scoped manager; manifest + audit; no reflection/progress data |

## Upload, retention and budget guardrails

Proposed pilot defaults, adjustable after trial and review: MP4/MOV <=2 GB and
60 minutes; VTT <=2 MB; JPG/PNG <=10 MB; PDF <=20 MB; audio <=200 MB. Validate
actual formats server/provider side, not only extensions. Reject SVG/HTML/executables.
Scan attachments in quarantine before ready state; validate and sanitize VTT/text.
Use resumable protocol for large files, expiring upload grants, two concurrent
uploads per contributor and idempotent retries. Reserve maximum video minutes
before an upload; release/reconcile reservation on failure or actual processing.

Proposed monthly guardrails: 80% budget alert, 100% blocks new upload reservations;
existing playback has a separately approved safety/continuity budget. Dollar limits
and billing recipients must be set before activation. Estimate:

`stored minutes * storage rate + delivered minutes * playback rate + attachment storage/egress + auth/database/email tier costs`.

Example planning quantities, not measured demand: 20 videos * 15 minutes =
300 stored minutes; 50 learners * 120 minutes/month = 6,000 delivered minutes.
No purchase or revenue assumption is implied.

Proposed retention: incomplete uploads 24 hours, unattached drafts 30 days with
owner notice, uploaded source originals deleted after verified processing unless
an archival agreement requires retention. Do not automatically delete rights evidence
or executed contracts using draft cleanup. Define separate contract/audit retention.
Progress retention and backup deletion windows need product approval; allow member
export/delete from launch and retain no free-text reflections in the first version.

## Implementation backlog: child workstreams under #11

These are proposed tasks, not separately created GitHub issues. Each should become
a focused implementation PR targeting development, with required evidence.

| Order / workstream | Dependencies | Done when |
|---|---|---|
| L1: Auth/tooling foundation | #1, #3, #4, #8 / architecture approval | Isolated staging, invitation-only access, staff MFA, versioned migrations and CI; roles cannot self-escalate |
| L2: Content + rights + tenant schema | L1 | FK/unique/version constraints, RLS/grants, cross-user/tenant tests; approved public projection |
| L3: Staff studio and course creator | L2, Figma review | Contributor edits own drafts, ordered modules/lessons, revisions, accessible keyboard controls, review queue |
| L4: Private media intake | L2, approved provider/cost cap | Signed resumable upload, private processing, MIME/size validation, captions, retry, quarantine and quota reconciliation tested |
| L5: Publication + member player | L3, L4, #5 safety workflow | Atomic publication gate, signed playback/download, public preview separated, captions/transcript/mobile playback; unpublish stops new tokens |
| L6: Progress and privacy tools | L5, #4 | Own-only resume/completion, version mapping explicit, export/delete, no reflection collection or named analytics |
| L7: Institutional licensing and export | L2, L5, executed scoped rights | Tenant/facility/seat/time checks, manifest/version binding, audited packages, expiry; platform review documented independently |
| L8: Pilot readiness and release | L1–L7 + #8 | Real DB/storage/provider tests, accessibility review, moderator/incident owner, rollback exercise, feature-flagged invited pilot |

Public Learning marketing/previews can ship separately once their own content,
rights and delivery work; private-course completion must not delay the public site.
No public member registration or unrestricted messaging added by Learning.

## Acceptance tests required before production

- Anonymous visitor sees only approved public metadata/assets; direct private
  database, attachment, thumbnail and provider URLs fail without authorization.
- Invited member A cannot access member B's progress; removed/unverified users
  cannot play member courses; member role cannot publish or create export jobs.
- Organization A cannot enumerate or stream organization B's course/facility;
  wrong channel, facility, version, asset, territory, expired term and revoked
  rights/license all deny. Seat caps enforce atomically under concurrency.
- Contributor cannot edit others' drafts, attach others' assets, approve own
  review or publish. Missing staff MFA denies every privileged action.
- Concurrent upload reservations respect budget; duplicate events and upload retries
  create one asset; interrupted large upload resumes; processing failures remain private.
- Replacing an approved asset or editing captions invalidates applicable review;
  incomplete or expired rights/captions prevent publication; stale revision rejected.
- Expired/replayed signatures rejected; provider outage fails closed; signed URL TTL
  is capped at rights/license end; no full-video URL in public preview payload.
- Keyboard/screen-reader navigation, mobile player, readable captions and transcript,
  focus/error states tested. Automated checks supplement manual WCAG 2.2 AA review.
- Progress position validates against duration; reset/export/delete work; logs and
  notifications contain no personal lesson activity, tokens or free-text reflections.
- Institutional exports include exactly licensed hashes/version and no member data;
  offline limitations and takedown procedure are documented to the recipient.

## Staff operating guide

**Upload:** Content studio -> Upload media -> choose original -> title/creator/
collection/language/suitability -> captions/thumbnail/worksheet -> rights evidence
and intended channel -> save private draft -> processing -> submit review.

**Course:** Create course -> objective and audience -> add modules -> add lessons
and attach approved assets -> order using drag or keyboard buttons -> preview ->
submit review. Publisher resolves checklist, approves version and publishes release.

**CEO Hockley collection:** record owner and attribution, upload/edit permissions,
Haven public/member rights and each institutional channel separately. Select pilot
videos based on educational purpose; review financial/business claims, language,
accessibility and practical action prompts. No implication of clinical or accredited
training. Build courses from authorized revised content, not merely reference videos.

**Institution:** executed agreement -> named organization/facilities -> content
manifest/version -> channel/term/territory/operations -> approval -> delivery receipt.
Do not email learner records or private reflections with content packages.

## Rollout, rollback and remaining decisions

Feature flags: `learning_catalog`, `learning_staff_uploads`, `learning_member_playback`,
`learning_institutional_exports`, default off outside approved staging. Synthetic
fixtures only. Keep database migrations additive. On incident, disable release/token
issuance and upload writes; revoke rights/entitlements, preserve audit trail and
public support resources. Roll back app deployment; do not destructively restore
private data without reconciling member deletion records.

Before backend activation, confirm: provider trial/budget, member-app hosting,
staff publisher/license-manager assignments, executed CEO Hockley rights, initial
pilot videos, institutional counterpart/channel and agreement, suitability policy,
progress/audit retention and backup windows. None block review of these designs.
Supabase/Stream credentials must be entered in hosting secrets, never chat or GitHub.
