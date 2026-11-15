import { redirect } from "next/navigation";
import { reportAdminConfig } from "../../../lib/report-server";
import { serverClient } from "../../../lib/server";
import {
  reportQueue,
  reportCategories,
  reportStatuses,
} from "../../../lib/reports";
import { findCircle } from "../../../lib/circles";
import { Closed, SignOut, Unavailable } from "../../components";
export default async function ReportsPage() {
  const config = reportAdminConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await reportQueue(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "mfa") redirect("/admin/mfa");
  if (result.state === "unavailable") return <Unavailable />;
  if (result.state !== "ready")
    return (
      <section className="panel">
        <h1>Administrator access is required.</h1>
        <SignOut />
      </section>
    );
  return (
    <section className="panel">
      <a href="/admin">← Administrator tools</a>
      <p className="eyebrow">Private administrator review</p>
      <h1>Review member reports</h1>
      <p>
        Up to 25 unresolved reports, oldest first. Closed reports leave this
        queue. Refresh to see new reports.
      </p>
      <p>
        Reports are not monitored continuously. Follow the pilot safety
        procedure; a report status is not an emergency response or a
        disciplinary action.
      </p>
      {result.reports.length ? (
        <ol className="report-list">
          {result.reports.map((r) => (
            <li key={r.id}>
              <h2>
                <a href={`/admin/reports/${r.id}`}>
                  {reportCategories[r.category]}
                </a>
              </h2>
              <p>
                {reportStatuses[r.status]} ·{" "}
                {r.circle
                  ? findCircle(r.circle)?.title
                  : "General pilot concern"}
              </p>
              <p className="small">
                <time dateTime={r.createdAt}>
                  {new Date(r.createdAt).toLocaleString("en-US", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  UTC
                </time>
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>No unresolved reports.</p>
      )}
      <a className="button" href="/admin/reports">
        Refresh queue
      </a>
      <SignOut />
    </section>
  );
}
