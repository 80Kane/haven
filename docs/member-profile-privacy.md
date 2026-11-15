# Member profile and privacy settings

The approved pilot defaults are in pilot-product-defaults.md. This change adds
`/member/settings` and its same-origin, bounded form POST `/member/settings/save`.
Both entry and save require current verified identity and active membership.
No user ID, role, or account status is accepted from the form.

## Profile choices

- A unique lowercase handle (3–24 characters; letters, numbers, underscores,
  starting with a letter) is chosen once and stays stable during this pilot.
- Display names are pseudonymous, may be shared, and contain 2–40 characters.
  Control characters and reserved staff labels are rejected. Changing a name
  starts a seven-day cooldown; updating privacy preferences does not restart it.
- Directory listing and private Hug notifications start off. Their future
  behavior is explained beside the checkboxes. Neither feature is activated
  by this screen. Withdrawing these preferences remains allowed at the update
  limit and during the name cooldown.

Profiles and minimal action-only profile events live in the unexposed
haven_members schema. Client roles have no direct table access. Public RPC
wrappers run as the caller; private functions check the current identity,
configuration switch, and active member status. Saves use the same transaction
lock as membership changes. No directory or cross-account profile endpoint is
provided. Handles are unique at the database boundary; collisions roll back the
profile and audit writes. No previous names or email addresses enter the profile
event table.

## Verification and deployment

1. Run the full CI workflow, including the real PostgreSQL profile tests and
   browser save/reload/privacy-withdrawal checks.
2. Review and apply `20261115052244_member_profiles.sql` only to the isolated
   member staging database before deploying the UI. This additive migration
   leaves existing profiles unset and does not change Auth configuration.
3. Recheck database advisors and own/cross-account access. Keep haven_members
   out of the Data API exposed schemas.
4. Merge and deploy the reviewed member-app code through the protected Vercel
   project. Use synthetic accounts to verify settings and reload persistence.

If rolling back the UI, deploy the previous member-app commit and retain the
private tables and saved preferences. Do not delete profile data as part of a
routine application rollback.
