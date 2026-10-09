import test from "node:test";
import assert from "node:assert/strict";
import { appConfig } from "../lib/config";
import { readForm } from "../lib/request";
import { entry, signIn, redeem, type Provider } from "../lib/flow";
const id = "00000000-0000-4000-8000-000000000001";
const user = {
  id,
  email: "person@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
};
const member = {
  id,
  role: "member",
  status: "active",
  consentVersion: "member-v1",
};
const config = {
  origin: "https://members-staging.example.test",
  url: "https://fixture.supabase.co",
  key: "sb_publishable_fixture",
  secure: true,
};
const env = {
  MEMBER_UI_ENABLED: "true",
  MEMBER_APP_ENVIRONMENT: "staging",
  MEMBER_UI_ORIGIN: config.origin,
  SUPABASE_URL: config.url,
  SUPABASE_PUBLISHABLE_KEY: config.key,
  NODE_ENV: "production",
};
function provider(
  options: {
    user?: unknown;
    authError?: unknown;
    rpcError?: unknown;
    data?: unknown;
    loginError?: unknown;
    throws?: boolean;
  } = {},
) {
  const calls: { name: string; args?: unknown }[] = [];
  const client = {
    auth: {
      getUser: async () => {
        calls.push({ name: "getUser" });
        if (options.throws) throw Error("sensitive fixture");
        return {
          data: { user: "user" in options ? options.user : user },
          error: options.authError ?? null,
        };
      },
      signInWithPassword: async (args: unknown) => {
        calls.push({ name: "login", args });
        return { error: options.loginError ?? null };
      },
      signOut: async (args: unknown) => {
        calls.push({ name: "logout", args });
        return { error: null };
      },
    },
    rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args });
      return {
        data: "data" in options ? options.data : member,
        error: options.rpcError ?? null,
      };
    },
  } as unknown as Provider;
  return { client, calls };
}
const login = () =>
  new URLSearchParams({ email: user.email, password: "fixture password" });
