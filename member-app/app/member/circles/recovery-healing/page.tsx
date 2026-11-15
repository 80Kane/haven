import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../../../lib/server";
import { entry } from "../../../../lib/flow";
import { Closed, Unavailable } from "../../../components";
import { CircleMark, MemberNavigation } from "../../navigation";

export default async function RecoveryCirclePage() {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await entry(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "invitation") redirect("/invitation");
  if (result.state !== "member") return <Unavailable />;
  return (
    <div className="member-shell">
      <MemberNavigation current="circle" member={result.member} />
      <div className="member-content">
        <a className="back-link" href="/member">
          ← Back to your home
        </a>
        <section
          className="circle-hero tone-sage"
          aria-labelledby="circle-title"
        >
          <span className="circle-mark">
            <CircleMark kind="leaf" />
          </span>
          <p className="eyebrow">Circle preview</p>
          <h1 id="circle-title">Recovery &amp; Healing</h1>
          <p className="lead">Different journeys. Room for yours.</p>
          <p>
            A space being prepared for shared experience, encouragement, and
            recovery in its many forms. You choose what to share, and listening
            can be participation too.
          </p>
        </section>
        <div className="member-notice">
          <p>
            <strong>This Circle is a preview.</strong> Conversations and posting
            aren’t open yet.
          </p>
        </div>
        <div className="circle-columns">
          <section
            className="panel reflection-panel"
            aria-labelledby="reflection-title"
          >
            <p className="eyebrow">Something to sit with</p>
            <h2 id="reflection-title">One small step is still a step.</h2>
            <blockquote>
              What does moving forward at your own pace look like for you this
              week?
            </blockquote>
            <p>
              There’s no answer to submit. Take a moment for yourself, or carry
              the question into a conversation with someone you trust.
            </p>
          </section>
          <section className="panel" aria-labelledby="care-title">
            <p className="eyebrow">How we show up</p>
            <h2 id="care-title">Connection with care.</h2>
            <ul className="care-list">
              <li>Speak from your own experience.</li>
              <li>Ask before offering advice.</li>
              <li>Respect different paths and boundaries.</li>
              <li>Protect other people’s privacy.</li>
            </ul>
            <a href="https://havenforward.com/guidelines">
              Read the community guidelines <span aria-hidden="true">↗</span>
            </a>
          </section>
        </div>
        <section className="resource-panel" aria-labelledby="circle-resources">
          <h2 id="circle-resources">Looking for practical support?</h2>
          <p>
            Our public resource directory offers starting points. Peer
            connection does not replace professional care or emergency services,
            and Circle moderation isn’t emergency support.
          </p>
          <a className="button" href="https://havenforward.com/resources">
            Explore support resources <span aria-hidden="true">↗</span>
          </a>
        </section>
      </div>
    </div>
  );
}
