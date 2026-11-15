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
  haven_profile_self: [],
  haven_submit_report: [
    "p_submission_key",
    "p_circle_slug",
    "p_category",
    "p_details",
  ],
  haven_my_reports: [],
  haven_report_queue: [],
  haven_report_detail: ["p_report_id"],
  haven_review_report: ["p_report_id", "p_version", "p_status", "p_resolution"],
  haven_save_profile: [
    "p_handle",
    "p_display_name",
    "p_directory_listed",
    "p_hug_notifications",
  ],
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
    haven_profile_self: "",
    haven_submit_report: "uuid,text,text,text",
    haven_my_reports: "",
    haven_report_queue: "",
    haven_report_detail: "uuid",
    haven_review_report: "uuid,integer,text,text",
    haven_save_profile: "text,text,boolean,boolean",
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
  await pool.query(
    await readFile(
      "supabase/migrations/20261115053225_member_profiles.sql",
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      "supabase/migrations/20261115070139_member_reports.sql",
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await pool.query(
    "truncate haven_members.audit_events,haven_members.redemption_attempts,haven_members.invitations,haven_members.members,auth.users cascade",
  );
  await pool.query(
    "update haven_members.configuration set enabled=true,reporting_enabled=false",
  );
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
  assert.equal(
    (await asActor(A, "aal2", "select * from haven_members.members")).rowCount,
    0,
  );
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

const saveProfile = (
  actor = A,
  handle = "gentle_river",
  name = "River",
  listed = false,
  hugs = false,
) =>
  rpc(
    "haven_save_profile",
    {
      p_handle: handle,
      p_display_name: name,
      p_directory_listed: listed,
      p_hug_notifications: hugs,
    },
    actor,
    "aal1",
  );
const addProfileMember = async (id) =>
  pool.query(
    "insert into haven_members.members(id,consent_version) values($1,'member-v1')",
    [id],
  );

test("profile defaults stay private and RPCs cannot enumerate another member's profile", async () => {
  assert.deepEqual(await rpc("haven_profile_self"), {
    memberId: A,
    profile: null,
  });
  const saved = await saveProfile();
  assert.equal(saved.profile.directoryListed, false);
  assert.equal(saved.profile.hugNotifications, false);
  await addProfileMember(B);
  assert.deepEqual(await rpc("haven_profile_self", {}, B, "aal1"), {
    memberId: B,
    profile: null,
  });
  for (const table of ["profiles", "profile_events"]) {
    await denied(asActor(B, "aal1", `select * from haven_members.${table}`));
    await denied(
      asActor(A, "aal2", `update haven_members.${table} set member_id=$1`, [B]),
    );
  }
  for (const name of ["haven_profile_self", "haven_save_profile"]) {
    assert.equal(
      (
        await pool.query(
          "select prosecdef from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname=$1",
          [name],
        )
      ).rows[0].prosecdef,
      false,
    );
  }
});
test("profiles require current verified active membership and respect the database switch", async () => {
  await denied(saveProfile(B));
  await denied(rpc("haven_profile_self", {}, A, "aal1", "anon"));
  await denied(rpc("haven_profile_self", {}, A, "aal1", "service_role"));
  await pool.query("update haven_members.configuration set enabled=false");
  await denied(saveProfile());
  await denied(rpc("haven_profile_self"));
  await pool.query(
    "update haven_members.configuration set enabled=true,reporting_enabled=false",
  );
  await pool.query("update auth.users set is_anonymous=true where id=$1", [A]);
  await denied(saveProfile());
  await pool.query(
    "update auth.users set is_anonymous=false,email_confirmed_at=null where id=$1",
    [A],
  );
  await denied(saveProfile());
});
test("profile suspension blocks reads and writes, including direct caller RPCs", async () => {
  await addProfileMember(B);
  await saveProfile(B, "quiet_path", "Quiet Path");
  await access(B, "suspended");
  await denied(rpc("haven_profile_self", {}, B, "aal1"));
  await denied(saveProfile(B, "quiet_path", "Quiet Path", true));
});
test("name cooldown cannot block privacy withdrawals and expired cooldown permits renaming", async () => {
  await saveProfile(A, "gentle_river", "River", true, true);
  await assert.rejects(
    saveProfile(A, "gentle_river", "New Name", false, false),
    (e) => e.code === "P0002",
  );
  const before = (
    await pool.query(
      "select name_changed_at from haven_members.profiles where member_id=$1",
      [A],
    )
  ).rows[0].name_changed_at;
  const saved = await saveProfile(A, "gentle_river", "River", false, false);
  assert.equal(saved.profile.directoryListed, false);
  assert.equal(saved.profile.hugNotifications, false);
  assert.equal(
    (
      await pool.query(
        "select name_changed_at from haven_members.profiles where member_id=$1",
        [A],
      )
    ).rows[0].name_changed_at.toISOString(),
    before.toISOString(),
  );
  await pool.query(
    "update haven_members.profiles set name_changed_at=now()-interval '8 days' where member_id=$1",
    [A],
  );
  assert.equal(
    (await saveProfile(A, "gentle_river", "New Name")).profile.displayName,
    "New Name",
  );
  await assert.rejects(
    saveProfile(A, "gentle_river", "Another Name"),
    (e) => e.code === "P0002",
  );
});
test("profile handles are unique and stable; reserved staff labels and invalid text are denied", async () => {
  for (const handle of ["ab", "UPPER", "name@host", "admin", "support_team"]) {
    await assert.rejects(saveProfile(A, handle), (e) => e.code === "22023");
  }
  for (const name of [
    "x",
    " River ",
    "HavenForward Staff",
    "Moderator",
    "a".repeat(41),
    "River\nName",
    "River\u202eName",
  ]) {
    await assert.rejects(
      saveProfile(A, "gentle_river", name),
      (e) => e.code === "22023",
    );
  }
  await saveProfile();
  await assert.rejects(
    saveProfile(A, "changed_handle"),
    (e) => e.code === "22023",
  );
  await addProfileMember(B);
  await assert.rejects(saveProfile(B), (e) => e.code === "23505");
  assert.deepEqual(await rpc("haven_profile_self", {}, B, "aal1"), {
    memberId: B,
    profile: null,
  });
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from haven_members.profile_events where member_id=$1",
        [B],
      )
    ).rows[0].n,
    0,
  );
});
test("concurrent claims for one handle create one profile and no partial audit writes", async () => {
  await addProfileMember(B);
  await addProfileMember(C);
  const results = await Promise.allSettled([saveProfile(B), saveProfile(C)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await pool.query("select count(*)::int as n from haven_members.profiles"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from haven_members.profile_events",
      )
    ).rows[0].n,
    1,
  );
});
test("profile update limit still allows withdrawing visibility and notification preferences", async () => {
  await saveProfile(A, "gentle_river", "River", true, true);
  await pool.query(
    "insert into haven_members.profile_events(member_id,action) select $1,'preferences_changed' from generate_series(1,30)",
    [A],
  );
  const saved = await saveProfile(A, "gentle_river", "River", false, false);
  assert.equal(saved.profile.directoryListed, false);
  assert.equal(saved.profile.hugNotifications, false);
  await assert.rejects(
    saveProfile(A, "gentle_river", "River", true, true),
    (e) => e.code === "P0003",
  );
});

