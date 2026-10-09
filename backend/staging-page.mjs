// This public Site key is not a credential. Preview scope is intentionally fixed.
export const stagingOrigin =
  "https://feat-public-interactions-bac.haven-77v.pages.dev";
export const stagingSiteKey = "0x4AAAAAAFRxDw6rDpsxwBGl";
export const stagingHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; font-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
};
export function stagingDocument() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Try public interactions | HavenForward staging</title>
    <link rel="stylesheet" href="/assets/styles.css" />
    <link rel="stylesheet" href="/assets/interactions.css" />
    <script src="/assets/interactions.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">HavenForward</a
        ><span class="preview-label">Staging only</span>
      </div>
    </header>
    <main
      id="main"
      tabindex="-1"
      class="container interaction-page"
      data-site-key="${stagingSiteKey}"
    >
      <p class="eyebrow">A small gesture. A thoughtful beginning.</p>
      <h1>You Are Not Alone.</h1>
      <p class="interaction-intro">
        Try a gesture of support or choose to receive email updates. This
        development preview does not offer community accounts or member
        conversations.
      </p>
      <p class="staging-notice">
        Testing preview: use only an inbox you own and intend to test. These
        interactions use the development database. Do not submit personal
        stories or someone else’s address.
      </p>
      <p id="javascript-note">
        JavaScript is needed for verification and submission. You can still
        <a href="/resources.html">browse support resources</a>.
      </p>
      <p id="service-status" role="status" aria-live="polite">
        Checking service availability…
      </p>
      <div class="interaction-grid">
        <section class="interaction-card" aria-labelledby="hug-heading">
          <h2 id="hug-heading">Send a Hug</h2>
          <p>
            A simple, anonymous gesture of support. The number below counts
            gestures, not members or outcomes.
          </p>
          <p class="hug-total">
            <span id="hug-count">—</span> <span>Hugs shared</span>
          </p>
          <p>
            Limited to one gesture per network per UTC day. People sharing Wi-Fi
            may share this limit.
          </p>
          <form id="hugs-form" action="/api/public/hugs" method="post">
            <fieldset disabled>
              <legend>Share a gesture of support</legend>
              <button
                class="button button-outline verification-button"
                type="button"
                data-action="hugs"
              >
                Prepare Hug verification
              </button>
              <div
                id="hugs-challenge"
                class="challenge"
                role="group"
                aria-label="Hug verification"
              ></div>
              <button
                id="hugs-submit"
                class="button button-teal"
                type="submit"
                disabled
              >
                Send a Hug
              </button>
            </fieldset>
          </form>
          <p
            id="hugs-status"
            class="interaction-status"
            role="status"
            aria-live="polite"
          ></p>
        </section>
        <section class="interaction-card" aria-labelledby="interest-heading">
          <h2 id="interest-heading">Choose email updates</h2>
          <p>
            Receive HavenForward project updates. This is an interest request,
            not an invitation or membership application.
          </p>
          <form id="interest-form" action="/api/public/interest" method="post">
            <fieldset disabled>
              <legend>Email updates with your consent</legend>
              <label for="interest-email">Email address</label
              ><input
                id="interest-email"
                name="email"
                type="email"
                autocomplete="email"
                maxlength="254"
                required
                aria-describedby="email-help"
              />
              <p id="email-help">
                Use an inbox you control. No recovery or health details are
                requested.
              </p>
              <label class="consent-label" for="interest-consent"
                ><input
                  id="interest-consent"
                  name="consent"
                  type="checkbox"
                  required
                /><span
                  >I choose to receive HavenForward email updates. I can
                  unsubscribe at any time. This does not grant community
                  membership.</span
                ></label
              ><button
                class="button button-outline verification-button"
                type="button"
                data-action="interest"
              >
                Prepare email verification
              </button>
              <div
                id="interest-challenge"
                class="challenge"
                role="group"
                aria-label="Email signup verification"
              ></div>
              <button
                id="interest-submit"
                class="button button-teal"
                type="submit"
                disabled
              >
                Request confirmation email
              </button>
            </fieldset>
          </form>
          <p
            id="interest-status"
            class="interaction-status"
            role="status"
            aria-live="polite"
          ></p>
        </section>
      </div>
      <section class="interaction-privacy" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Your choice and your data</h2>
        <p>
          Choosing “Prepare verification” contacts Cloudflare Turnstile.
          Cloudflare processes verification information; the application sends
          its network address to the verification service. Hug submissions store
          an aggregate and a short-lived keyed hash for abuse prevention, not
          your name or raw IP address in the application tables.
        </p>
        <p>
          If you request updates, your email address and consent version are
          stored privately in Supabase and sent to Resend for delivery.
          Confirmation and unsubscribe tokens are stored as hashes. The
          confirmation link expires after 24 hours; visiting it alone does not
          confirm your choice. Use the button on the confirmation page. Your
          unsubscribe link removes the signup record, including an unconfirmed
          request. Providers, access logs, and backups may retain separate
          records.
        </p>
        <p>
          This is a controlled test, not public email enrollment. Pending-record
          cleanup, production retention and backup handling still need release
          validation. Use the unsubscribe link to remove test signups. If no
          email arrives, the neutral response does not prove successful
          delivery.
        </p>
        <p>
          We don’t store your email, tokens or challenge answers in browser
          storage. Signup attempts are limited to five per network per clock
          hour. Shared connections may share a limit.
        </p>
        <p>
          <a href="/guidelines.html">Community principles</a> ·
          <a href="/resources.html">Support resources</a>
        </p>
      </section>
    </main>
  </body>
</html>
`;
}
export function handleStagingPage(request, env) {
  const url = new URL(request.url);
  if (
    url.origin !== stagingOrigin ||
    env.APP_ORIGIN !== stagingOrigin ||
    env.PUBLIC_INTERACTIONS_ENABLED !== "true" ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_SECRET_KEY ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.ACTOR_HASH_SECRET ||
    env.ACTOR_HASH_SECRET.length < 32 ||
    !env.RESEND_API_KEY ||
    !env.EMAIL_FROM
  )
    return new Response("This staging page is unavailable.", {
      status: 404,
      headers: {
        ...stagingHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...stagingHeaders, Allow: "GET, HEAD" },
    });
  return new Response(request.method === "HEAD" ? null : stagingDocument(), {
    headers: stagingHeaders,
  });
}
