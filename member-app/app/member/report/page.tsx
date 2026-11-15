import { redirect } from "next/navigation";
import { serverClient } from "../../../lib/server";
import { reportingConfig } from "../../../lib/report-server";
import {
  myReports,
  reportCategories,
  reportStatuses,
  reportResolutions,
} from "../../../lib/reports";
import { circles, findCircle } from "../../../lib/circles";
import { Unavailable } from "../../components";
import { MemberNavigation } from "../navigation";
const notices: Record<string, string> = {
  received: "Your report has been received. You can check its status below.",
  invalid:
    "We couldn’t send that report. Check the fields and acknowledgement, then try again.",
  limited:
    "You’ve reached the limit of five reports in 24 hours. This form is not an emergency service.",
  unavailable:
    "We couldn’t confirm that report. Check your recent reports before trying again.",
};
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; circle?: string }>;
}) {
  const config = reportingConfig();
  if (!config)
    return (
      <section className="panel">
        <h1>Reporting is not open yet.</h1>
        <p>
          Public support resources remain available. This website is not
          monitored for emergencies.
        </p>
        <a href="https://havenforward.com/support">Get help now</a>
      </section>
    );
  const { client } = await serverClient(config);
  const access = await myReports(client);
  if (access.state === "signed-out") redirect("/login");
  if (access.state === "invitation") redirect("/invitation");
  if (access.state !== "ready") return <Unavailable />;
  const params = await searchParams;
  const selected =
    params.circle && findCircle(params.circle) ? params.circle : "";
  return (
    <div className="member-shell">
      <MemberNavigation current="report" member={access.member} />
      <div className="member-content">
        <section className="panel" aria-labelledby="report-heading">
          <p className="eyebrow">A concern deserves care</p>
          <h1 id="report-heading">Report a concern</h1>
          <p>
            This form is for concerns about the HavenForward pilot. Reports are
            linked to your member account. Authorized administrators can read
            what you submit.
          </p>
          <p className="notice">
            <strong>This is not emergency support.</strong> Reports are not
            monitored continuously, and no response time is promised. For
            immediate danger call 911; for emotional distress call or text 988.{" "}
            <a href="https://havenforward.com/support">Get help now</a>.
          </p>
          {params.notice && (
            <p role="status">
              {Object.hasOwn(notices, params.notice)
                ? notices[params.notice]
                : notices.unavailable}
            </p>
          )}
          <form method="post" action="/member/report/submit">
            <input
              type="hidden"
              name="submissionKey"
              value={crypto.randomUUID()}
            />
            <label htmlFor="category">What kind of concern?</label>
            <select id="category" name="category" required>
              <option value="">Choose a category</option>
              {Object.entries(reportCategories).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="circle">Related Circle (optional)</label>
            <select id="circle" name="circle" defaultValue={selected}>
              <option value="">General pilot concern</option>
              {circles.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
            <label htmlFor="details">
              What would you like an administrator to know?
            </label>
            <textarea
              id="details"
              name="details"
              required
              minLength={10}
              maxLength={1000}
              rows={7}
              aria-describedby="report-details-help"
            />
            <p id="report-details-help" className="small field-help">
              Use 10–1,000 characters. Include only what is needed to understand
              the concern. Leave out passwords, invitation codes, medical
              records and unnecessary identifying details. Attachments are not
              accepted.
            </p>
            <label className="check">
              <input type="checkbox" name="acknowledge" value="yes" required />
              <span>
                I understand this report is linked to my account, can be read by
                authorized administrators, and is not an emergency contact.
              </span>
            </label>
            <button>Send report</button>
          </form>
          <p className="small">
            Conversations and posting are still closed. This form does not
            create a public post.{" "}
            <a href="https://havenforward.com/privacy">
              Read the privacy information
            </a>
            .
          </p>
        </section>
        <section
          className="panel report-history"
          aria-labelledby="my-reports-heading"
        >
          <h2 id="my-reports-heading">Your recent reports</h2>
          <p className="small">
            Your ten most recent reports. This view shows statuses, not other
            people’s reports or internal review activity.
          </p>
          {access.reports.length ? (
            <ul className="report-list">
              {access.reports.map((report) => (
                <li key={report.id}>
                  <h3>{reportCategories[report.category]}</h3>
                  <p>
                    <strong>{reportStatuses[report.status]}</strong>
                    {report.resolution
                      ? ` · ${reportResolutions[report.resolution]}`
                      : ""}
                  </p>
                  <p className="small">
                    {report.circle
                      ? findCircle(report.circle)?.title
                      : "General pilot concern"}{" "}
                    ·{" "}
                    <time dateTime={report.createdAt}>
                      {new Date(report.createdAt).toLocaleString("en-US", {
                        timeZone: "UTC",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      UTC
                    </time>
                  </p>
                  <p className="small report-reference">
                    Reference: {report.id}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>You haven’t submitted a report yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
