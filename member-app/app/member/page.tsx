import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../lib/server";
import { entry } from "../../lib/flow";
import { Closed, Unavailable } from "../components";
import { MemberNavigation } from "./navigation";
import { CircleCards } from "./circle-cards";

export default async function MemberPage() {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await entry(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "invitation") redirect("/invitation");
  if (result.state !== "member") return <Unavailable />;
  return (
    <div className="member-shell">
      <MemberNavigation current="home" member={result.member} />
      <div className="member-content">
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div>
            <p className="eyebrow">Your private starting point</p>
            <h1 id="welcome-title">Welcome to HavenForward.</h1>
            <p className="lead">
              You don’t have to have it all figured out to belong.
            </p>
            <p>You have active access to the member pilot.</p>
            <a className="button" href="/member/circles">
              Explore the Circle previews <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <span>
              A little connection.
              <br />A way forward.
            </span>
          </div>
        </section>

        <div className="member-notice">
          <span className="status-dot" aria-hidden="true" />
          <p>
            <strong>A community taking shape.</strong> Explore the Circle
            previews and support resources. Conversations, posting, messages,
            and journals aren’t open yet.
          </p>
        </div>

        <section className="dashboard-section" aria-labelledby="circles-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Connection, on your terms</p>
              <h2 id="circles-title">Find a space that speaks to you.</h2>
            </div>
            <span className="small">Seven Circle previews</span>
          </div>
          <CircleCards />
        </section>

        <div className="dashboard-bottom">
          <section className="resource-panel" aria-labelledby="resource-title">
            <p className="eyebrow">A practical next step</p>
            <h2 id="resource-title">Support beyond the screen.</h2>
            <p>
              Explore housing, recovery, employment, and veteran resources.
              Confirm eligibility and availability with each provider.
            </p>
            <a href="/member/resources" className="button">
              Find support resources <span aria-hidden="true">↗</span>
            </a>
          </section>
          <section className="learning-panel" aria-labelledby="learning-title">
            <p className="eyebrow">Room to grow</p>
            <h2 id="learning-title">Learning, at your pace.</h2>
            <p>
              Courses, videos, and worksheets are planned. We’ll share only
              material we own or have documented permission to publish, with
              captioned video, audio transcripts, and accessible PDFs. When the
              library is ready, you’ll find it here.
            </p>
            <a href="/member/learning">
              Explore the Learning page <span aria-hidden="true">→</span>
            </a>
          </section>
        </div>
        <p className="member-closing">
          Peer voice. Peer choice. Take the next step that feels right for you.
        </p>
      </div>
    </div>
  );
}
