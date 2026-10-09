# Environment inventory — issue #1

Observed 2026-10-08. Metadata and presence only; no credential values recorded.

## Current instance and saved cloud configuration

* Existing checkout: `/workspace/haven`; baseline main SHA
  `8eaaeb467b0a03d1ca5d75be508cbda2e79777b3`.
* Static runtime: Python HTTP server; Chromium/Python Playwright available for
  local smoke checks. Node/npm are available but the baseline has no installable
  package manifest. No app services are needed for the current page.
* Saved startup instructions describe static serving and existing prototype bugs.
  No saved installation script, app secret requirements, or runtime variables.
* Restricted egress with package-manager/GitHub presets; no custom allowlist
  rules. `github.com` web/Git access works. `api.github.com` calls return proxy
  denial, so GitHub API/PR creation and settings verification are not established.
* `GH_TOKEN` is present; `GITHUB_TOKEN` absent. Native Git read works through
  existing platform authentication. Token presence does not prove API scope.
* Supabase URL/public key/service-role names checked: absent. `DATABASE_URL`,
  SMTP host/user/password, `RESEND_API_KEY`, and `VERCEL_TOKEN`: absent.
  No application credentials are needed for this documentation PR.

This inventory describes this machine and bound cloud metadata, not repository
Actions secrets, hosting-provider settings, or production credentials.

## Future configuration requirements

Provision environment-specific Supabase project URLs and public publishable keys
(public configuration), with privileged Supabase credentials and database URLs
restricted to trusted server/migration jobs. Add mail-provider credentials only
when invite delivery is implemented. Use supported secure environment settings;
never commit values or paste secrets into issue/PR/chat content.

Before activation, inventory actual provider destinations and permit only those
needed. GitHub API requires `api.github.com`; Supabase uses selected project and
Auth endpoints; email and deployment destinations depend on chosen providers.
Do not invent project hostnames, reuse production credentials in staging, or
require unrelated credentials merely to populate an environment file.

## Outstanding external evidence

* Figma pilot supplied: `UEV0kB2dXWVNsiilzH8IBz`, root node `0:1`.
  `www.figma.com` is currently blocked by proxy policy; file contents and approved
  version have not been inspected.
* Pages build/source, DNS/TLS/domain ownership, deployed headers.
* Repository branch rules, GitHub Environment reviewers, CI/deployment triggers.
* Approved staging/production providers, regions, backup capabilities, moderation
  ownership, consent/age policy, and retention requirements.

No production configuration was changed during this inventory.
