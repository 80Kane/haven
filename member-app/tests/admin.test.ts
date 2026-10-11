import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  adminAccess,
  verifyAdminFactor,
  issueInvitation,
  revokeInvitation,
  type AdminProvider,
} from "../lib/admin";
import { adminAppConfig } from "../lib/config";
import { escapeHtml, privateHtml } from "../lib/private-html";
const id = "00000000-0000-4000-8000-000000000001";
const factorId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
function fixture(
  options: {
    role?: string;
    aal?: string;
    signedOut?: boolean;
    denied?: boolean;
    verifyError?: boolean;
    factors?: string[];
    rpcError?: string;
    demoteAfterVerify?: boolean;
    throws?: boolean;
  } = {},
) {
  const calls: { name: string; args?: any }[] = [];
  let level = options.aal || "aal1",
    verified = false;
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.signedOut
            ? null
            : {
                id,
                email: "admin@example.test",
                email_confirmed_at: "2026-01-01",
                is_anonymous: false,
              },
        },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => {
          calls.push({ name: "aal" });
          return { data: { currentLevel: level }, error: null };
        },
        listFactors: async () => ({
          data: {
            all: (options.factors || [factorId]).map((id) => ({
              id,
              factor_type: "totp",
              status: "verified",
            })),
          },
          error: null,
        }),
        challengeAndVerify: async (args: any) => {
          calls.push({ name: "verify", args });
          if (options.verifyError) return { error: { message: "SECRET" } };
          level = "aal2";
          verified = true;
          return { error: null };
        },
      },
    },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (options.throws) throw new Error("SECRET");
      if (name === "haven_member_self")
        return {
          data: {
            id,
            role:
              verified && options.demoteAfterVerify
                ? "member"
                : options.role || "admin",
            status: "active",
            consentVersion: "member-v1",
          },
          error: options.denied ? { code: "42501" } : null,
        };
      return {
        data:
          name === "haven_issue_member_invitation"
            ? { id: inviteId, expiresAt: "2026-12-01T00:00:00Z" }
            : { revoked: true },
        error: options.rpcError
          ? { code: options.rpcError, message: "SECRET" }
          : null,
      };
    },
  } as unknown as AdminProvider;
  return { client, calls };
}
test("administrator flag defaults closed and cannot override member staging config", () => {
  const env = {
    MEMBER_UI_ENABLED: "true",
    MEMBER_APP_ENVIRONMENT: "staging",
    MEMBER_UI_ORIGIN: "https://staging.example.test",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  };
  assert.equal(adminAppConfig(env), null);
  assert.ok(adminAppConfig({ ...env, MEMBER_ADMIN_UI_ENABLED: "true" }));
  assert.equal(
    adminAppConfig({
      ...env,
      MEMBER_ADMIN_UI_ENABLED: "true",
      MEMBER_UI_ENABLED: "false",
    }),
    null,
  );
});
test("ordinary members and moderators cannot access administrator tools even at aal2", async () => {
  for (const role of ["member", "moderator"]) {
    const f = fixture({ role, aal: "aal2" });
    assert.equal(await adminAccess(f.client), "denied");
    assert.equal(
      (await issueInvitation(f.client, "pending@example.test", "24")).state,
      "denied",
    );
    assert.equal(await revokeInvitation(f.client, inviteId), "denied");
    assert.ok(!f.calls.some((c) => c.name.includes("invitation")));
  }
});
test("password-only administrators need MFA before writes and unauthenticated accounts are denied", async () => {
  const f = fixture();
  assert.equal(await adminAccess(f.client), "mfa");
  assert.equal(
    (await issueInvitation(f.client, "pending@example.test", "24")).state,
    "denied",
  );
  assert.equal(await revokeInvitation(f.client, inviteId), "denied");
  assert.equal(
    await adminAccess(fixture({ signedOut: true }).client),
    "signed-out",
  );
  assert.equal(
    await adminAccess(fixture({ denied: true, aal: "aal2" }).client),
    "invitation",
  );
});
test("factor verification rejects foreign factors, malformed IDs and incorrect code lengths before provider verify", async () => {
  const f = fixture();
  for (const [factor, code] of [
    [inviteId, "123456"],
    [factorId, "12345"],
    [factorId, "1234567"],
    ["bad", "123456"],
    [factorId, "abc123"],
  ])
    assert.equal(await verifyAdminFactor(f.client, factor, code), "invalid");
  assert.ok(!f.calls.some((c) => c.name === "verify"));
});
test("MFA verification requires own factor and freshly rechecks SQL membership after elevation", async () => {
  const f = fixture();
  assert.equal(await verifyAdminFactor(f.client, factorId, "123456"), "admin");
  assert.equal(f.calls.filter((c) => c.name === "haven_member_self").length, 2);
  assert.equal(
    await verifyAdminFactor(
      fixture({ demoteAfterVerify: true }).client,
      factorId,
      "123456",
    ),
    "denied",
  );
  assert.equal(
    await verifyAdminFactor(
      fixture({ verifyError: true }).client,
      factorId,
      "123456",
    ),
    "invalid",
  );
  assert.equal(
    await verifyAdminFactor(
      fixture({ role: "member" }).client,
      factorId,
      "123456",
    ),
    "denied",
  );
});
test("invitation creation returns code once and sends only its SHA-256 hash to SQL", async () => {
  const f = fixture({ aal: "aal2" });
  const result = await issueInvitation(
    f.client,
    " Pending@Example.test ",
    "24",
  );
  assert.equal(result.state, "issued");
  if (result.state !== "issued") throw new Error("Expected code");
  assert.match(result.token, /^[a-f0-9]{64}$/);
  const args = f.calls.find(
    (c) => c.name === "haven_issue_member_invitation",
  )!.args;
  assert.deepEqual(args, {
    p_email: "pending@example.test",
    p_expires_hours: 24,
    p_token_hash: createHash("sha256").update(result.token).digest("hex"),
  });
  assert.ok(!JSON.stringify(args).includes(result.token));
  const next = await issueInvitation(f.client, "pending@example.test", "24");
  assert.equal(next.state, "issued");
  if (next.state === "issued") assert.notEqual(next.token, result.token);
});
test("staging issuance rejects real recipients and malformed expiry without issuing SQL writes", async () => {
  const f = fixture({ aal: "aal2" });
  for (const [email, hours] of [
    ["real@gmail.com", "24"],
    ["bad", "24"],
    ["pending@example.test", "0"],
    ["pending@example.test", "169"],
    ["pending@example.test", "1.5"],
    ["pending@example.test", "024"],
  ])
    assert.equal(
      (await issueInvitation(f.client, email, hours)).state,
      "invalid",
    );
  assert.equal(f.calls.length, 0);
});
test("SQL authorization and rate limits remain authoritative despite a successful application gate", async () => {
  for (const code of ["42501", "P0001"]) {
    const result = await issueInvitation(
      fixture({ aal: "aal2", rpcError: code }).client,
      "pending@example.test",
      "1",
    );
    assert.equal(result.state, code === "P0001" ? "limited" : "denied");
    assert.ok(!("token" in result));
  }
  assert.equal(
    await revokeInvitation(
      fixture({ aal: "aal2", rpcError: "42501" }).client,
      inviteId,
    ),
    "denied",
  );
});
test("revocation requires UUID and sends only the invitation ID to user-scoped RPC", async () => {
  const f = fixture({ aal: "aal2" });
  assert.equal(await revokeInvitation(f.client, "bad"), "invalid");
  assert.equal(await revokeInvitation(f.client, inviteId), "revoked");
  assert.deepEqual(f.calls.at(-1), {
    name: "haven_revoke_member_invitation",
    args: { p_invitation_id: inviteId },
  });
});
test("provider failures remain neutral and reveal no secret exception text", async () => {
  assert.equal(
    await adminAccess(fixture({ throws: true }).client),
    "unavailable",
  );
  assert.equal(
    (
      await issueInvitation(
        fixture({ throws: true, aal: "aal2" }).client,
        "pending@example.test",
        "24",
      )
    ).state,
    "denied",
  );
});
test("private POST result pages escape dynamic text and prohibit caching", async () => {
  const text = '<img src=x onerror="alert(1)">';
  assert.ok(!escapeHtml(text).includes("<img"));
  const response = privateHtml(text, `<p>${escapeHtml(text)}</p>`);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "same-origin");
  assert.ok(!(await response.text()).includes(text));
});
