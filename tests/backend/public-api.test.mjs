import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { handlePublicApi, hash } from "../../backend/public-api.mjs";

// Destructive test fixtures are restricted to a named local test database.
const connection = new URL(
  process.env.TEST_DATABASE_URL ||
    "postgres://postgres:haven_local_tests_only@127.0.0.1:55432/postgres",
);
if (!["127.0.0.1", "localhost"].includes(connection.hostname))
  throw new Error("Backend tests require isolated localhost PostgreSQL.");
connection.pathname = "/postgres";
const admin = new pg.Client({ connectionString: connection.toString() });
let pool;
const env = {
  PUBLIC_INTERACTIONS_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "test-server-only",
  ACTOR_HASH_SECRET: "local-test-hmac-secret-32-bytes-minimum",
  APP_ORIGIN: "https://stage.example",
  TURNSTILE_SECRET_KEY: "test-turnstile",
  RESEND_API_KEY: "test-resend",
  EMAIL_FROM: "updates@example.test",
};
const signatures = {
  haven_hug_count: [],
  haven_send_hug: ["p_actor_hash"],
  haven_request_interest: [
    "p_actor_hash",
    "p_email",
    "p_confirmation_hash",
    "p_unsubscribe_hash",
    "p_consent_version",
  ],
  haven_confirm_interest: ["p_token_hash"],
  haven_unsubscribe_interest: ["p_token_hash"],
  haven_cancel_pending_interest: ["p_token_hash"],
};
let mail, mailFailure, captchaFailure;
before(async () => {
  await admin.connect();
  await admin.query("SELECT pg_advisory_lock(72134682)");
  for (const role of ["anon", "authenticated", "service_role"]) {
    await admin.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`,
    );
  }
  await admin.query("SELECT pg_advisory_unlock(72134682)");
  if (
    !(
      await admin.query(
        "SELECT 1 FROM pg_database WHERE datname='haven_backend_tests'",
      )
    ).rowCount
  )
    await admin.query("CREATE DATABASE haven_backend_tests");
  connection.pathname = "/haven_backend_tests";
  pool = new pg.Pool({ connectionString: connection.toString(), max: 12 });
  await pool.query("DROP SCHEMA IF EXISTS haven_public CASCADE");
  for (const [name, params] of Object.entries(signatures))
    await pool.query(
      `DROP FUNCTION IF EXISTS public.${name}(${params.map(() => "text").join(",")})`,
    );
  await pool.query(
    "DROP FUNCTION IF EXISTS public.haven_cleanup_public_interactions()",
  );
  await pool.query(
    await readFile(
      "supabase/migrations/202610080001_public_interactions.sql",
      "utf8",
    ),
  );
});
beforeEach(async () => {
  mail = [];
  mailFailure = false;
  captchaFailure = false;
  await pool.query(
    "TRUNCATE haven_public.interests,haven_public.hug_receipts,haven_public.rate_buckets",
  );
  await pool.query("UPDATE haven_public.hug_total SET total=0");
});
after(async () => {
  await pool?.end();
  await admin.end();
});
async function service(name, parameters = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    const values = signatures[name].map((key) => parameters[key]);
    const result = await client.query(
      `SELECT public.${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) AS result`,
      values,
    );
    await client.query("COMMIT");
    return result.rows[0].result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function fetchMock(url, options) {
  const body = url.includes("siteverify")
    ? Object.fromEntries(new URLSearchParams(options.body))
    : JSON.parse(options.body);
  if (url.includes("siteverify"))
    return Response.json({
      success: !captchaFailure,
      hostname: "stage.example",
      action: body.response,
    });
  if (url.includes("resend.com")) {
    if (mailFailure)
      return Response.json({ error: "provider unavailable" }, { status: 503 });
    mail.push(body);
    return Response.json({ id: "fake-message" });
  }
  const name = url.split("/").pop();
  return Response.json(await service(name, body));
}
function req(path, body, settings = {}) {
  return new Request(env.APP_ORIGIN + "/api/public/" + path, {
    method: settings.method || "POST",
    headers: {
      Origin: settings.origin || env.APP_ORIGIN,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function run(request, settings = {}) {
  return handlePublicApi(request, settings.env || env, {
    fetch: fetchMock,
    trustedIp: () => settings.ip || "192.0.2.10",
  });
}
const interest = (email = "person@example.test") => ({
  email,
  consent: true,
  consentVersion: "interest-v1",
  turnstileToken: "interest",
});
function mailedToken(action) {
  return new URL(
    mail[0].text.match(
      new RegExp(`https://[^\\s]+/${action}\\?token=[a-f0-9]+`),
    )[0],
  ).searchParams.get("token");
}