test("configuration defaults closed and rejects public domains, production, malformed URLs and secret keys", () => {
  assert.equal(appConfig({}), null);
  assert.deepEqual(appConfig(env), config);
  for (const overrides of [
    { MEMBER_UI_ENABLED: "false" },
    { MEMBER_APP_ENVIRONMENT: "production" },
    { MEMBER_UI_ORIGIN: "https://havenforward.com" },
    { MEMBER_UI_ORIGIN: "https://app.havenforward.com" },
    { MEMBER_UI_ORIGIN: "http://members.example.test" },
    { MEMBER_UI_ORIGIN: config.origin + "/" },
    { SUPABASE_URL: config.url + "/auth" },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" },
    { SUPABASE_URL: "https://fixture.supabase.co@attacker.example.test" },
  ])
    assert.equal(appConfig({ ...env, ...overrides }), null);
  assert.equal(
    appConfig({ ...env, MEMBER_UI_ORIGIN: "http://127.0.0.1:4180" }),
    null,
  );
  assert.equal(
    appConfig({
      ...env,
      MEMBER_UI_ORIGIN: "http://127.0.0.1:4180",
      NODE_ENV: "development",
    })?.secure,
    false,
  );
});
test("POST boundary denies forged origins, token URLs, duplicate fields and unsupported media", async () => {
  const req = (
    body = "email=a&password=b",
    origin = config.origin,
    url = config.origin + "/auth/login",
    type = "application/x-www-form-urlencoded",
  ) =>
    new Request(url, {
      method: "POST",
      headers: { origin, "content-type": type },
      body,
    });
  assert.ok(await readForm(req(), config, ["email", "password"]));
  for (const request of [
    req("email=a&email=b"),
    req("role=admin"),
    req("email=a", "null"),
    req("email=a", config.origin, config.origin + "/auth/login?token=secret"),
    req("email=a", config.origin, "https://attacker.example.test/auth/login"),
    req("{}", config.origin, config.origin + "/auth/login", "application/json"),
  ])
    assert.equal(await readForm(request, config, ["email", "password"]), null);
});
test("streaming size limit works without content-length and accepts an empty logout form", async () => {
  const headers = {
    origin: config.origin,
    "content-type": "application/x-www-form-urlencoded",
  };
  assert.equal(
    await readForm(
      new Request(config.origin + "/auth/login", {
        method: "POST",
        headers,
        body: "password=" + "a".repeat(4097),
      }),
      config,
      ["password"],
    ),
    null,
  );
  assert.ok(
    await readForm(
      new Request(config.origin + "/auth/logout", { method: "POST", headers }),
      config,
      [],
    ),
  );
});
test("private entry verifies current identity and returns only own minimal membership", async () => {
  const fixture = provider({
    data: { ...member, email: user.email, extra: "private" },
  });
  assert.deepEqual(await entry(fixture.client), { state: "member", member });
  assert.deepEqual(
    fixture.calls.map((x) => x.name),
    ["getUser", "haven_member_self"],
  );
});
test("missing, anonymous, unverified and malformed identities cannot query membership", async () => {
  for (const invalid of [
    null,
    { ...user, is_anonymous: true },
    { ...user, email_confirmed_at: null },
    { ...user, email: null },
    { ...user, id: "bad" },
  ]) {
    const fixture = provider({ user: invalid });
    assert.deepEqual(await entry(fixture.client), { state: "signed-out" });
    assert.equal(fixture.calls.length, 1);
  }
});
test("suspension/database switch denial takes effect immediately and mismatched users fail closed", async () => {
  assert.deepEqual(
    await entry(provider({ rpcError: { code: "42501" } }).client),
    { state: "invitation" },
  );
  for (const invalid of [
    { ...member, id: "00000000-0000-4000-8000-000000000002" },
    { ...member, role: "owner" },
    { ...member, status: "suspended" },
    { ...member, consentVersion: "old" },
    null,
  ])
    assert.deepEqual(await entry(provider({ data: invalid }).client), {
      state: "unavailable",
    });
});
test("provider outages deny access without returning sensitive error text", async () => {
  assert.deepEqual(await entry(provider({ throws: true }).client), {
    state: "unavailable",
  });
  assert.deepEqual(
    await entry(
      provider({ authError: { status: 503, message: "secret" } }).client,
    ),
    { state: "unavailable" },
  );
  assert.deepEqual(
    await entry(provider({ authError: { status: 401 } }).client),
    { state: "signed-out" },
  );
});
test("password sign-in does not enroll an account and still requires membership", async () => {
  const fixture = provider({ rpcError: { code: "42501" } });
  assert.equal(await signIn(fixture.client, login()), "invitation");
  assert.deepEqual(
    fixture.calls.map((x) => x.name),
    ["login", "getUser", "haven_member_self"],
  );
  assert.equal(await signIn(provider().client, login()), "member");
});
test("invalid credentials and unverified sign-in produce neutral failures", async () => {
  assert.equal(
    await signIn(
      provider({ loginError: { status: 400, message: "email detail" } }).client,
      login(),
    ),
    "invalid",
  );
  const fixture = provider({ user: { ...user, email_confirmed_at: null } });
  assert.equal(await signIn(fixture.client, login()), "invalid");
  assert.deepEqual(fixture.calls.at(-1), {
    name: "logout",
    args: { scope: "local" },
  });
  for (const form of [
    new URLSearchParams({ email: "bad", password: "x" }),
    new URLSearchParams({ email: user.email, password: "x".repeat(1025) }),
  ]) {
    const invalid = provider();
    assert.equal(await signIn(invalid.client, form), "invalid");
    assert.equal(invalid.calls.length, 0);
  }
});
test("redemption requires current explicit consent and hashes the token before sending it to Postgres", async () => {
  const raw = "a".repeat(64);
  const fixture = provider({ data: { accepted: false } });
  assert.equal(
    await redeem(
      fixture.client,
      new URLSearchParams({
        token: raw,
        consent: "yes",
        consentVersion: "member-v1",
      }),
    ),
    "invalid",
  );
  const args = fixture.calls.find(
    (x) => x.name === "haven_redeem_member_invitation",
  )!.args as { p_token_hash: string };
  assert.match(args.p_token_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(args).includes(raw));
  for (const form of [
    new URLSearchParams({ token: raw }),
    new URLSearchParams({ token: raw, consent: "yes", consentVersion: "old" }),
    new URLSearchParams({
      token: "bad",
      consent: "yes",
      consentVersion: "member-v1",
    }),
  ]) {
    const invalid = provider();
    assert.equal(await redeem(invalid.client, form), "invalid");
    assert.equal(invalid.calls.length, 0);
  }
});
test("accepted redemption rechecks membership; replay and authorization denial stay neutral", async () => {
  const fixture = provider();
  fixture.client.rpc = (async (name: string) => ({
    data:
      name === "haven_redeem_member_invitation" ? { accepted: true } : member,
    error: null,
  })) as unknown as Provider["rpc"];
  const form = new URLSearchParams({
    token: "b".repeat(64),
    consent: "yes",
    consentVersion: "member-v1",
  });
  assert.equal(await redeem(fixture.client, form), "member");
  assert.equal(
    await redeem(provider({ user: null }).client, form),
    "signed-out",
  );
  assert.equal(
    await redeem(provider({ rpcError: { code: "42501" } }).client, form),
    "invalid",
  );
  assert.equal(
    await redeem(provider({ data: { accepted: false } }).client, form),
    "invalid",
  );
});
