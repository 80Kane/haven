import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../../lib/server";
import { entry } from "../../../lib/flow";
import { Closed, Unavailable } from "../../../app/components";
import { MemberNavigation } from "../../../app/member/navigation";
export default async function LearningPage() {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await entry(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "invitation") redirect("/invitation");
  if (result.state !== "member") return <Unavailable />;
  return (
    <div className="member-shell">
      <MemberNavigation current="learning" member={result.member} />
      <div className="member-content">
        <section className="welcome-panel" aria-labelledby="learning-heading">
          <div>
            <p className="eyebrow">Room to grow</p>
            <h1 id="learning-heading">Learning, at your pace.</h1>
            <p className="lead">Space to reflect. Freedom to choose.</p>
            <p>
              The course library is in preparation. You can explore the original
              reflection prompts in the Circle previews today, without
              submitting an answer.
            </p>
            <a className="button" href="/member/circles">
              Explore Circle reflections <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <span>
              One question.
              <br />
              Your own direction.
            </span>
          </div>
        </section>
        <div className="member-notice">
          <p>
            <strong>Library in preparation.</strong> No courses, videos,
            downloads, enrollment, certificates, or progress tracking are
            available yet.
          </p>
        </div>
        <div className="dashboard-bottom">
          <section className="panel" aria-labelledby="learning-choice">
            <h2 id="learning-choice">Choose a place to begin</h2>
            <ul className="learning-links">
              <li>
                <a href="/member/circles/choices-change">
                  Reflect on choices &amp; change
                </a>
              </li>
              <li>
                <a href="/member/circles/purpose-personal-growth">
                  Explore purpose &amp; personal growth
                </a>
              </li>
              <li>
                <a href="/member/circles/reentry-new-beginnings">
                  Consider a new beginning
                </a>
              </li>
            </ul>
            <p>
              You can skip a prompt, revisit it, or simply read. There is no
              score or required pace.
            </p>
          </section>
          <section className="panel" aria-labelledby="learning-care">
            <h2 id="learning-care">A library built with care</h2>
            <p>
              We’ll share only materials we own or have documented permission to
              publish. K.E.Y.S. and CEO Hockley materials require specific
              publishing permission before they appear here.
            </p>
            <p>
              Planned formats include captioned video, audio with transcripts,
              and accessible worksheets. Each published item will identify its
              creator and format.
            </p>
            <a href="/member/settings">Review your profile &amp; privacy</a>
          </section>
        </div>
      </div>
    </div>
  );
}