test("feature flag denies new public interactions by default", async () => {
  assert.equal(
    (
      await run(req("hugs", { turnstileToken: "hugs" }), {
        env: { ...env, PUBLIC_INTERACTIONS_ENABLED: "false" },
      })
    ).status,
    503,
  );
  assert.equal(
    (await pool.query("SELECT total FROM haven_public.hug_total")).rows[0]
      .total,
    "0",
  );
});
test("anonymous/authenticated roles cannot read private tables or call privileged functions", async () => {
  for (const role of ["anon", "authenticated"]) {
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${role}`);
      await assert.rejects(
        client.query("SELECT * FROM haven_public.interests"),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        client.query("SELECT public.haven_hug_count()"),
        (e) => e.code === "42501",
      );
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  }
});
test("server role has RPC access but cannot directly enumerate subscribers", async () => {
  assert.equal((await service("haven_hug_count")).total, 0);
  const client = await pool.connect();
  try {
    await client.query("SET ROLE service_role");
    await assert.rejects(
      client.query("SELECT email FROM haven_public.interests"),
      (e) => e.code === "42501",
    );
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
});
test("concurrent hugs from one actor persist exactly once", async () => {
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      run(req("hugs", { turnstileToken: "hugs" })),
    ),
  );
  const bodies = await Promise.all(responses.map((r) => r.json()));
  assert.equal(bodies.filter((b) => b.accepted).length, 1);
  assert.equal((await service("haven_hug_count")).total, 1);
  assert.equal(
    (await (await run(req("hugs", null, { method: "GET" }))).json()).total,
    1,
  );
});
test("different networks can hug without raw IP or identity storage", async () => {
  await run(req("hugs", { turnstileToken: "hugs" }));
  await run(req("hugs", { turnstileToken: "hugs" }), { ip: "192.0.2.11" });
  const rows = (
    await pool.query("SELECT actor_hash FROM haven_public.hug_receipts")
  ).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => /^[a-f0-9]{64}$/.test(r.actor_hash)));
});
test("failed challenge cannot change counts or subscriptions", async () => {
  captchaFailure = true;
  assert.equal(
    (await run(req("hugs", { turnstileToken: "hugs" }))).status,
    400,
  );
  assert.equal((await run(req("interest", interest()))).status, 400);
  assert.equal((await service("haven_hug_count")).total, 0);
});
test("wrong challenge action and cross-origin mutations are rejected", async () => {
  assert.equal(
    (await run(req("hugs", { turnstileToken: "interest" }))).status,
    400,
  );
  assert.equal(
    (
      await run(
        req("interest", interest(), { origin: "https://attacker.test" }),
      )
    ).status,
    403,
  );
  assert.equal(mail.length, 0);
});
test("invalid email, missing consent and oversized requests do not enroll", async () => {
  for (const body of [
    interest("invalid"),
    { ...interest(), consent: false },
    { ...interest(), email: "x".repeat(5000) },
  ]) {
    assert.equal((await run(req("interest", body))).status, 400);
  }
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    0,
  );
});
test("confirmation tokens are hashed, consent recorded, and duplicate requests are neutral", async () => {
  const first = await run(req("interest", interest()));
  const firstBody = await first.json();
  const second = await run(req("interest", interest()));
  assert.equal(second.status, 202);
  assert.deepEqual(await second.json(), firstBody);
  assert.equal(mail.length, 1);
  const row = (await pool.query("SELECT * FROM haven_public.interests"))
    .rows[0];
  assert.equal(row.confirmed_at, null);
  assert.equal(row.consent_version, "interest-v1");
  assert.equal(row.confirmation_hash, await hash(mailedToken("confirm")));
  assert.notEqual(row.confirmation_hash, mailedToken("confirm"));
  assert.match(mail[0].text, /not a community invitation/);
});
test("scanner GET does not confirm; explicit POST works once and replay fails", async () => {
  await run(req("interest", interest()));
  const token = mailedToken("confirm");
  assert.equal(
    (await run(req("confirm?token=" + token, null, { method: "GET" }))).status,
    200,
  );
  assert.equal(
    (await pool.query("SELECT confirmed_at FROM haven_public.interests"))
      .rows[0].confirmed_at,
    null,
  );
  assert.equal((await run(req("confirm", { token }))).status, 200);
  assert.equal((await run(req("confirm", { token }))).status, 400);
});
test("expired and unknown confirmation tokens fail without leaking addresses", async () => {
  await run(req("interest", interest()));
  const token = mailedToken("confirm");
  await pool.query(
    "UPDATE haven_public.interests SET expires_at=now()-interval '1 second'",
  );
  assert.equal((await run(req("confirm", { token }))).status, 400);
  const response = await run(req("confirm", { token: "a".repeat(64) }));
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes("person@example.test"));
});
test("unsubscribe GET preserves consent; POST deletes pending/confirmed data and is idempotent", async () => {
  await run(req("interest", interest()));
  const token = mailedToken("unsubscribe");
  await run(req("unsubscribe?token=" + token, null, { method: "GET" }));
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    1,
  );
  assert.equal((await run(req("unsubscribe", { token }))).status, 200);
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    0,
  );
  assert.equal((await run(req("unsubscribe", { token }))).status, 200);
});
test("database rate limits survive repeated requests and do not create extra rows", async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await run(req("interest", interest(`person${i}@example.test`)))).status,
      202,
    );
  assert.equal(
    (await run(req("interest", interest("last@example.test")))).status,
    429,
  );
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    5,
  );
});
test("provider failure rolls back pending interest so a retry can succeed", async () => {
  mailFailure = true;
  assert.equal((await run(req("interest", interest()))).status, 202);
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    0,
  );
  mailFailure = false;
  assert.equal((await run(req("interest", interest()))).status, 202);
  assert.equal(mail.length, 1);
});
test("cleanup deletes expired pending records and old pseudonymous abuse data", async () => {
  await run(req("interest", interest()));
  await pool.query(
    "UPDATE haven_public.interests SET expires_at=now()-interval '7 days'",
  );
  await pool.query(
    "INSERT INTO haven_public.hug_receipts VALUES ($1,current_date-1)",
    ["a".repeat(64)],
  );
  await pool.query("SELECT public.haven_cleanup_public_interactions()");
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    0,
  );
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.hug_receipts")).rowCount,
    0,
  );
});
test("unsubscribe stays available when new interactions are disabled", async () => {
  await run(req("interest", interest()));
  const token = mailedToken("unsubscribe");
  const disabled = {
    ...env,
    PUBLIC_INTERACTIONS_ENABLED: "false",
    TURNSTILE_SECRET_KEY: "",
    RESEND_API_KEY: "",
    ACTOR_HASH_SECRET: "",
  };
  assert.equal(
    (await run(req("unsubscribe", { token }), { env: disabled })).status,
    200,
  );
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    0,
  );
});
test("delivery outage gives identical responses for existing and new addresses", async () => {
  await run(req("interest", interest()));
  mailFailure = true;
  const existing = await run(req("interest", interest()));
  const fresh = await run(req("interest", interest("new@example.test")));
  assert.equal(existing.status, 202);
  assert.equal(fresh.status, 202);
  assert.deepEqual(await existing.json(), await fresh.json());
});
test("streamed oversized body is cancelled without database writes", async () => {
  let cancelled = false;
  let remaining = 20;
  const body = new ReadableStream({
    pull(controller) {
      if (remaining-- > 0) controller.enqueue(new Uint8Array(1024));
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(env.APP_ORIGIN + "/api/public/interest", {
    method: "POST",
    headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json" },
    body,
    duplex: "half",
  });
  assert.equal((await run(request)).status, 400);
  assert.equal(cancelled, true);
  assert.equal(
    (await pool.query("SELECT * FROM haven_public.interests")).rowCount,
    0,
  );
});

test("submission diagnostics distinguish failures without disclosing provider data", async () => {
  const privateMessage =
    "secret-key person@example.test 192.0.2.10 captcha-answer";
  const cases = [
    [
      "verification_request",
      async () => {
        throw new Error(privateMessage);
      },
    ],
    [
      "verification_http_503",
      async () => new Response(privateMessage, { status: 503 }),
    ],
    [
      "verification_http_400_invalid_input_secret",
      async () =>
        Response.json(
          {
            "error-codes": ["invalid-input-secret", privateMessage],
            debug: privateMessage,
          },
          { status: 400 },
        ),
    ],
    [
      "verification_http_403",
      async () =>
        Response.json(
          { "error-codes": [privateMessage], debug: privateMessage },
          { status: 403 },
        ),
    ],
    ["verification_response", async () => new Response(privateMessage)],
    [
      "database_haven_send_hug_http_403",
      async (url, options) =>
        url.includes("siteverify")
          ? fetchMock(url, options)
          : new Response(privateMessage, { status: 403 }),
    ],
    [
      "database_haven_send_hug_request",
      async (url, options) => {
        if (url.includes("siteverify")) return fetchMock(url, options);
        throw new Error(privateMessage);
      },
    ],
    [
      "database_haven_send_hug_response",
      async (url, options) =>
        url.includes("siteverify")
          ? fetchMock(url, options)
          : new Response(privateMessage),
    ],
  ];
  for (const [code, fetch] of cases) {
    const logs = [];
    const result = await handlePublicApi(
      req("hugs", { turnstileToken: "hugs" }),
      env,
      {
        trustedIp: () => "192.0.2.10",
        fetch,
        reportFailure: (value) => logs.push(value),
      },
    );
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), {
      error: code.startsWith("verification_http")
        ? "Verification is unavailable."
        : "Service temporarily unavailable.",
      code,
    });
    assert.deepEqual(logs, [code]);
    assert.equal(
      await service("haven_hug_count").then((value) => value.total),
      0,
    );
  }
});
test("missing trusted edge metadata fails closed even when diagnostics fail", async () => {
  const request = req("hugs", { turnstileToken: "hugs" });
  request.headers.set("CF-Connecting-IP", "192.0.2.10");
  let fetched = false;
  const result = await handlePublicApi(request, env, {
    fetch: async () => {
      fetched = true;
      throw new Error("must not fetch");
    },
    reportFailure: () => {
      throw new Error("diagnostics unavailable");
    },
  });
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), {
    error: "Abuse protection is unavailable.",
    code: "trusted_network_missing",
  });
  assert.equal(fetched, false);
});

test("canonical Turnstile verification rejects empty tokens and nonboolean success", async () => {
  let fetched = false;
  const empty = await handlePublicApi(
    req("hugs", { turnstileToken: "" }),
    env,
    {
      trustedIp: () => "192.0.2.10",
      fetch: async () => {
        fetched = true;
        throw new Error("must not fetch");
      },
    },
  );
  assert.equal(empty.status, 400);
  assert.equal(fetched, false);
  for (const success of ["true", 1, {}, true]) {
    const result = await handlePublicApi(
      req("hugs", { turnstileToken: "hugs" }),
      env,
      {
        trustedIp: () => "192.0.2.10",
        fetch: async (url, options) => {
          if (!url.includes("siteverify")) return fetchMock(url, options);
          assert.equal(
            options.headers["Content-Type"],
            "application/x-www-form-urlencoded",
          );
          assert.equal(options.body.get("secret"), env.TURNSTILE_SECRET_KEY);
          assert.equal(options.body.get("response"), "hugs");
          return Response.json({
            success,
            hostname: "stage.example",
            action: "hugs",
          });
        },
      },
    );
    assert.equal(result.status, success === true ? 200 : 400);
  }
  for (const hostname of ["localhost", "attacker.example"]) {
    const result = await handlePublicApi(
      req("hugs", { turnstileToken: "fresh" }),
      env,
      {
        trustedIp: () => "192.0.2.11",
        fetch: async () =>
          Response.json({ success: true, hostname, action: "hugs" }),
      },
    );
    assert.equal(result.status, 400);
  }
  assert.equal((await service("haven_hug_count")).total, 1);
});
