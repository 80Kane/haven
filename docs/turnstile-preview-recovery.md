# Public interactions: next staging recovery step

The latest owner-reported live failure is `invalid-input-secret`. Cloudflare
defines this as an invalid or expired secret, requiring a dashboard check:
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

## Exact destination

- Cloudflare account: `85755e3970a9d60445f76d889af78ec1`
- Pages project: `haven`
- Environment: **Preview**
- Secret binding: `TURNSTILE_SECRET_KEY`
- Existing public widget site key: `0x4AAAAAAFRxDw6rDpsxwBGl`
- Allowed hostname: `feat-public-interactions-bac.haven-77v.pages.dev`
- Test page: https://feat-public-interactions-bac.haven-77v.pages.dev/staging-interactions
- Feature branch: `feat/public-interactions-backend`

## Administrator action

1. In Cloudflare Turnstile, open the existing widget whose public site key matches
   the one above. Confirm the hostname; preserve its clearance setting.
2. Copy that widget's current **secret key** directly into Cloudflare's secure
   Pages binding for the exact Preview destination above. The public site key,
   a Cloudflare API token and a Resend key are not the Turnstile secret.
   Do not send the key in chat, save it in source, or change Production bindings.
   Do not rotate a shared widget automatically: first check other consumers.
3. Save the binding and redeploy the latest feature-branch preview so the updated
   binding is used. A separate fix branch does not serve the origin-restricted UI;
   merge its reviewed fix into the existing feature branch before redeploying it.
4. Sign in through Cloudflare Access, load the stable test page and prepare a
   fresh Hug challenge. Submit once, refresh, and verify the saved count persists.
5. Complete another fresh challenge: the daily network limit should return the
   unchanged count. Reusing the same CAPTCHA answer should instead be rejected.

## Next verification gates

- Use an explicitly authorized owned test inbox for consented signup, delivery,
  scanner-safe GET, POST confirmation, replay and unsubscribe checks. No automated
  test messages are authorized by this document.
- Verify Access allowlist, scheduled cleanup and agreed retention/privacy copy.
- Record commit, preview URL and pass/fail evidence without secrets, addresses,
  tokens or provider response bodies.
- Keep production interactions disabled until the staging gates pass.

This workspace has no Cloudflare administrative credentials or approved Wrangler
installation. Secret replacement and authenticated live-provider checks have not
been performed. Local tests cannot establish live delivery or persistent mutations.

## Code correction in this recovery branch

Removed an undefined `error` reference from the CAPTCHA script-load failure
handler. Failure now returns normally, keeps submission disabled and permits a
fresh preparation. Added an executable runtime regression test and a browser
assertion rejecting uncaught page errors. No verification bypass was introduced.
