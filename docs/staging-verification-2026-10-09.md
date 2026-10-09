# Public interactions: staging verification and next work

Recorded October 9, 2026. Times below are America/Chicago unless marked UTC.
Scope: public Hugs and email interest in the private development preview.
This record does not approve production activation or private-member enrollment.

## Evidence and provenance

The owner operated Cloudflare, Resend, Supabase and an owned test inbox during
the guided checks. Results below distinguish owner observations, supplied
runtime logs/screenshots and GitHub CI. The agent did not independently access
the authenticated staging browser, inbox or cloud database. Do not attach raw
request logs, addresses, network identifiers, tokens or keys to this record.

Repository and deployment references:

- [PR #13](https://github.com/80Kane/haven/pull/13): public backend and staging UI,
  merged into main as `be2b531d35448ce63227d7520c3116b748a1981b`.
- [PR #14](https://github.com/80Kane/haven/pull/14): CAPTCHA loading retry fix.
- [PR #15](https://github.com/80Kane/haven/pull/15): consent form origin fix.
- [PR #16](https://github.com/80Kane/haven/pull/16): empty cleanup RPC response fix.
- Final checked feature revision: `8948a7009fcf4f5b747603061b81b73031c781a9`.
- Stable preview: https://feat-public-interactions-bac.haven-77v.pages.dev/staging-interactions.
- Cloudflare's PR #13 deployment comment reports successful preview
  `ff018038.haven-77v.pages.dev` for that feature revision. Later owner-triggered
  redeployments applied Preview sender changes; their exact deployment IDs were
  not independently matched to the supplied runtime script-version IDs.
- [CI run 37960090367](https://github.com/80Kane/haven/actions/runs/37960090367)
  passed on that feature revision: 19 Node tests, 27 Chromium browser tests,
  21 backend tests using isolated PostgreSQL 17; build and formatting passed;
  npm audit reported zero vulnerabilities. Provider fixtures are fake.
  Both new native consent-form browser regressions passed in this run.

## Completed live staging checks

| Check                        | Evidence                                                                                                                                 | Result                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Email delivery               | Owner received the initial confirmation email                                                                                            | Passed                                                                     |
| Confirmation                 | Supabase screenshot showed confirmed_at at 16:13:01 UTC (11:13:01 AM Central)                                                            | Passed                                                                     |
| Confirmation replay          | Subsequent POST returned 400 with invalid/expired/already-used message; existing confirmation timestamp established prior success        | Passed                                                                     |
| Native form origin           | Supplied mobile POST log changed from null/403 to the exact preview Origin; Referer contained only the origin                            | Passed                                                                     |
| Unsubscribe                  | Response reported removal; owner refreshed Supabase and confirmed the row was gone                                                       | Passed                                                                     |
| Failed-send cleanup          | Temporary invalid Preview sender produced email_delivery, no pending_cleanup; owner confirmed the interests table was empty before retry | Passed                                                                     |
| Sender restoration and retry | Owner restored the verified sender, redeployed, retried; Resend returned 200 and reported Delivered; a new interest row appeared         | Passed for provider delivery; owner initially reported no inbox appearance |
| Hug persistence              | Owner refreshed and confirmed aggregate remained 2                                                                                       | Passed                                                                     |
| Hug duplicate limit          | Fresh verification followed by another attempt returned the daily-network-limit message; aggregate stayed 2                              | Passed                                                                     |
| Production flag              | Owner confirmed PUBLIC_INTERACTIONS_ENABLED=false; provided Production screenshot also showed false                                      | Confirmed setting at time of review; live endpoint behavior not checked    |

The failed-send test used a deliberately invalid sender only in Preview. The
successful retry request showed the verified havenforward.com sender restored.
No intentional production failure test was performed. Do not repeat delivery
tests merely to obtain screenshots. Email interest never creates member access.

## Remaining public release requirements

| Requirement                      | Current status and completion evidence                                                                                                                                                    | Responsible party                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Scheduled maintenance            | SQL cleanup function exists; trusted hourly scheduling and successful execution are unverified                                                                                            | Hosting/database administrator + Codex |
| Production environment isolation | Production interactions disabled; separate production database, secrets, origin, verified sender and widget scope still need verification before activation                               | Administrator + Codex                  |
| Privacy and retention            | Public privacy copy currently describes the static site; define confirmed-list retention, contact, vendor/runtime log retention and backup deletion, then match copy to actual collection | Tim + Codex                            |
| Remaining abuse/token cases      | CI covers expiry, throttling, permissions and CAPTCHA mismatch; live expired-token, rate-limit, token reuse and action/hostname rejection checks remain unverified                        | Codex + administrator                  |
| Preview Access policy            | Owner signed in through Access; allowlist and policy configuration review remain unverified                                                                                               | Administrator                          |
| Accessibility                    | Automated checks passed; manual keyboard, screen-reader and real challenge review remain pending                                                                                          | Tim + Codex                            |
| Production host and rollback     | Historical hosting observations do not establish today's deployed production revision; verify host, HTTPS, headers, disabled endpoint behavior and rollback procedure                     | Codex + administrator                  |
| Release decision                 | Review the completed evidence and all remaining requirements before activating public collection                                                                                          | Tim                                    |

Keep production interactions disabled while these requirements are unresolved.
Issues #1-#8 remain open: the completed public checks do not satisfy private
member security, privacy, moderation, directory or pilot acceptance criteria.

## Next engineering work package: protected member foundation

Track implementation under [#1](https://github.com/80Kane/haven/issues/1),
[#2](https://github.com/80Kane/haven/issues/2),
[#3](https://github.com/80Kane/haven/issues/3),
[#4](https://github.com/80Kane/haven/issues/4) and
[#8](https://github.com/80Kane/haven/issues/8).
Review architecture [PR #10](https://github.com/80Kane/haven/pull/10) before
choosing framework, session and hosting implementation details.

| Order | Deliverable                           | Acceptance criteria                                                                                                                                                   |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Architecture and environment decision | Record hosting/session design, staging/production separation, migrations and rollback; confirm Supabase open signup is disabled                                       |
| 2     | Invitation records and issuance       | Staff-only issuance; hashed single-use tokens; expiry/revocation; intended-email binding; minimized audit records; rate limits                                        |
| 3     | Redemption and verified sign-in       | Scanner GET cannot enroll; atomic redemption prevents concurrent reuse; intended verified email required; email-interest subscribers gain no membership automatically |
| 4     | Sessions and account lifecycle        | Sign-in, logout, recovery, suspension and removal tested; revoked/suspended users cannot retain protected access                                                      |
| 5     | Roles and data permissions            | Members cannot grant roles; staff MFA enforced for privileged operations; direct API and cross-account attempts fail; secrets remain server-only                      |
| 6     | Private entry screen                  | Minimal approved-member page behind server authorization; explicit pending/denied states; mobile and accessible flows                                                 |
| 7     | Integrated staging review             | Synthetic accounts only; invite expiry/replay/revocation, concurrency, recovery, role escalation, removal and rollback tested; record results before real invitations |

Public-release follow-ups may continue alongside this work. Haven Learning
[#11](https://github.com/80Kane/haven/issues/11) and community
[#5](https://github.com/80Kane/haven/issues/5)/[#6](https://github.com/80Kane/haven/issues/6)
depend on the protected member foundation. No account, upload, course or
discussion functionality is implied by this plan.
