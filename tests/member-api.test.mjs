import test from "node:test";
import assert from "node:assert/strict";
import {
  handleMemberApi,
  memberStagingOrigin,
} from "../backend/member-api.mjs";
import { hash } from "../backend/public-api.mjs";
import { onRequest } from "../functions/api/[[path]].js";
const id = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const env = {
  MEMBER_FOUNDATION_ENABLED: "true",
  MEMBER_APP_ORIGIN: memberStagingOrigin,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};
const bearer = "Bearer fixture-user-token-signed-by-provider";
const user = {
  id,
  email: "person@example.test",
  email_confirmed_at: "2026-10-09T00:00:00Z",
  is_anonymous: false,
};
function req(path, body, settings = {}) {
  return new Request(
    (settings.origin || memberStagingOrigin) + "/api/member/" + path,
    {
      method: settings.method || (body ? "POST" : "GET"),
      headers: {
        Origin: memberStagingOrigin,
        Authorization: bearer,
        "Content-Type": "application/json",
        ...settings.headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
function fixture(options = {}) {
  const calls = [];
  const errors = [];
  return {
    calls,
    errors,
    deps: {
      reportFailure: (code) => errors.push(code),
      fetch: async (url, init) => {
        calls.push({ url, init });
        if (url.endsWith("/user"))
          return Response.json(options.user || user, {
            status: options.authStatus || 200,
          });
        return Response.json(
          options.data || {
            id,
            role: "member",
            status: "active",
            consentVersion: "member-v1",
          },
          { status: options.rpcStatus || 200 },
        );
      },
    },
  };
}
test("member API disabled, wrong hosts and incomplete bindings never contact Auth", async () => {
  for (const changes of [
    { MEMBER_FOUNDATION_ENABLED: "false" },
    { MEMBER_FOUNDATION_ENABLED: undefined },
    { MEMBER_APP_ORIGIN: "https://havenforward.com" },
    { SUPABASE_PUBLISHABLE_KEY: undefined },
    { SUPABASE_URL: "https://attacker.test" },
  ]) {
    const f = fixture();
    const response = await handleMemberApi(
      req("self"),
      { ...env, ...changes },
      f.deps,
    );
    assert.ok([404, 503].includes(response.status));
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal(
    (
      await handleMemberApi(
        req("self", null, { origin: "https://havenforward.com" }),
        env,
        f.deps,
      )
    ).status,
    404,
  );
  assert.equal(f.calls.length, 0);
});
test("scanner GET, unknown paths and query tokens never authenticate or redeem", async () => {
  const f = fixture();
  for (const path of [
    "invitations",
    "invitations/redeem",
    "invitations/revoke",
    "access",
  ]) {
    assert.equal((await handleMemberApi(req(path), env, f.deps)).status, 405);
  }
  assert.equal(
    (await handleMemberApi(req("self?token=private"), env, f.deps)).status,
    404,
  );
  assert.equal(
    (await handleMemberApi(req("unknown"), env, f.deps)).status,
    404,
  );
  assert.equal(f.calls.length, 0);
});
test("null and foreign origins plus missing bearer are denied before provider access", async () => {
  const f = fixture();
  for (const origin of ["null", "https://attacker.test", ""]) {
    assert.equal(
      (
        await handleMemberApi(
          req("invitations/redeem", {}, { headers: { Origin: origin } }),
          env,
          f.deps,
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await handleMemberApi(
        req("self", null, { headers: { Authorization: "" } }),
        env,
        f.deps,
      )
    ).status,
    401,
  );
  assert.equal(f.calls.length, 0);
});
test("current Auth identity required; unverified, anonymous and banned identities cannot call RPC", async () => {
  for (const identity of [
    { ...user, email_confirmed_at: null },
    { ...user, is_anonymous: true },
    { ...user, banned_until: "2999-01-01T00:00:00Z" },
    { ...user, deleted_at: "2026-10-09T00:00:00Z" },
    { ...user, id: "invalid" },
  ]) {
    const f = fixture({ user: identity });
    assert.equal((await handleMemberApi(req("self"), env, f.deps)).status, 403);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture({ authStatus: 401 });
  assert.equal((await handleMemberApi(req("self"), env, f.deps)).status, 401);
});
test("self response is identity bound, minimal and uncached; RPC receives caller token and publishable key", async () => {
  const f = fixture();
  const response = await handleMemberApi(
    req("self"),
    { ...env, SUPABASE_SECRET_KEY: "never-forward-this" },
    f.deps,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.deepEqual(await response.json(), {
    id,
    role: "member",
    status: "active",
    consentVersion: "member-v1",
  });
  assert.equal(f.calls[1].init.headers.Authorization, bearer);
  assert.equal(f.calls[1].init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(f.calls[1].init.body, "{}");
});
test("issuance returns random token once but sends only its hash and allowed inputs to RPC", async () => {
  const tokens = [];
  for (let i = 0; i < 2; i++) {
    const f = fixture({
      data: { id: inviteId, expiresAt: "2026-10-10T00:00:00Z" },
    });
    const response = await handleMemberApi(
      req("invitations", { email: " Person@Example.test ", expiresHours: 24 }),
      env,
      f.deps,
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.match(body.token, /^[a-f0-9]{64}$/);
    tokens.push(body.token);
    assert.deepEqual(JSON.parse(f.calls[1].init.body), {
      p_email: "person@example.test",
      p_expires_hours: 24,
      p_token_hash: await hash(body.token),
    });
    assert.equal(f.errors.length, 0);
  }
  assert.notEqual(tokens[0], tokens[1]);
});
test("redemption requires explicit consent; role/identity injection and invalid bodies never reach RPC", async () => {
  const token = "a".repeat(64);
  for (const body of [
    { token, consent: false, consentVersion: "member-v1" },
    { token, consent: true, consentVersion: "interest-v1" },
    { token, consent: true, consentVersion: "member-v1", role: "admin" },
    [],
    { token: "bad" },
  ]) {
    const f = fixture();
    assert.equal(
      (await handleMemberApi(req("invitations/redeem", body), env, f.deps))
        .status,
      400,
    );
    assert.equal(f.calls.length, 1);
  }
  for (const body of [
    { email: "person@example.test", expiresHours: 24, role: "admin" },
    { email: "person@example.test", expiresHours: 169 },
  ]) {
    const f = fixture();
    assert.equal(
      (await handleMemberApi(req("invitations", body), env, f.deps)).status,
      400,
    );
    assert.equal(f.calls.length, 1);
  }
});
test("valid redemption sends hashed token with caller identity; rejected tokens get neutral errors", async () => {
  const token = "a".repeat(64);
  const body = { token, consent: true, consentVersion: "member-v1" };
  const f = fixture({ data: { accepted: true } });
  assert.equal(
    (await handleMemberApi(req("invitations/redeem", body), env, f.deps))
      .status,
    200,
  );
  assert.deepEqual(JSON.parse(f.calls[1].init.body), {
    p_token_hash: await hash(token),
    p_consent_version: "member-v1",
  });
  const rejected = fixture({
    data: { accepted: false, privateReason: "expired" },
  });
  assert.deepEqual(
    await (
      await handleMemberApi(req("invitations/redeem", body), env, rejected.deps)
    ).json(),
    { error: "Invitation cannot be accepted" },
  );
});
test("database denial is enforced for member self and staff operations", async () => {
  for (const [path, body] of [
    ["self", null],
    ["invitations", { email: "person@example.test", expiresHours: 24 }],
    ["access", { memberId: inviteId, status: "active", role: "admin" }],
    ["invitations/revoke", { invitationId: inviteId }],
  ]) {
    const f = fixture({ rpcStatus: 403 });
    assert.equal(
      (await handleMemberApi(req(path, body), env, f.deps)).status,
      403,
    );
  }
});
test("another identity or malformed database result fails closed and logs only a fixed code", async () => {
  for (const data of [
    {
      id: inviteId,
      role: "member",
      status: "active",
      consentVersion: "member-v1",
    },
    { id, role: "admin", status: "suspended" },
    {},
  ]) {
    const f = fixture({ data });
    const response = await handleMemberApi(req("self"), env, f.deps);
    assert.equal(response.status, 503);
    assert.deepEqual(f.errors, ["member_database_response"]);
  }
  const f = {
    fetch: () => {
      throw Error("secret-address@example.test");
    },
    reportFailure: () => {
      throw Error("diagnostic sink");
    },
  };
  const response = await handleMemberApi(req("self"), env, f);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret-address/);
});
test("oversized streamed and non-JSON requests rejected without database calls", async () => {
  const f = fixture();
  assert.equal(
    (
      await handleMemberApi(
        req("invitations", { email: "a".repeat(3000) }),
        env,
        f.deps,
      )
    ).status,
    400,
  );
  assert.equal(f.calls.length, 1);
  const f2 = fixture();
  assert.equal(
    (
      await handleMemberApi(
        req("invitations", {}, { headers: { "Content-Type": "text/plain" } }),
        env,
        f2.deps,
      )
    ).status,
    400,
  );
  assert.equal(f2.calls.length, 1);
});
test("Pages adapter exposes no member API by default and preserves public routing", async () => {
  assert.equal(
    (await onRequest({ request: req("self"), env: {} })).status,
    404,
  );
  const response = await onRequest({
    request: new Request(memberStagingOrigin + "/api/public/hugs"),
    env: {},
  });
  assert.equal(response.status, 503);
});
