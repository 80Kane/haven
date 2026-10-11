import { redirect } from "next/navigation";
import { serverClient } from "../../lib/server";
import { adminConfig } from "../../lib/admin-server";
import { adminAccess } from "../../lib/admin";
import { Closed, SignOut, Unavailable } from "../components";
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const config = adminConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const access = await adminAccess(client);
  if (access === "signed-out") redirect("/login");
  if (access === "mfa") redirect("/admin/mfa");
  if (access === "unavailable") return <Unavailable />;
  if (access !== "admin")
    return (
      <section className="panel">
        <h1>Administrator access is required.</h1>
        <p>Your account cannot use these tools.</p>
        <SignOut />
      </section>
    );
  const notice = (await searchParams).notice;
  return (
    <section className="panel">
      <p className="eyebrow">Staging administrator</p>
      <h1>Manage invitations.</h1>
      <p>
        Create invitation codes for prepared fictional test accounts. Account
        creation and password recovery are managed separately.
      </p>
      {notice && (
        <p role="status">
          {notice === "revoked"
            ? "Revocation request completed. Unused invitations with this ID are now revoked."
            : "We couldn't complete that request. Check your details and authenticator verification, then try again."}
        </p>
      )}
      <form method="post" action="/admin/invitations/issue">
        <label htmlFor="email">Recipient test email (@example.test)</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
        />
        <label htmlFor="hours">Expires in hours</label>
        <input
          id="hours"
          name="hours"
          type="number"
          min="1"
          max="168"
          defaultValue="24"
          required
        />
        <button>Create invitation</button>
      </form>
      <h2>Revoke an unused invitation</h2>
      <p>
        Use the invitation ID saved when you created its code. A used invitation
        cannot be undone here.
      </p>
      <form method="post" action="/admin/invitations/revoke">
        <label htmlFor="invitationId">Invitation ID</label>
        <input
          id="invitationId"
          name="invitationId"
          required
          maxLength={36}
          autoComplete="off"
        />
        <button className="secondary">Revoke invitation</button>
      </form>
      <SignOut />
    </section>
  );
}
