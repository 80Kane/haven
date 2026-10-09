import test from "node:test";
import assert from "node:assert/strict";
import {
  handleStagingPage,
  stagingOrigin,
  stagingSiteKey,
} from "../backend/staging-page.mjs";
const env = {
  APP_ORIGIN: stagingOrigin,
  PUBLIC_INTERACTIONS_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "server-only-fixture",
  TURNSTILE_SECRET_KEY: "challenge-secret-fixture",
  ACTOR_HASH_SECRET: "local-only-fixture-secret-with-32-chars",
  RESEND_API_KEY: "mail-secret-fixture",
  EMAIL_FROM: "sender@example.test",
};
test("staging form is unavailable on production, other previews and a misconfigured origin", async () => {
  for (const origin of [
    "https://havenforward.com",
    "https://haven-77v.pages.dev",
    "https://other.haven-77v.pages.dev",
  ]) {
    const response = handleStagingPage(
      new Request(origin + "/staging-interactions"),
      { ...env, APP_ORIGIN: origin },
    );
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /<form|sb_secret|data-site-key/);
  }
  assert.equal(
    handleStagingPage(new Request(stagingOrigin + "/staging-interactions"), {
      ...env,
      APP_ORIGIN: "https://other.example",
    }).status,
    404,
  );
});
test("disabled or incomplete staging bindings never serve functional forms", () => {
  for (const key of Object.keys(env)) {
    assert.equal(
      handleStagingPage(new Request(stagingOrigin + "/staging-interactions"), {
        ...env,
        [key]: "",
      }).status,
      404,
      key,
    );
  }
  assert.equal(
    handleStagingPage(new Request(stagingOrigin + "/staging-interactions"), {
      ...env,
      PUBLIC_INTERACTIONS_ENABLED: "false",
    }).status,
    404,
  );
});
test("staging HTML includes only public configuration, explicit consent and scoped CAPTCHA CSP", async () => {
  const response = handleStagingPage(
    new Request(stagingOrigin + "/staging-interactions"),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(
    response.headers.get("Content-Security-Policy"),
    /frame-src https:\/\/challenges.cloudflare.com/,
  );
  const html = await response.text();
  assert.ok(html.includes(stagingSiteKey));
  assert.match(html, /type="checkbox"\s+required/);
  assert.match(html, /not an invitation/);
  assert.doesNotMatch(html, /\son\w+=|localStorage|sessionStorage/);
  for (const key of [
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SECRET_KEY",
    "ACTOR_HASH_SECRET",
    "RESEND_API_KEY",
  ])
    assert.ok(!html.includes(env[key]), key);
});
test("HEAD returns headers only; unsupported methods cannot submit on the page route", async () => {
  const head = handleStagingPage(
    new Request(stagingOrigin + "/staging-interactions", { method: "HEAD" }),
    env,
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = handleStagingPage(
    new Request(stagingOrigin + "/staging-interactions", { method: "POST" }),
    env,
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD");
});
