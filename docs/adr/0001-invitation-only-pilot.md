# ADR 0001: Incremental invitation-only HavenForward pilot

Status: proposed; requires maintainer approval before acceptance.
Issue: https://github.com/80Kane/haven/issues/1
Date: 2026-10-08
Audited baseline: `8eaaeb467b0a03d1ca5d75be508cbda2e79777b3`.

## Context and audit

The baseline contains only `index.html`, `CNAME`, and an empty npm
`package-lock.json`. The frontend is plain HTML, inline CSS, and inline browser
JavaScript. There is no package manifest, framework, build, backend, account
system, persistence, automated test suite, or tracked CI configuration.
`CNAME` contains `HAVENFORWARD.COM`, consistent with GitHub Pages custom-domain
hosting. Actual Pages source, DNS records, TLS enforcement, hosting security
headers, branch protections, and external services remain unverified. A CNAME
file is not proof of operational DNS or secure hosting.

The page renders marketing content, sample circles, a sample journal,
testimonials, and crisis information. Section navigation works for valid
fragments. The Hug button increments an in-memory number and adds random sample
names; reload resets it. Join, signup, journal saving/sharing, and responder chat
are inert. The only crisis action is `tel:988`, which initiates a call, not a text
or a staffed HavenForward integration.

Confirmed source/browser findings: bare `#` links throw a selector error; mobile
navigation disappears without a replacement; the email input has no associated
label or form; there is no main landmark; at 320px the page overflows to 332px.
Muted text contrast, focus visibility, motion, and assistive technology need a
full WCAG 2.2 AA review. Inline scripts/styles complicate strict CSP deployment.

Encryption, owner-only journals, always-on responders, partnership endorsements,
member counts, and real testimonials are not substantiated by the repository.
Verify provenance/consent or clearly label/remove these claims in a separate
reviewed content issue. The publicly delivered journal example must be synthetic
or supported by explicit publication consent. Do not collect sensitive pilot
data until policies, access controls, and moderation operations are ready.

## Decision

Preserve the existing public website during the audit and initial build. Develop
an invitation-only member application using Next.js App Router, TypeScript, and
Supabase Auth/Postgres. Deploy the member app separately in staging, then on a
reviewed application subdomain. Keep public crisis resources available without
login and independently of member-app availability.

