import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../lib/server";
import { entry } from "../../lib/flow";
import { Closed, SignOut, Unavailable } from "../components";
export default async function MemberPage() {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const result = await entry(client);
  if (result.state === "signed-out") redirect("/login");
  if (result.state === "invitation") redirect("/invitation");
  if (result.state !== "member") return <Unavailable />;
  return (
    <>
      <section className="panel">
        <p className="eyebrow">Your private starting point</p>
        <h1>Welcome to HavenForward.</h1>
        <p>You have active access to the member pilot.</p>
        <dl>
          <dt>Membership</dt>
          <dd>Active</dd>
          <dt>Access role</dt>
          <dd>{result.member.role}</dd>
        </dl>
        <p>
          The community is being prepared. Circles, posts, journals, and
          messages are not available here yet.
        </p>
        <SignOut />
      </section>
      <section className="note">
        <h2>Move forward at your own pace.</h2>
        <p>
          Your voice and your choices matter. This pilot is a starting point for
          peer connection and does not provide emergency response.
        </p>
      </section>
    </>
  );
}
