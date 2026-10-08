# HavenForward public website

A static public landing page for the invitation-only peer-support pilot. Member
enrollment, email-interest collection, and persistent Hug reactions are not
active. No member or email data is collected by application code. The public
site does not require secrets or a backend.

## Development and checks

Use Node 22 or 24. Each cloud task is isolated; use the existing checkout rather
than creating a worktree unless specifically requested.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm start
```

In the prepared cloud machine, reuse system Chromium with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check`. If the npm
cache location is unwritable, pass `--cache /tmp/haven-npm-cache` to installation.
`npm start` serves `dist/` after the build. No secrets belong in HTML, JavaScript,
Git, tests, or public feedback. `.env*` is ignored.

Content lives in the HTML pages; shared styles/scripts are in `assets/`. Resource
metadata in `data/resources.json` must be kept consistent with the public resource
cards. `lastVerified: null` means verification is outstanding, not that a provider
has confirmed eligibility or availability. Do not infer partnership from a link.

## Deployment

Observed GitHub Pages configuration: legacy publishing from `main`, repository
root, custom domain `havenforward.com`. Preserve `CNAME`. Merging a public-site PR
into main can deploy production; do so only after the release review and tests.
The observed GitHub Pages production source is main. A connected Cloudflare Pages integration also creates branch previews; its production branch and custom-domain binding must be verified separately.

Cloudflare response-header rules are in `_headers`; GitHub Pages ignores them.

The CI workflow validates and builds an allowlisted `dist/` artifact without
secrets. It does not change DNS or enable private services. Pages currently
publishes the repository root; a future reviewed switch to artifact-based Pages
deployment can restrict the publish surface. Build artifacts exclude repository
metadata, tests, environment files, and dependencies.

For a staging content preview use the isolated local build or a separately
authorized static host. A CI artifact is not proof of a running staging service.
See [release documentation](docs/public-release.md) for acceptance, hosting
limitations, deployment evidence, and rollback.