Use a modular monolith with clear boundaries for invitations/auth, members,
groups/content, moderation, resources, and privacy. Prefer simple paginated
requests over Realtime initially. Defer direct messages, uploads, AI, journals,
and staffed responder chat until separately reviewed. Figma is the interface
specification once its pilot file/version is supplied; it does not override
privacy/accessibility requirements. The supplied pilot file is
[HavenForward — Invitation-only Pilot Screens](https://www.figma.com/design/UEV0kB2dXWVNsiilzH8IBz/HavenForward-%E2%80%94-Invitation-only-Pilot-Screens?node-id=0-1),
file key `UEV0kB2dXWVNsiilzH8IBz`, root node `0:1`. Network policy currently
blocks inspection; an approved version and frame-to-route mapping must be recorded
before UI implementation. No design conformance can be claimed yet.

A static site is appropriate for informational content but cannot implement the
required social data/access model alone. A React SPA plus Supabase is viable,
but Next.js provides one maintained server boundary for invitation redemption,
identity verification, validated writes, and privileged operations. Supabase
reduces infrastructure work but its authentication and RLS must be explicitly
configured, tested, and reviewed; neither provider guarantees anonymity.

## Trust boundaries and threat model

Untrusted browsers cross an authenticated application boundary, then a
user-scoped database boundary protected by RLS. Privileged service-role code
crosses a separate server-only boundary for narrow invitation/admin operations.
Email delivery and hosting/database providers are external processors.

| Threat | Required control and negative test |
|---|---|
| Public signup bypasses invitations | Disable public account creation at Auth/provider level where supported. A trusted enrollment path creates/adopts an account only after invitation checks. Database membership gates every private operation, including users created outside the normal UI. Test direct Auth signup and API calls. |
| Invitation guessing, leakage, replay | Use at least 256-bit cryptographically random opaque tokens, store only hashes, expire/revoke them, rate-limit redemption, suppress query/token logging and referrers, and clean callback URLs. Never consume on GET; email scanners must not redeem invitations. |
| Stolen invitation or wrong recipient | Bind redemption to the intended verified email unless a separately reviewed transfer policy exists. Do not apply provider-specific dot/plus normalization. Return neutral public errors. |
| Concurrent redemption | Atomically validate and reserve/consume a token with uniqueness/locking; exactly one member results. Auth provisioning spans systems: use idempotent state and recovery for partial failure; do not pretend it is one database transaction. |
| Cross-member/group disclosure | Deny-by-default RLS, explicit active membership, author ownership, trusted roles, no shared caching of authenticated responses. Test anonymous/A/B/removed-member/staff identities. |
| Privilege escalation | User cannot edit role/status; scoped group moderators and platform staff have separate grants. Staff MFA and audited privileged actions. Moderator UI cannot read private personal tools. |
| Harassment and unsafe moderation | Report/block, bounded posting, moderation queue, appeals and understandable notices, human decisions for safety-critical actions. No automatic emergency dispatch claims. |
| XSS, forged requests, unsafe redirects | Safe plain-text content rendering, schema validation, tested origin/CSRF protections, exact callback allowlists, CSP and response headers at the host. |
| Sensitive telemetry/provider exposure | No content/email/invite-token logging, no session replay or ad trackers. Neutral notifications, least-privilege provider access, documented retention and jurisdiction. |
| Removal followed by residual access | Revoke sessions and active membership, cancel invitations/jobs, enforce database denial immediately; idempotent deletion/export with disclosed backup/legal retention. |

Pseudonyms do not guarantee anonymity: email, network metadata, and recovery
records can identify members. Agree age eligibility, consent, jurisdiction,
moderation coverage, retention, and incident responsibilities before onboarding.
Do not claim HIPAA compliance without determining applicability and reviewing
contracts/controls. Human safety operations are a launch prerequisite.

## Proposed schema (not an applied migration)

All exposed tables require explicit grants, RLS policies for every operation,
ownership constraints, and policy tests. Review functions/views separately.

| Table | Proposed fields / constraints | Access boundary |
|---|---|---|
| `members` | UUID `id` referencing Auth, pseudonym, status (`pending`, `active`, `suspended`, `removed`), timestamps, consent version. Email stays in Auth or a private enrollment record. | Own permitted profile edits; no self-edits to status/roles. Only minimal peer profile fields exposed to eligible members. |
| `invitations` | UUID, unique token hash, intended email in restricted enrollment storage, inviter, expiry, revoked/consumed timestamps, provisioning state, optional member ID. | Trusted enrollment/staff functions only; no member directory of tokens or recipients. |
| `roles`, `member_roles` | Enumerated permission keys and member-role mappings; unique assignments. | Staff-managed, never editable through profile writes. |
| `groups`, `group_memberships` | Group visibility/join policy, member, scoped role, state; unique group/member pair. | Active authorized membership for content; scoped group management. Pilot account invitation does not automatically grant every group. |
| `posts`, `comments` | Author, group, plain-text body, moderation state, created/edited timestamps; FKs and size limits. | Active group member reads/writes; author edits; scoped moderation. Removed content hidden from regular members. |
| `reactions` | Member and post/comment target, kind; unique actor/target/kind. | Visibility/block checks; durable counts computed from authorized data. |
| `reports`, `moderation_actions` | Reporter, restricted target reference, reason, status, assigned staff, action, explanation/appeal timestamps. | Reporter can view their report status; only authorized reviewers see case details. Reported member does not see reporter identity. |
| `blocks` | Blocker and blocked member; unique pair. | Own control; server-enforced interaction rules without exposing a block directory. |
| `resources` | Title, URL, locale/region, verification date, publication status, maintainer. | Public published crisis resources; reviewed staff updates. |
| `audit_events` | Actor reference, action, target ID, timestamp, request correlation; minimal metadata, no post bodies/tokens. | Append through trusted paths; narrowly scoped staff reads; clients cannot rewrite events. Retention/pseudonymization policy required. |
| `privacy_requests`, `notification_outbox` | Request/recipient, lifecycle state, idempotency key, timestamps. | Owner request status; internal delivery worker only. No sensitive notification excerpts. |

Use typed migrations and transactional database constraints. Avoid arbitrary
client-supplied authors/roles and recursive membership policies. Keep service
keys outside browser bundles. Server identity must use supported verified Auth
claims, not untrusted session payloads. No public registration link or anonymous
access to member content during the pilot.

## Environments, CI, staging, and rollback

Use `development` for reviewed integration, `staging` for approved release
candidates, and existing `main` as production. Issue branches target development;
promote tested commits by PR into staging. A staging-to-main release requires
human approval and documented evidence. Do not assume creating branch names
establishes protection rules or deployed environments.

First confirm the actual Pages deployment source. New pilot hosting must not
rebind the existing public domain or automatically deploy integration branches
to production. Protect all long-lived branches, require PR reviews/checks, and
restrict production deployment to a protected GitHub Environment with reviewers.
Record the branch rules and deployment trigger configuration before activation.

Use separate development/staging/production Supabase projects and application
credentials. Preview deployments use synthetic nonproduction data and access
protection. Pin supported Node/package versions during the tooling issue; use
frozen installs. Version SQL migrations and test them in isolated databases.
Configure exact Auth callback URLs, staff MFA, email-domain authentication, and
privacy-safe error monitoring. Choose region and backup plan explicitly.

CI implementation belongs to the next tooling issue: build/types, unit/component
tests, real database/RLS integration, invitation security, Playwright core flows,
accessibility checks, secret/dependency scanning. PR jobs use least privilege
and no production secrets; never run untrusted PR code with privileged tokens.
Require full staging evidence before release rather than declaring CI configured
by this document.

Rollback: retain known-good deployments; disable risky features/writes or pilot
access without removing public crisis resources. Prefer additive migrations and
forward repairs; do not blindly restore older production data or run destructive
down migrations. A restore can undo member deletions and lose new content.
Test recovery in an isolated project, establish recovery objectives, and reconcile
deletion records after restore. Domain cutover is a separate authorized operation
with a documented DNS/hosting rollback owner.

## Acceptance-test specification for subsequent implementation

These are required automated cases, not executed backend tests. Implement them
against real Supabase/Postgres and browser flows when their issue lands.

| ID | Test setup/action | Required assertion |
|---|---|---|
| INV-01 | Anonymous client attempts direct registration and private queries | No active member/account enrollment outside the controlled path; no private rows returned. |
| INV-02 | Redeem malformed, unknown, expired, or revoked token | No membership; neutral response; no token logged. |
| INV-03 | Valid token with wrong/unverified email | No activation or private access. |
| INV-04 | Two parallel redemptions followed by replay | Exactly one active membership; replay denied; no duplicated account/grant. |
| INV-05 | Provisioning fails between Auth and member creation; retry | Consistent recoverable state; no access until completion; retry idempotent. |
| INV-06 | Scanner GET visits invite link | Token remains usable; no state change; no token referrer exposure. |
| AUTH-01 | User A queries/edits B; removed member queries former group | Reads and writes denied via direct database/API routes, not just hidden UI. |
| AUTH-02 | Ordinary member changes role/status or approves own request | Denied; no privilege change. |
| PRIV-01 | Alternate A/B authenticated SSR requests and log inspection | No cached cross-user data; logs exclude content, emails, and tokens. |
| MOD-01 | Member reports content; reported member reads report | Reporter sees status; reported member cannot identify reporter or read case. |
| MOD-02 | Scoped moderator removes post in own and another group | Own authorized action audited; other-group action denied; ordinary reads hide removed content. |
| MOD-03 | Blocked member reacts/comments through direct API | Defined block policy enforced; bypass denied; accessible feedback. |
| DEL-01 | Member requests removal, then reuses sessions and queued links | Private access immediately denied; jobs/invitations cancelled; repeated removal safe. |
| DEL-02 | Export/delete fixtures with mixed ownership | Export excludes others' private data; scoped deletion and disclosed retained records verified. |

Add manual keyboard/screen-reader review and WCAG 2.2 AA checks to automated
accessibility tests. Staging evidence records commit, configuration, migrations,
actual pass/fail/skip counts, known defects, moderator readiness, and rollback
reference. Do not deploy a feature with unresolved authorization/privacy defects.

## Delivery sequence and acceptance of this ADR

1. Issue #1: proposed ADR, current inventory, trust boundaries and migration/
   rollback design. Preserve `index.html`, `CNAME`, and lockfile byte-for-byte.
2. Review/approve ADR; inspect the supplied Figma file, record its approved version,
   and confirm actual hosting settings.
3. Tooling/environment issue: protected development/staging workflow, CI, isolated
   projects and runnable tests. No production release.
4. Invitation/Auth/RLS issue, then moderated groups/content, then privacy/removal.
   One issue per PR with acceptance criteria and staging validation.

Issue #1 is not complete until a maintainer approves this ADR. Figma fidelity,
real CI execution, applied schema, backend security tests, and staging deployment
are explicitly not claimed by this architecture-only change.
