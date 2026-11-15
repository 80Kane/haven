import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../../lib/server";
import { entry } from "../../../lib/flow";
import { Closed, Unavailable } from "../../../app/components";
import { MemberNavigation } from "../../../app/member/navigation";
const resources = [
  {
    title: "Help right now",
    description:
      "Choose a way to contact crisis or emotional support directly. HavenForward is not an emergency service.",
    href: "https://havenforward.com/support",
    action: "Get help now",
  },
  {
    title: "Everyday practical needs",
    description:
      "Explore starting points for housing, food, employment, education, transportation, and veteran resources.",
    href: "https://havenforward.com/resources",
    action: "Browse the resource directory",
  },
  {
    title: "Recovery meetings & connection",
    description:
      "Explore different meeting finders and peer-support options. Check each provider’s eligibility, costs, and schedule.",
    href: "https://havenforward.com/support#meetings",
    action: "Explore recovery meetings",
  },
  {
    title: "Treatment information",
    description:
      "Find treatment-information and referral services. Confirm costs, availability, and eligibility with the provider.",
    href: "https://havenforward.com/support#substance-use",
    action: "Explore treatment resources",
  },
] as const;
export default async function ResourcesPage() {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await entry(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "invitation") redirect("/invitation");
  if (result.state !== "member") return <Unavailable />;
  return (
    <div className="member-shell">
      <MemberNavigation current="resources" member={result.member} />
      <div className="member-content">
        <section className="panel" aria-labelledby="resources-title">
          <p className="eyebrow">A practical next step</p>
          <h1 id="resources-title">Support beyond the screen.</h1>
          <p className="lead">Start with what matters to you today.</p>
          <p>
            These links open public HavenForward pages. No member account
            details or reflection answers are added to the links. The services
            listed there are independent of HavenForward.
          </p>
        </section>
        <section
          className="dashboard-section"
          aria-labelledby="resource-options"
        >
          <h2 id="resource-options">Find a starting point</h2>
          <ul className="member-resource-grid">
            {resources.map((resource) => (
              <li className="panel" key={resource.href}>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
                <a href={resource.href}>
                  {resource.action} <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel" aria-labelledby="resource-questions">
          <h2 id="resource-questions">Before you contact a provider</h2>
          <ul className="care-list">
            <li>
              Check who the service is for and whether it covers your location.
            </li>
            <li>
              Ask about hours, costs, access needs, and current availability.
            </li>
            <li>
              Share only what you choose to share; ask how your information will
              be used.
            </li>
          </ul>
          <p>
            A listing is a starting point, not a guaranteed appointment,
            benefit, or partnership.
          </p>
        </section>
      </div>
    </div>
  );
}
