# Deployment verification — public release candidate

Date: October 8, 2026. Scope: static public site only.

## Current production evidence

GitHub Pages provider API reports a successful existing build of baseline commit
`8eaaeb467b0a03d1ca5d75be508cbda2e79777b3`, served from main `/`, with custom domain
`havenforward.com`. This is the old site, not this release candidate.
HTTPS enforcement is false; the API returns no certificate metadata. Do not
infer a missing or invalid live certificate solely from a null metadata field.

Public URL: https://havenforward.com. This machine initially received a proxy
403 for that URL and could not resolve domain addresses. DNS health and branch
protection APIs return insufficient integration permissions. Production browser
smoke tests, DNS correctness, TLS certificate validity, and host headers are
therefore unverified. Required domain additions are saved as an environment
configuration draft, not assumed applied to the running machine.

The feature branch also triggered a successful Cloudflare Pages preview.
Both GitHub CI runs passed for initial release commit `e365ac8`; Cloudflare's
check reported a successful deployment of that same revision. The stable preview
is `https://feat-public-landing-release.haven-77v.pages.dev/`. Direct requests to
the preview and DNS-over-HTTPS were blocked by proxy policy, so a successful
provider check is not claimed as a completed staging browser smoke test.
Cloudflare's presence means GitHub Pages settings alone cannot establish the
production domain's actual serving provider. This must be verified before release.

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
- Production deployment/smoke: pending reviewed PR release and domain access.

Do not call this candidate deployed or the member pilot ready based on local
tests. Record the actual merged commit, Pages build result, HTTPS request, and
production smoke results when the release is authorized and reachable.
