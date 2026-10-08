# HavenForward Learning review prototype

Based on [issue #11](https://github.com/80Kane/haven/issues/11).
Open `index.html` directly in a browser, or serve this directory as a static page.
No dependencies or account setup required. It is separate from the production entry point.

Start with Learning library. Use the preview-role selector to explore public,
member, institution, contributor, publisher and license-manager experiences.
In Course creator, edit metadata, add/remove/reorder modules and lessons, save
the sample draft locally, request simulated review or export draft JSON.
Upload media only checks locally selected sample files; no bytes are uploaded.
Institutional releases validates a sample agreement's dates; it creates no license.

Only draft metadata is persisted, under `haven-learning-design-v1`. Reset it from
Content studio or clear that browser storage item. Do not use real member data.

Run reference-policy tests:

```sh
node --test design/learning/access-policy.test.mjs
```

These tests exercise a trusted-input decision model. Production identity checks,
RLS, signed uploads, provider playback and privacy workflows are not implemented.
See [implementation plan](../../docs/learning/implementation-plan.md) for the schema,
API contracts, permissions, staged backlog, operational guide and production gates.

[Editable Figma screens](https://www.figma.com/design/UEV0kB2dXWVNsiilzH8IBz?node-id=17-335)
use nodes `17:335`, `17:438`, `17:504`, `17:593`, `17:684`, `17:745`, `17:828`.
