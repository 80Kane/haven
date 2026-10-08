# Public landing-page release

## Scope and acceptance

This focused release replaces unverified statistics, testimonials, affiliations,
encrypted-journal and live-responder claims with accurate pilot information. It
adds person-centered messaging, seven proposed circles, responsive navigation,
resources with local filters, public-site privacy and safety pages, and real call
and text crisis links. Email/Hug/member services stay closed, without fake forms,
counts, success messages, or unprotected conversation routes.

Acceptance: all local links/fragments resolve; browser console is clean; keyboard
menu/skip link work; 320/390/768/1440 layouts have no overflow; automated WCAG tags
report no violations; resource filtering handles empty/input cases locally;
missing/private/API paths return 404; dependencies have no high-severity audit
findings. Manual assistive-technology review remains necessary for full WCAG
conformance; automated checks alone do not certify accessibility.

## Hosting and access observations

GitHub Pages API reports legacy publishing from main `/`, domain
`havenforward.com`, status built, HTTPS enforcement false. Access to Pages DNS
health and branch-protection APIs returns `Resource not accessible by integration`.
Production-domain HTTP access and DNS resolution were initially blocked from this
machine. These are verification/access limitations, not proof that the domain is
broken. Only a production request and deployed-revision check establishes release.

The feature-branch checks also expose an existing Cloudflare Pages integration
and successful preview deployment at `feat-public-landing-release.haven-77v.pages.dev`.
This does not prove which provider currently serves the custom domain. A direct
preview request and DNS-over-HTTPS request were blocked by proxy policy.

Cloudflare Pages supports the included `_headers` rules for CSP (including
frame-ancestors), no-referrer, MIME protection, framing denial, and restricted
browser capabilities. GitHub Pages ignores that file and cannot configure those
headers here. The first-party assets and meta CSP remain a fallback. HSTS is not
added before domain HTTPS is verified. Do not weaken TLS verification for tests.

Figma pilot: file `UEV0kB2dXWVNsiilzH8IBz`; supplied URL was blocked by proxy policy.
This release follows the requested brand palette, not a claimed inspected Figma
implementation. Direct Figma review remains pending.

## Backend activation blockers and release boundaries

No Supabase/database or email-provider configuration is present. Persistent Hug
counts and saved email-interest submissions require a separate reviewed backend
release: isolated staging/production, atomic counts/idempotency, rate limiting,
trusted client-abuse controls, confirmed email consent, double opt-in,
unsubscribe/deletion, neutral errors, privacy notices, and storage/auth tests.
Client-only counters, browser storage, public spreadsheets, or unvalidated web
hooks are not acceptable substitutes. A public interest list must not grant member
access. Do not collect addresses before a responsible private contact channel,
retention terms, and provider credentials are configured.

Pilot issues #2–#6 retain their acceptance gates for invitations, verification,
roles/RLS, privacy/removal, human moderation, and private feeds. Resource issue #7
still requires provider verification and a restricted editor workflow; this
release is the searchable public directory foundation. Issue #8 still requires
member-service tests, real staging validation, manual accessibility review, and
owner readiness approval. Do not close those issues merely because public-site
tests pass. Architecture ADR #1 remains on its separate review branch.

## Deployment and rollback procedure

1. Create a focused public-site PR, review its diff, and run local and GitHub checks.
2. Use a reviewed PR merge through the existing production workflow; never force
   push or change the Pages source/domain to bypass a blocker. Observe required
   approval rules and no unreviewed deployment.
3. Wait for GitHub Pages deployment at the merged revision. Verify production
   title/assets/pages, mobile layout, links, no JS/CSP errors, and absence of active
   signup/hug/member endpoints. Record the revision and actual test outcomes.
4. If production approval or API permission is unavailable, leave the tested PR
   open and report the exact unmet release gate. Do not claim it is deployed.
5. For rollback, open a PR reverting the public-site merge, rerun checks, and
   merge with the same release review. Preserve CNAME/DNS. There is no application
   data migration in this release. Baseline is
   `8eaaeb467b0a03d1ca5d75be508cbda2e79777b3`; do not reset main or overwrite unrelated
   commits to roll back. Confirm Pages serves the rollback revision afterwards.

## Remaining backlog

1. Confirm production DNS/TLS; enable HTTPS enforcement through approved settings.
2. Inspect approved Figma frames and run manual assistive-technology review.
3. Provision isolated backend/email environments and implement tested public
   interactions in a dedicated issue/PR.
4. Verify provider resource details, record real verification dates, and implement
   a restricted editing/feedback workflow for #7.
5. Complete invite/Auth/RLS and account lifecycle (#2–#4), then staffed moderation
   (#5), private groups (#6), and pilot staging/release gates (#8).
6. Establish private contact channels, retention/deletion policy, production
   header-capable hosting where needed, backup/incident drills, and protected
   branch/deployment approvals. No unrestricted DMs in the initial pilot.
