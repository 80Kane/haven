import { redirect, notFound } from "next/navigation";
import { reportAdminConfig } from "../../../../lib/report-server";
import { serverClient } from "../../../../lib/server";
import {
  reportDetail,
  reportCategories,
  reportStatuses,
  reportResolutions,
} from "../../../../lib/reports";
import { findCircle } from "../../../../lib/circles";
import { Closed, SignOut, Unavailable } from "../../../components";
export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const config = reportAdminConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await reportDetail(client, (await params).id);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "mfa") redirect("/admin/mfa");
  if (result.state === "unavailable") return <Unavailable />;
  if (result.state === "missing") notFound();
  if (result.state !== "ready")
    return (
      <section className="panel">
        <h1>Administrator access is required.</h1>
        <SignOut />
      </section>
    );
  const r = result.report;
  const notice = (await searchParams).notice;
  return (
    <section className="panel">
      <a href="/admin/reports">← Back to report queue</a>
      <p className="eyebrow">Private report</p>
      <h1>{reportCategories[r.category]}</h1>
      <p>
        <strong>{reportStatuses[r.status]}</strong> ·{" "}
        {r.circle ? findCircle(r.circle)?.title : "General pilot concern"}
      </p>
      <p className="small report-reference">Reference: {r.id}</p>
      {notice && (
        <p role="status">
          {notice === "updated"
            ? "Report status updated."
            : notice === "stale"
              ? "This report changed while you were reviewing it. Refresh and review the current status before trying again."
              : "We couldn’t update that report. Refresh and check your administrator verification."}
        </p>
      )}
      <h2>Submitted concern</h2>
      <p className="report-details">{r.details}</p>
      <p className="small">
        Account identifiers and emails are intentionally omitted from this
        review screen. The report remains linked internally to its submitting
        account.
      </p>
      {r.status !== "closed" && (
        <form method="post" action="/admin/reports/update">
          <input type="hidden" name="reportId" value={r.id} />
          <input type="hidden" name="version" value={r.version} />
          <input
            type="hidden"
            name="status"
            value={r.status === "open" ? "in_review" : "closed"}
          />
          {r.status === "in_review" && (
            <>
              <label htmlFor="resolution">
                Review outcome (visible to the submitting member)
              </label>
              <select name="resolution" id="resolution" required>
                <option value="">Choose an outcome</option>
                {Object.entries(reportResolutions).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
          <button>
            {r.status === "open" ? "Start review" : "Close report"}
          </button>
        </form>
      )}
      {r.resolution && <p>Outcome: {reportResolutions[r.resolution]}</p>}
      <h2>Status history</h2>
      <ol className="report-list">
        {r.events.map((e, i) => (
          <li key={i}>
            {reportStatuses[e.to as keyof typeof reportStatuses]} ·{" "}
            <time dateTime={e.createdAt}>
              {new Date(e.createdAt).toLocaleString("en-US", {
                timeZone: "UTC",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              UTC
            </time>
          </li>
        ))}
      </ol>
      <p>
        Changes are recorded in the private audit trail. This screen cannot edit
        or delete submitted text or audit events. Closing a report does not
        suspend anyone or remove content.
      </p>
      <SignOut />
    </section>
  );
}
