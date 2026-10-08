# Learning design validation

2026-10-08. Scope: review prototype, Figma screens, reference policy and implementation plan.

Executed:
- `node --test design/learning/access-policy.test.mjs`: 73 tests, 73 passed, 0 failed/skipped.
- `node --check` on the extracted prototype script: passed.
- Figma desktop catalog and mobile catalog screenshots inspected; heading reflow
  corrected. Mobile screenshot after correction passed visual review. Other screens
  structurally created with auto-layout, editable text and library instances.
- Production `index.html`, `CNAME`, and existing lockfile unchanged.

Not executed / not claimed:
- Interactive browser QA: this environment's managed preview workflow has no
  supported browser-control skill. Desktop/mobile prototype interaction and actual
  screen-reader testing remain required before integration.
- Database/RLS, Supabase authentication, provider direct uploads, processing events,
  signed playback, downloads, real license expiry and real member progress.
- Full WCAG 2.2 AA conformance or production CI/security certification.
- Production deployment, paid streaming activation, real course/media publication,
  copyright approval or institutional acceptance.

The HTML role selector is a simulation. The policy module requires trusted inputs
and is not itself an authentication boundary. Production must enforce matching
rules at server, database and delivery layers with real negative integration tests.

Review walkthrough:
1. Open `design/learning/index.html` in a browser.
2. Search for K.E.Y.S.; filter Business; open sample lesson preview.
3. Choose Public visitor: member lesson is invitation information; Content studio denied.
4. Choose Contributor: own draft editing available; Institutional releases denied.
5. Choose Publisher: add/reorder/remove modules and lessons; save and reload; export JSON.
6. Try upload with invalid/empty/over-limit video, then sample video + VTT; no network upload.
7. Choose License manager: validate dates; equal/reversed term rejected.
8. Resize to 390px; check navigation scroll, keyboard focus, form labels and catalog.