async function reportingSetup() {
  await pool.query(
    "update haven_members.configuration set reporting_enabled=true",
  );
  for (const id of [B, C])
    await pool.query(
      "insert into haven_members.members(id,role,consent_version) values($1,'member','member-v1')",
      [id],
    );
}
function reportArgs(key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
  return {
    p_submission_key: key,
    p_circle_slug: "recovery-healing",
    p_category: "privacy",
    p_details: "Synthetic privacy concern for testing only.",
  };
}
const sendReport = (actor = B, args = reportArgs()) =>
  rpc("haven_submit_report", args, actor, "aal1");
const updateReport = (
  id,
  version,
  status,
  resolution = null,
  actor = A,
  aal = "aal2",
) =>
  rpc(
    "haven_review_report",
    {
      p_report_id: id,
      p_version: version,
      p_status: status,
      p_resolution: resolution,
    },
    actor,
    aal,
  );

test("reporting starts closed and requires active verified membership on every call", async () => {
  await denied(sendReport());
  await denied(rpc("haven_report_queue"));
  await reportingSetup();
  await pool.query(
    "update haven_members.members set status='suspended' where id=$1",
    [B],
  );
  await denied(sendReport());
  await pool.query(
    "update haven_members.members set status='active' where id=$1",
    [B],
  );
  for (const field of [
    "email_confirmed_at=null",
    "is_anonymous=true",
    "banned_until=now()+interval '1 day'",
  ]) {
    await pool.query(`update auth.users set ${field} where id=$1`, [B]);
    await denied(sendReport());
    await pool.query(
      "update auth.users set email_confirmed_at=now(),is_anonymous=false,banned_until=null where id=$1",
      [B],
    );
  }
  await sendReport();
  await pool.query(
    "update haven_members.configuration set reporting_enabled=false",
  );
  await denied(rpc("haven_my_reports", {}, B));
  await denied(rpc("haven_report_queue"));
});
test("reports are caller-owned, duplicate retries are idempotent, and intake is bounded", async () => {
  await reportingSetup();
  const first = await sendReport();
  const again = await sendReport();
  assert.equal(again.id, first.id);
  const mine = await rpc("haven_my_reports", {}, B);
  assert.equal(mine.memberId, B);
  assert.equal(mine.reports.length, 1);
  assert.equal("details" in mine.reports[0], false);
  assert.equal((await rpc("haven_my_reports", {}, C)).reports.length, 0);
  await assert.rejects(
    sendReport(B, {
      ...reportArgs(),
      p_details: "Changed concern on the same submission key",
    }),
    (e) => e.code === "22023",
  );
  for (const change of [
    { p_details: "short" },
    { p_details: "a".repeat(1001) },
    { p_circle_slug: "__proto__" },
    { p_category: "admin" },
    { p_details: "invisible text \u202e hidden" },
  ])
    await assert.rejects(
      sendReport(B, { ...reportArgs(crypto.randomUUID()), ...change }),
      (e) => e.code === "22023",
    );
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      sendReport(B, reportArgs(crypto.randomUUID())),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
  assert.equal(
    (await pool.query("select count(*)::int as n from haven_members.reports"))
      .rows[0].n,
    5,
  );
  assert.equal((await sendReport()).id, first.id);
});
test("report review requires current administrator and MFA; members and moderators cannot enumerate or read", async () => {
  await reportingSetup();
  const r = await sendReport();
  for (const actor of [B, C]) {
    await denied(rpc("haven_report_queue", {}, actor));
    await denied(rpc("haven_report_detail", { p_report_id: r.id }, actor));
    await denied(updateReport(r.id, 1, "in_review", null, actor));
  }
  await pool.query(
    "update haven_members.members set role='moderator' where id=$1",
    [C],
  );
  await denied(rpc("haven_report_queue", {}, C));
  await denied(rpc("haven_report_queue", {}, A, "aal1"));
  await denied(rpc("haven_report_detail", { p_report_id: r.id }, A, "aal1"));
  await denied(updateReport(r.id, 1, "in_review", null, A, "aal1"));
  const queue = await rpc("haven_report_queue");
  assert.equal(queue.reports.length, 1);
  assert.equal("details" in queue.reports[0], false);
  assert.equal("reporter_id" in queue.reports[0], false);
  const detail = await rpc("haven_report_detail", { p_report_id: r.id });
  assert.equal(detail.details, reportArgs().p_details);
  assert.equal("reporterId" in detail, false);
  await pool.query(
    "update haven_members.members set role='member' where id=$1",
    [A],
  );
  await denied(rpc("haven_report_detail", { p_report_id: r.id }));
});
test("report status transitions are audited, stale changes cannot overwrite, and closure preserves evidence", async () => {
  await reportingSetup();
  const r = await sendReport();
  await assert.rejects(
    updateReport(r.id, 1, "closed", "review_complete"),
    (e) => e.code === "22023",
  );
  const race = await Promise.allSettled([
    updateReport(r.id, 1, "in_review"),
    updateReport(r.id, 1, "in_review"),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.find((r) => r.status === "rejected").reason.code, "P0002");
  await assert.rejects(
    updateReport(r.id, 2, "closed"),
    (e) => e.code === "22023",
  );
  await updateReport(r.id, 2, "closed", "review_complete");
  assert.equal((await rpc("haven_report_queue")).reports.length, 0);
  const detail = await rpc("haven_report_detail", { p_report_id: r.id });
  assert.equal(detail.version, 3);
  assert.equal(detail.events.length, 3);
  assert.equal(detail.details, reportArgs().p_details);
  assert.equal(detail.status, "closed");
  const mine = await rpc("haven_my_reports", {}, B);
  assert.equal(mine.reports[0].resolution, "review_complete");
  assert.equal("events" in mine.reports[0], false);
  await assert.rejects(
    updateReport(r.id, 3, "in_review"),
    (e) => e.code === "22023",
  );
  const audit = await pool.query(
    "select actor_id,from_status,to_status from haven_members.report_events order by id",
  );
  assert.equal(audit.rows[0].actor_id, B);
  assert.equal(audit.rows[1].actor_id, A);
});
test("report tables and audit events have no client access; wrappers stay invokers", async () => {
  await reportingSetup();
  const r = await sendReport();
  for (const actor of [A, B])
    for (const sql of [
      "select * from haven_members.reports",
      "select * from haven_members.report_events",
      "delete from haven_members.report_events",
      "update haven_members.reports set status='closed'",
    ])
      await denied(asActor(actor, "aal2", sql));
  for (const role of ["anon", "service_role"])
    await denied(
      rpc("haven_report_detail", { p_report_id: r.id }, A, "aal2", role),
    );
  const procs = await pool.query(
    "select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('haven_submit_report','haven_my_reports','haven_report_queue','haven_report_detail','haven_review_report')",
  );
  assert.equal(procs.rows.length, 5);
  assert.ok(procs.rows.every((r) => !r.prosecdef));
  for (const table of ["reports", "report_events"])
    assert.equal(
      (
        await pool.query(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          [`haven_members.${table}`],
        )
      ).rows[0].relrowsecurity,
      true,
    );
});
