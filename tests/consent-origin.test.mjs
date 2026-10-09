import test from "node:test";
import assert from "node:assert/strict";
import { handlePublicApi, hash } from "../backend/public-api.mjs";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "fixture-only",
  APP_ORIGIN: "https://stage.example",
};
const token = "a".repeat(64);

for (const action of ["confirm", "unsubscribe"]) {
  test(`${action} page preserves origin without sending token referrers; GET never mutates`, async () => {
    const response = await handlePublicApi(
      new Request(`${env.APP_ORIGIN}/api/public/${action}?token=${token}`),
      env,
      { fetch: () => assert.fail("GET must not call the database") },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Referrer-Policy"), "strict-origin");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(
      response.headers.get("Content-Security-Policy"),
      /form-action 'self'/,
    );
    assert.match(await response.text(), /method="post"/);
  });

  test(`${action} rejects null, absent and foreign origins before database access`, async () => {
    for (const origin of ["null", undefined, "https://attacker.test"]) {
      const response = await handlePublicApi(
        new Request(`${env.APP_ORIGIN}/api/public/${action}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...(origin === undefined ? {} : { Origin: origin }),
          },
          body: new URLSearchParams({ token }),
        }),
        env,
        { fetch: () => assert.fail("Rejected origin must not reach database") },
      );
      assert.equal(response.status, 403);
    }
  });

  test(`${action} accepts same-origin form POST and sends only a token hash`, async () => {
    let calls = 0;
    const response = await handlePublicApi(
      new Request(`${env.APP_ORIGIN}/api/public/${action}`, {
        method: "POST",
        headers: {
          Origin: env.APP_ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
      }),
      env,
      {
        fetch: async (url, options) => {
          calls++;
          assert.equal(
            url,
            `${env.SUPABASE_URL}/rest/v1/rpc/haven_${action}_interest`,
          );
          assert.deepEqual(JSON.parse(options.body), {
            p_token_hash: await hash(token),
          });
          return Response.json({ confirmed: true });
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  });
}
