import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../../lib/server";
import { entry } from "../../../lib/flow";
import { Closed, Unavailable } from "../../../app/components";
import { MemberNavigation } from "../../../app/member/navigation";
import { CircleCards } from "../circle-cards";
export default async function CirclesPage() {
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
        <section className="panel" aria-labelledby="circles-heading">
          <p className="eyebrow">Connection, on your terms</p>
          <h1 id="circles-heading">Find your Circle.</h1>
          <p className="lead">Different experiences. Room to belong.</p>
          <p>
            Explore seven spaces being prepared for peer connection. You can
            take your time, return to a familiar space, or explore something
            new.
          </p>
        </section>
        <div className="member-notice">
          <p>
            <strong>Circle previews.</strong> These pages offer introductions
            and optional reflection prompts. Conversations, posting, joining,
            and member lists aren’t open yet.
          </p>
        </div>
        <section className="dashboard-section" aria-labelledby="spaces-heading">
          <h2 id="spaces-heading">Choose a space to explore</h2>
          <CircleCards />
        </section>
      </div>
    </div>
  );
}
