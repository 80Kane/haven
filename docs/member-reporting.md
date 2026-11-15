# Private reporting foundation

## Scope

Active pilot members can submit a concern about the general pilot or one of the seven Circle previews and see their ten most recent report statuses. A report is linked to its submitting account, is not anonymous, and does not create a public post. Intake asks for a category, optional Circle, a 10–1,000 character description and an acknowledgement about administrator access and emergency limits. No attachments, target-account selectors, recipient emails or private-message delivery are added.

The first review queue is **administrator-only with MFA**, using the existing verified administrator and authenticator flow. Moderator-role accounts do not yet have review access. This deliberately avoids enabling a moderator workflow before training, permissions and MFA enrollment are established.

The queue shows the 25 oldest unresolved reports. Text is loaded only on the authorized case page. Reporter emails, account IDs and display names are not returned to the review UI. Administrators can move Received → In review → Closed with a fixed member-visible outcome. Closing is a review status, not evidence that content was removed or a member was sanctioned. Reopening, appeals, reporter replies, block/mute, sanctions and post-level reporting require later work before discussions open.

## Security and storage

- Five reports per submitting account per rolling 24 hours; repeat submissions with the same key and content return the same receipt without consuming another slot. A reused key with different content is rejected.
- Current Auth identity, active SQL membership, the overall pilot switch and an independent reporting switch are checked by private SQL functions. Review additionally checks the current SQL administrator role and `aal2`.
- Writes serialize with existing member-role/status changes. Version checks reject a stale review update. Only the two permitted transitions are accepted.
- Private `haven_members.reports` and `report_events` tables have RLS and no client table access. Public RPC wrappers use SECURITY INVOKER. Privileged work stays in the unexposed schema with explicit authenticated execution grants and independent authorization.
- Audit events record submitting/reviewing account IDs, report ID, transition, outcome and time. They do not duplicate report text. Application clients, including administrators, cannot edit or delete report text or audit events.
- Member reads return only their own minimal statuses and outcomes. No report-by-ID member endpoint exists. Queue responses omit report text. Detail reads are MFA administrator-only.
- Exact-origin, bounded URL-encoded POST forms reject unknown/duplicate fields, caller-supplied identities and query parameters. Intake accepts at most 16 KiB to accommodate international text; existing forms retain the 4 KiB default. No report text is put in URLs, browser storage, logs, emails or analytics by this implementation. React renders submitted text as text, never HTML.
- All responses retain the app's private/no-store, noindex, CSP and session protections. Provider errors map to fixed messages without report text.

## Activation gates

Both `MEMBER_REPORTING_ENABLED=true` and `haven_members.configuration.reporting_enabled=true` are required. Review also needs the existing `MEMBER_ADMIN_UI_ENABLED=true`. Defaults are false, and this change does not enable either reporting switch on a hosted environment. The migration is additive and starts disabled.

Before enabling intake for real participants, the operator must establish:

1. Named review responsibility, coverage and a clear non-emergency response process. No response time or continuous monitoring is promised in this UI.
2. A reviewed crisis escalation and incident procedure, including how confidentiality limits are explained. The report form always links to direct external support.
3. A retention, deletion/export and legal-hold policy for report text and audit records, with an actual cleanup process and updated privacy notice. **This migration does not schedule cleanup or promise automatic deletion.** Keep reporting disabled until that process is established; use synthetic data only for staging verification.
4. A supervised synthetic end-to-end test after the migration and app deployment. Confirm both switches off fail closed, staff MFA, member-only status visibility and access loss after suspension/demotion.

Apply the migration to the isolated member staging database before enabling the app flag. Never apply it to the public-interactions project. Turning either reporting switch off stops report operations without deleting evidence. Disabling reporting is the rollback; there is no destructive down migration.

## Verification

Real PostgreSQL tests cover cross-account isolation, banned/unverified/anonymous and suspended users, both switches, member/moderator/MFA denial, idempotency, the intake limit under concurrency, invalid values, direct table/audit denial, invoker wrappers, valid transitions and stale update races. Member unit/browser tests cover owner-bound parsing, identity-free RPC arguments, form boundaries, XSS escaping, member/admin navigation, fixed outcomes and phone/desktop accessibility. Existing public, membership, profile and administrator tests remain in CI.
