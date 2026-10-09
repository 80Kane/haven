import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../lib/server";
import { entry } from "../../lib/flow";
import { Closed, SignOut, Unavailable } from "../components";
export default async function Invitation({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const current = await entry(client);
  if (current.state === "signed-out") redirect("/login");
  if (current.state === "member") redirect("/member");
  if (current.state === "unavailable") return <Unavailable />;
  const { notice } = await searchParams;
  return (
    <section className="panel">
      <p className="eyebrow">Invitation-only access</p>
      <h1>Complete your invitation.</h1>
      <p>
        Signing in does not grant membership. If you have a current invitation
        for this account, enter its code below. If your access was paused or
        removed, contact your pilot organizer.
      </p>
      {notice && (
        <p role="status" className="notice">
          {notice === "invalid"
            ? "We couldn't accept this invitation. It may be invalid, expired, already used, or intended for a different account."
            : "We couldn't complete your invitation. Please try again."}
        </p>
      )}
      <form method="post" action="/auth/redeem">
        <label htmlFor="token">Invitation code</label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          pattern="[a-f0-9]{64}"
          minLength={64}
          maxLength={64}
          required
        />
        <input type="hidden" name="consentVersion" value="member-v1" />
        <label className="check">
          <input name="consent" type="checkbox" value="yes" required />
          <span>
            I choose to join the HavenForward development pilot. I understand it
            is not emergency care and that invited membership is separate from
            email updates.
          </span>
        </label>
        <p className="small">
          Development consent wording is awaiting owner review. Only synthetic
          test accounts should join at this stage.
        </p>
        <button>Accept invitation</button>
      </form>
      <SignOut />
    </section>
  );
}
