import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
const connection = new URL(
  process.env.TEST_DATABASE_URL ||
    "postgres://postgres:haven_local_tests_only@127.0.0.1:55432/postgres",
);
if (!["127.0.0.1", "localhost"].includes(connection.hostname))
  throw Error("Member tests require isolated localhost PostgreSQL.");
connection.pathname = "/postgres";
const admin = new pg.Client({ connectionString: connection.toString() });
let pool;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const TOKEN = "a".repeat(64);
const signatures = {
  haven_member_self: [],
  haven_issue_member_invitation: ["p_email", "p_token_hash", "p_expires_hours"],
  haven_revoke_member_invitation: ["p_invitation_id"],
  haven_redeem_member_invitation: ["p_token_hash", "p_consent_version"],
  haven_set_member_access: ["p_member_id", "p_status", "p_role"],
};
before(async () => {
  await admin.connect();
  await admin.query("SELECT pg_advisory_lock(72134682)");
  // Separate DB from public-api fixtures, safe for concurrent Node test files.
  if (
    !(
      await admin.query(
        "select 1 from pg_database where datname='haven_member_tests'",
      )
    ).rowCount
  )
    await admin.query("create database haven_member_tests");
  for (const role of ["anon", "authenticated", "service_role"])
    await admin.query(
      `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`,
    );
  await admin.query("SELECT pg_advisory_unlock(72134682)");
  connection.pathname = "/haven_member_tests";
  pool = new pg.Pool({ connectionString: connection.toString(), max: 16 });
  await pool.query("drop schema if exists haven_members cascade");
  for (const [name, types] of Object.entries({
    haven_member_self: "",
    haven_issue_member_invitation: "text,text,integer",
    haven_revoke_member_invitation: "uuid",
    haven_redeem_member_invitation: "text,text",
    haven_set_member_access: "uuid,text,text",
  }))
    await pool.query(`drop function if exists public.${name}(${types})`);
  // Local Auth schema reproduces fields/helpers used by migration, not GoTrue/JWT validation.
  await pool.query(`create schema if not exists auth;
 create table if not exists auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
 create or replace function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
 grant usage on schema auth to authenticated,anon,service_role;
 grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
  await pool.query(
    await readFile(
      "supabase/migrations/202610090002_member_foundation.sql",
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await pool.query(
    "truncate haven_members.audit_events,haven_members.redemption_attempts,haven_members.invitations,haven_members.members,auth.users cascade",
  );
  await pool.query("update haven_members.configuration set enabled=true");
  for (const [id, email] of [
    [A, "admin@example.test"],
    [B, "person@example.test"],
    [C, "other@example.test"],
    [D, "second-admin@example.test"],
  ])
    await pool.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, email],
    );
  await pool.query(
    "insert into haven_members.members(id,role,consent_version) values($1,'admin','member-v1')",
    [A],
  );
});
after(async () => {
  await pool?.end();
  await admin.end();
});
async function asActor(actor, aal, sql, params = [], role = "authenticated") {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: actor, aal, role }),
    ]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
async function rpc(
  name,
  params = {},
  actor = A,
  aal = "aal2",
  role = "authenticated",
) {
  const args = signatures[name].map((key) => params[key]);
  return (
    await asActor(
      actor,
      aal,
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
      args,
      role,
    )
  ).rows[0].value;
}
const issue = (
  token = TOKEN,
  email = "person@example.test",
  actor = A,
  aal = "aal2",
) =>
  rpc(
    "haven_issue_member_invitation",
    { p_email: email, p_token_hash: token, p_expires_hours: 24 },
    actor,
    aal,
  );
const redeem = (token = TOKEN, actor = B) =>
  rpc(
    "haven_redeem_member_invitation",
    { p_token_hash: token, p_consent_version: "member-v1" },
    actor,
    "aal1",
  );
const access = (target, status = "suspended", role = "member", actor = A) =>
  rpc(
    "haven_set_member_access",
    { p_member_id: target, p_status: status, p_role: role },
    actor,
  );
const denied = (promise) =>
  assert.rejects(promise, (error) => error.code === "42501");

test("migration starts disabled; no caller including staff can bypass database switch", async () => {
  await pool.query("update haven_members.configuration set enabled=false");
  await denied(issue());
  await denied(rpc("haven_member_self"));
  await denied(redeem());
});
test("issuance requires active verified administrator and aal2, including direct RPC calls", async () => {
  await denied(issue(TOKEN, "person@example.test", A, "aal1"));
  await denied(issue(TOKEN, "person@example.test", B));
  await pool.query(
    "insert into haven_members.members(id,role,consent_version) values($1,'moderator','member-v1')",
    [B],
  );
  await denied(issue(TOKEN, "person@example.test", B));
  await pool.query(
    "update auth.users set email_confirmed_at=null where id=$1",
    [A],
  );
  await denied(issue());
});
test("only intended verified email can redeem; no role escalation through invitation", async () => {
  await issue();
  assert.equal((await redeem(TOKEN, C)).accepted, false);
  await pool.query(
    "update auth.users set email_confirmed_at=null where id=$1",
    [B],
  );
  await denied(redeem());
  await pool.query(
    "update auth.users set email_confirmed_at=now() where id=$1",
    [B],
  );
  assert.equal((await redeem()).accepted, true);
  const rows = (
    await pool.query(
      "select role,status from haven_members.members where id=$1",
      [B],
    )
  ).rows;
  assert.deepEqual(rows, [{ role: "member", status: "active" }]);
});
test("concurrent redemption creates exactly one membership; replay is rejected", async () => {
  await issue();
  const results = await Promise.all(Array.from({ length: 8 }, () => redeem()));
  assert.equal(results.filter((r) => r.accepted).length, 1);
  assert.equal((await redeem()).accepted, false);
  assert.equal(
    (await pool.query("select * from haven_members.members where id=$1", [B]))
      .rowCount,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "select * from haven_members.audit_events where action='invite_redeemed'",
      )
    ).rowCount,
    1,
  );
});
test("unknown expired and revoked tokens return neutral rejection and do not activate", async () => {
  assert.deepEqual(await redeem("b".repeat(64)), { accepted: false });
  const inv = await issue();
  await rpc("haven_revoke_member_invitation", { p_invitation_id: inv.id });
  assert.deepEqual(await redeem(), { accepted: false });
  await pool.query("delete from haven_members.invitations");
  await issue("c".repeat(64));
  await pool.query(
    "update haven_members.invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 day'",
  );
  assert.deepEqual(await redeem("c".repeat(64)), { accepted: false });
});
test("plus-addresses are not normalized to a different identity; current Auth email is authoritative", async () => {
  await issue(TOKEN, "Person+Pilot@example.test");
  assert.equal((await redeem()).accepted, false);
  await pool.query("update auth.users set email=$1 where id=$2", [
    "PERSON+PILOT@EXAMPLE.TEST",
    B,
  ]);
  assert.equal((await redeem()).accepted, true);
});
test("anonymous banned users and missing consent cannot redeem", async () => {
  await issue();
  await pool.query("update auth.users set is_anonymous=true where id=$1", [B]);
  await denied(redeem());
  await pool.query(
    "update auth.users set is_anonymous=false,banned_until=now()+interval '1 day' where id=$1",
    [B],
  );
  await denied(redeem());
  await pool.query("update auth.users set banned_until=null where id=$1", [B]);
  assert.deepEqual(
    await rpc(
      "haven_redeem_member_invitation",
      { p_token_hash: TOKEN, p_consent_version: "interest-v1" },
      B,
    ),
    { accepted: false },
  );
});
test("member can read only own active row; direct writes and role escalation are denied", async () => {
  await issue();
  await redeem();
  const rows = (
    await asActor(B, "aal1", "select id from haven_members.members")
  ).rows;
  assert.deepEqual(rows, [{ id: B }]);
  await denied(
    asActor(
      B,
      "aal2",
      "update haven_members.members set role='admin' where id=$1",
      [B],
    ),
  );
  await denied(
    asActor(
      B,
      "aal2",
      "insert into haven_members.members(id,consent_version) values($1,'member-v1')",
      [C],
    ),
  );
  await denied(
    asActor(B, "aal2", "delete from haven_members.members where id=$1", [B]),
  );
  await denied(access(C, "active", "admin", B));
  await denied(asActor(B, "aal2", "select * from haven_members.invitations"));
  await denied(asActor(B, "aal2", "select * from haven_members.audit_events"));
});
test("anon and service_role cannot invoke member functions or enumerate private enrollment", async () => {
  for (const role of ["anon", "service_role"]) {
    await denied(rpc("haven_member_self", {}, B, "aal2", role));
    await denied(
      asActor(B, "aal2", "select * from haven_members.invitations", [], role),
    );
  }
  await denied(asActor(B, "aal2", "select haven_members.require_admin()"));
});
test("suspension is immediate for existing token; invitation cannot restore suspended member", async () => {
  await issue();
  await redeem();
  await access(B);
  await denied(rpc("haven_member_self", {}, B, "aal1"));
  assert.equal(
    (await asActor(B, "aal1", "select * from haven_members.members")).rowCount,
    0,
  );
  await issue("b".repeat(64));
  assert.deepEqual(await redeem("b".repeat(64)), { accepted: false });
  await access(B, "active");
  assert.equal(
    (await rpc("haven_member_self", {}, B, "aal1")).status,
    "active",
  );
});
test("removal is terminal through access API; staff cannot modify their own role or status", async () => {
  await issue();
  await redeem();
  await access(B, "removed");
  await denied(rpc("haven_member_self", {}, B));
  await assert.rejects(access(B, "active"), (e) => e.code === "22023");
  await assert.rejects(
    access(A, "suspended", "admin"),
    (e) => e.code === "22023",
  );
  assert.equal((await rpc("haven_member_self")).role, "admin");
});
test("demoting staff revokes outstanding issued invites and cannot remove all admins concurrently", async () => {
  await pool.query(
    "insert into haven_members.members(id,role,consent_version) values($1,'admin','member-v1')",
    [D],
  );
  const inv = await issue(TOKEN, "person@example.test", D);
  await access(D, "active", "member");
  assert.notEqual(
    (
      await pool.query(
        "select revoked_at from haven_members.invitations where id=$1",
        [inv.id],
      )
    ).rows[0].revoked_at,
    null,
  );
  assert.equal((await redeem()).accepted, false);
  await access(D, "active", "admin");
  const results = await Promise.allSettled([
    access(D, "suspended", "admin", A),
    access(A, "suspended", "admin", D),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await pool.query(
        "select * from haven_members.members where role='admin' and status='active'",
      )
    ).rowCount,
    1,
  );
});
test("issuance and redemption have bounded per-actor limits, including direct RPC traffic", async () => {
  for (let i = 0; i < 10; i++) await issue(i.toString(16).padStart(64, "0"));
  await assert.rejects(issue("f".repeat(64)), (e) => e.code === "P0001");
  for (let i = 0; i < 20; i++)
    assert.equal((await redeem("e".repeat(64))).accepted, false);
  assert.equal((await redeem("0".repeat(64))).accepted, false);
  assert.equal(
    (
      await pool.query(
        "select attempts from haven_members.redemption_attempts where actor_id=$1",
        [B],
      )
    ).rows[0].attempts,
    21,
  );
});
test("membership insertion failure rolls back invite consumption and audit, then retry succeeds", async () => {
  await issue();
  await pool.query(`create function haven_members.fixture_fail() returns trigger language plpgsql as $$ begin raise exception 'fixture'; end $$;
 create trigger fixture_fail before insert on haven_members.members for each row execute function haven_members.fixture_fail()`);
  try {
    await assert.rejects(redeem());
    assert.equal(
      (await pool.query("select consumed_at from haven_members.invitations"))
        .rows[0].consumed_at,
      null,
    );
    assert.equal(
      (
        await pool.query(
          "select * from haven_members.audit_events where action='invite_redeemed'",
        )
      ).rowCount,
      0,
    );
  } finally {
    await pool.query(
      "drop trigger fixture_fail on haven_members.members;drop function haven_members.fixture_fail()",
    );
  }
  assert.equal((await redeem()).accepted, true);
});
test("invitation expiry and tokens are validated at database boundary and revocation is idempotent", async () => {
  for (const hours of [0, 169, null])
    await assert.rejects(
      rpc("haven_issue_member_invitation", {
        p_email: "person@example.test",
        p_token_hash: TOKEN,
        p_expires_hours: hours,
      }),
      (e) => e.code === "22023",
    );
  await assert.rejects(issue("raw-token"), (e) => e.code === "22023");
  const inv = await issue();
  for (let i = 0; i < 2; i++)
    assert.deepEqual(
      await rpc("haven_revoke_member_invitation", { p_invitation_id: inv.id }),
      { revoked: true },
    );
  assert.equal(
    (
      await pool.query(
        "select * from haven_members.audit_events where action='invite_revoked'",
      )
    ).rowCount,
    1,
  );
});
