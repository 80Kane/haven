# Deployment verification — public release candidate

> Historical October 8 snapshot. For October 9 public-interaction staging results,
> current repository revisions and remaining verification requirements, see
> [the dated staging record](staging-verification-2026-10-09.md).
> The hosting observations below have not been revalidated as current production
> deployment evidence.

Date: October 8, 2026. Scope: static public site only.

## Current production evidence

GitHub Pages provider API reports a successful existing build of baseline commit
`8eaaeb467b0a03d1ca5d75be508cbda2e79777b3`, served from main `/`, with custom domain
`havenforward.com`. This is the old site, not this release candidate.
HTTPS enforcement is false; the API returns no certificate metadata. Do not
infer a missing or invalid live certificate solely from a null metadata field.

Public URL: https://havenforward.com. A verified HTTPS request now succeeds and
returns the old title, `Haven – You Are Not Alone`. Public DNS returns Cloudflare
addresses `104.21.17.14` and `172.67.218.242`. Cloudflare is the public edge; DNS
alone does not identify its origin. DNS-health and branch-protection API access
remain limited by integration permissions.

The Cloudflare preview at
`https://feat-public-landing-release.haven-77v.pages.dev/` serves the new site.
All 14 browser tests passed against the actual deployed preview: 0 failures/skips.
CSP, no-referrer, and nosniff headers are present. Private/backend routes return
404 without member data. Initial remote tests failed because the managed
Chromium trust store lacked the current environment proxy CA; registering the
provided CA and using the supported proxy route resolved the tooling failure.
TLS verification remained enabled throughout successful validation.

Both GitHub CI checks and the Cloudflare deployment check passed for `1181954`.
Production release remains pending owner review/approval; a successful preview
is not a production deployment. Future commits must pass the same checks.

## Release candidate checks

Executed locally against the built static artifact:

- 5 Node tests passed; 0 failed/skipped. Coverage includes public link/fragment
  integrity, first-party asset/CSP structure, resource metadata consistency,
  absence of invented engagement/activated enrollment, and unchanged domain.
- 14 Chromium/Playwright tests passed; 0 failed/skipped. Coverage includes
  navigation and browser errors, five automated WCAG page checks, 320/390/768/1440
  layouts, resource filtering/empty states, keyboard/reduced motion, no-JavaScript
  fallback, and inaccessible private/backend paths (404 with no member data).
- npm dependency audit found 0 vulnerabilities.
- Desktop and mobile full-page renders were visually inspected.

Automated accessibility checks had no violations for the configured WCAG tags.
This is not a full manual WCAG conformance certification. Browser tests check the
static release, not future member-service authentication or database permissions.

## Explicitly unrun/unavailable checks

- Email submissions saved in production: unrun; no collection backend/provider
  is configured and no signup form is exposed.
- Persistent Hug counts: unrun; no database/backend is configured and no Hug
  counter is exposed.
- Pilot invite/Auth/RLS/moderation/removal tests: not implemented by this public
  release. Private services remain closed.
- Figma fidelity: unverified; file URL is known but access is blocked.
- Production deployment/smoke: pending reviewed PR release; domain access is now working.

Do not call this candidate deployed or the member pilot ready based on local
tests. Record the actual merged commit, Pages build result, HTTPS request, and
production smoke results when the release is authorized and reachable.
