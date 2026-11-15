import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../../../lib/server";
import { entry } from "../../../../lib/flow";
import { Closed, Unavailable } from "../../../../app/components";
import { MemberNavigation } from "../../../../app/member/navigation";
import { notFound } from "next/navigation";
import { findCircle, circles } from "../../../../lib/circles";
import { CircleMark } from "../../navigation";
export default async function CirclePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await entry(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "invitation") redirect("/invitation");
  if (result.state !== "member") return <Unavailable />;
  const circle = findCircle((await params).slug);
  if (!circle) notFound();
  return (
    <div className="member-shell">
      <MemberNavigation current="circle" member={result.member} />
      <div className="member-content">
        <a className="back-link" href="/member/circles">
          ← Back to all Circles
        </a>
        <section
          className={`circle-hero tone-${circle.tone}`}
          aria-labelledby="circle-title"
        >
          <span className="circle-mark">
            <CircleMark kind={circle.kind} />
          </span>
          <p className="eyebrow">Circle preview</p>
          <h1 id="circle-title">{circle.title}</h1>
          <p className="lead">{circle.lead}</p>
          <p>{circle.introduction}</p>
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
            <h2 id="reflection-title">{circle.reflectionTitle}</h2>
            <blockquote>{circle.prompt}</blockquote>
            <p>
              There’s no answer to submit. Take a moment for yourself, or carry
              the question into a conversation with someone you trust.
            </p>
            <details className="reflection-details">
              <summary>A few ways to explore this</summary>
              <ul className="care-list">
                {circle.considerations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="small">
                You can skip any prompt. Nothing you reflect on here is
                collected or saved by this page.
              </p>
            </details>
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
            Explore starting points for support beyond HavenForward. Peer
            connection does not replace professional care or emergency services,
            and Circle moderation isn’t emergency support.
          </p>
          <a className="button" href="/member/resources">
            Explore support resources <span aria-hidden="true">→</span>
          </a>
        </section>
        <nav className="related-circles" aria-label="Other Circle previews">
          <h2>Explore another Circle</h2>
          <ul>
            {circles
              .filter((item) => item.slug !== circle.slug)
              .map((item) => (
                <li key={item.slug}>
                  <a href={`/member/circles/${item.slug}`}>{item.title}</a>
                </li>
              ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
