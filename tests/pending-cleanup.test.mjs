import test from "node:test";
import assert from "node:assert/strict";
import { handlePublicApi, hash } from "../backend/public-api.mjs";

const env = {
  PUBLIC_INTERACTIONS_ENABLED: "true",
  APP_ORIGIN: "https://stage.example",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "fixture-only",
  ACTOR_HASH_SECRET: "fixture-only-network-secret-32-bytes",
  TURNSTILE_SECRET_KEY: "fixture-only",
  RESEND_API_KEY: "fixture-only",
  EMAIL_FROM: "updates@example.test",
};

// No provider calls: exercise HTTP response shapes through the actual handler.
for (const cleanupStatus of [200, 204, 503]) {
  test(`failed delivery handles empty cleanup HTTP ${cleanupStatus} and permits retry after removal`, async () => {
    let pendingHash;
    let mailFails = true;
    let sends = 0;
    let cleanupCalls = 0;
    const diagnostics = [];
    const dependencies = {
      trustedIp: () => "192.0.2.1",
      reportFailure: (code) => diagnostics.push(code),
      fetch: async (url, options) => {
        if (url.includes("siteverify"))
          return Response.json({
            success: true,
            hostname: "stage.example",
            action: "interest",
          });
        const body = JSON.parse(options.body);
        if (url.endsWith("haven_request_interest")) {
          if (pendingHash) return Response.json({ send_confirmation: false });
          pendingHash = body.p_confirmation_hash;
          return Response.json({ send_confirmation: true });
        }
        if (url === "https://api.resend.com/emails") {
          sends++;
          const token = new URL(
            body.text.match(/https:\/\/\S+\/confirm\?token=[a-f0-9]+/)[0],
          ).searchParams.get("token");
          assert.equal(await hash(token), pendingHash);
          return Response.json({}, { status: mailFails ? 503 : 200 });
        }
        assert.ok(url.endsWith("haven_cancel_pending_interest"));
        cleanupCalls++;
        assert.equal(body.p_token_hash, pendingHash);
        if (cleanupStatus < 300) pendingHash = undefined;
        return new Response(null, { status: cleanupStatus });
      },
    };
    function submit() {
      return handlePublicApi(
        new Request(`${env.APP_ORIGIN}/api/public/interest`, {
          method: "POST",
          headers: {
            Origin: env.APP_ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "test@example.test",
            consent: true,
            consentVersion: "interest-v1",
            turnstileToken: "fixture",
          }),
        }),
        env,
        dependencies,
      );
    }
    const first = await submit();
    assert.equal(first.status, 202);
    assert.equal(cleanupCalls, 1);
    assert.deepEqual(
      diagnostics,
      cleanupStatus < 300
        ? ["email_delivery"]
        : ["pending_cleanup", "email_delivery"],
    );
    assert.equal(Boolean(pendingHash), cleanupStatus >= 300);
    mailFails = false;
    const retry = await submit();
    assert.equal(retry.status, 202);
    assert.deepEqual(await retry.json(), await first.json());
    assert.equal(sends, cleanupStatus < 300 ? 2 : 1);
    assert.equal(cleanupCalls, 1);
  });
}
