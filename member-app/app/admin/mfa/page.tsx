import { redirect } from "next/navigation";
import { serverClient } from "../../../lib/server";
import { adminConfig } from "../../../lib/admin-server";
import { adminAccess, adminFactors } from "../../../lib/admin";
import { Closed, SignOut, Unavailable } from "../../components";
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const config = adminConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const access = await adminAccess(client, false);
  if (access === "signed-out") redirect("/login");
  if (access === "unavailable") return <Unavailable />;
  if (access !== "admin") redirect("/member");
  const assurance = await adminAccess(client);
  if (assurance === "admin") redirect("/admin");
  if (assurance !== "mfa") return <Unavailable />;
  let factors;
  try {
    factors = await adminFactors(client);
  } catch {
    return <Unavailable />;
  }
  const verified = factors.filter((f) => f.status === "verified");
  const pending = factors.filter((f) => f.status === "unverified");
  const choices = verified.length ? verified : pending;
  return (
    <section className="panel">
      <p className="eyebrow">Administrator verification</p>
      <h1>Verify with your authenticator.</h1>
      <p>
        Administrator invitation changes require a code from your authenticator
        app in addition to your password.
      </p>
      {(await searchParams).notice && (
        <p role="status">
          We couldn't verify that request. Use a current code from your
          authenticator and try again.
        </p>
      )}
      {choices.length > 0 && (
        <form method="post" action="/admin/mfa/verify">
          <label htmlFor="factorId">Authenticator</label>
          <select id="factorId" name="factorId">
            {choices.map((f) => (
              <option key={f.id} value={f.id}>
                {f.friendly_name || "Authenticator"}
              </option>
            ))}
          </select>
          <label htmlFor="code">Six-digit authenticator code</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
          />
          <button>Verify authenticator</button>
        </form>
      )}
      {!verified.length && (
        <>
          <p>
            {pending.length
              ? "If you lost the setup screen before saving its key, restart setup to replace your unfinished authenticator."
              : "Set up an authenticator app before creating invitations."}
          </p>
          <form method="post" action="/admin/mfa/enroll">
            <button>
              {pending.length
                ? "Restart authenticator setup"
                : "Set up authenticator"}
            </button>
          </form>
        </>
      )}
      <p>
        If you lose an enrolled authenticator, contact the staging operator.
        Recovery is not available in these screens.
      </p>
      <SignOut />
    </section>
  );
}
