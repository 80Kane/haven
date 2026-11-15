import test from "node:test";
import assert from "node:assert/strict";
import {
  validReportInput,
  submitReport,
  myReports,
  reportQueue,
  reportDetail,
  reviewReport,
} from "../lib/reports";
import { reportingAppConfig } from "../lib/config";
import { readForm } from "../lib/request";
import type { Provider } from "../lib/flow";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
function fixture(
  role = "member",
  aal = "aal1",
  opts: {
    error?: string;
    otherOwner?: boolean;
    suspended?: boolean;
    badDetail?: boolean;
  } = {},
) {
  const calls: { name: string; args?: unknown }[] = [];
  const report = {
    id,
    category: "privacy",
    circle: null,
    status: "open",
    resolution: null,
    createdAt: "2026-11-15T00:00:00Z",
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id,
            email: "fixture@example.test",
            email_confirmed_at: "2026-01-01",
            is_anonymous: false,
          },
        },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: aal },
          error: null,
        }),
      },
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "haven_member_self")
        return {
          data: { id, role, status: "active", consentVersion: "member-v1" },
          error: opts.suspended ? { code: "42501" } : null,
        };
      if (opts.error)
        return { data: null, error: { code: opts.error, message: "PRIVATE" } };
      return {
        error: null,
        data:
          name === "haven_submit_report"
            ? { id, status: "open" }
            : name === "haven_my_reports"
              ? { memberId: opts.otherOwner ? other : id, reports: [report] }
              : name === "haven_report_queue"
                ? { reports: [report] }
                : name === "haven_report_detail"
                  ? {
                      ...report,
                      id: opts.badDetail ? other : id,
                      details: "Synthetic concern",
                      version: 1,
                      events: [
                        {
                          from: null,
                          to: "open",
                          resolution: null,
                          createdAt: report.createdAt,
                        },
                      ],
                    }
                  : { updated: true },
      };
    },
  } as unknown as Provider;
  return { client, calls };
}
const form = () =>
  new URLSearchParams({
    submissionKey: id,
    circle: "",
    category: "privacy",
    details: "A synthetic concern for review.",
    acknowledge: "yes",
  });
test("report inputs reject unknown values, control characters and oversized text; flag defaults closed", () => {
  assert.equal(
    validReportInput(id, "choices-change", "privacy", "A useful concern."),
    true,
  );
  for (const args of [
    [id, "__proto__", "privacy", "A useful concern."],
    [id, "", "constructor", "A useful concern."],
    [id, "", "privacy", "tiny"],
    [id, "", "privacy", "a".repeat(1001)],
    [id, "", "privacy", "hidden\u202e direction"],
  ])
    assert.equal(
      validReportInput(...(args as [string, string, string, string])),
      false,
    );
  assert.equal(reportingAppConfig({}), null);
});
test("report submission needs consent and current membership and never supplies an actor ID", async () => {
  const f = fixture();
  const missing = form();
  missing.delete("acknowledge");
  assert.equal(await submitReport(f.client, missing), "invalid");
  assert.equal(
    f.calls.some((c) => c.name === "haven_submit_report"),
    false,
  );
  assert.equal(await submitReport(f.client, form()), "received");
  const call = f.calls.find((c) => c.name === "haven_submit_report")!;
  assert.deepEqual(Object.keys(call.args as object).sort(), [
    "p_category",
    "p_circle_slug",
    "p_details",
    "p_submission_key",
  ]);
  assert.equal(
    await submitReport(
      fixture("member", "aal1", { suspended: true }).client,
      form(),
    ),
    "invitation",
  );
  assert.equal(
    await submitReport(
      fixture("member", "aal1", { error: "P0003" }).client,
      form(),
    ),
    "limited",
  );
});
test("report reads are caller-bound and review is denied to ordinary members, moderators and password-only admins", async () => {
  assert.equal((await myReports(fixture().client)).state, "ready");
  assert.equal(
    (await myReports(fixture("member", "aal1", { otherOwner: true }).client))
      .state,
    "unavailable",
  );
  for (const [role, aal] of [
    ["member", "aal2"],
    ["moderator", "aal2"],
    ["admin", "aal1"],
  ]) {
    const f = fixture(role, aal);
    assert.notEqual((await reportQueue(f.client)).state, "ready");
    assert.notEqual((await reportDetail(f.client, id)).state, "ready");
    assert.equal(
      f.calls.some((c) => c.name.startsWith("haven_report_")),
      false,
    );
  }
  assert.equal(
    (await reportQueue(fixture("admin", "aal2").client)).state,
    "ready",
  );
  assert.equal(
    (
      await reportDetail(
        fixture("admin", "aal2", { badDetail: true }).client,
        id,
      )
    ).state,
    "unavailable",
  );
});
test("review validation checks IDs, versions and outcomes; stale updates stay neutral", async () => {
  const f = fixture("admin", "aal2");
  const update = new URLSearchParams({
    reportId: id,
    version: "1",
    status: "in_review",
  });
  assert.equal(await reviewReport(f.client, update), "updated");
  update.set("status", "closed");
  assert.equal(await reviewReport(f.client, update), "invalid");
  update.set("resolution", "review_complete");
  assert.equal(
    await reviewReport(
      fixture("admin", "aal2", { error: "P0002" }).client,
      update,
    ),
    "stale",
  );
  update.set("version", "-1");
  assert.equal(await reviewReport(f.client, update), "invalid");
});
test("report forms allow bounded international text without weakening the default form boundary", async () => {
  const config = {
    origin: "https://member.example.test",
    url: "https://fixture.supabase.co",
    key: "sb_publishable_fixture",
    secure: true,
  };
  const request = () =>
    new Request(config.origin + "/member/report/submit", {
      method: "POST",
      headers: {
        origin: config.origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ details: "🙂".repeat(900) }),
    });
  assert.equal(await readForm(request(), config, ["details"]), null);
  assert.ok(await readForm(request(), config, ["details"], 16384));
  assert.equal(await readForm(request(), config, ["details"], 999999), null);
});
