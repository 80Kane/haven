import { serverClient } from "../../../../lib/server";
import { adminConfig } from "../../../../lib/admin-server";
import { readForm } from "../../../../lib/request";
import { adminAccess, adminFactors } from "../../../../lib/admin";
import { privateHtml } from "../../../../lib/private-html";
import { setupMarkup } from "../../../../lib/mfa-setup";
function unavailable(
  stage:
    | "list_factors"
    | "remove_pending"
    | "provider_enroll"
    | "invalid_result"
    | "render_result",
) {
  console.error(`Member MFA enrollment: ${stage}`);
  return new Response("Authenticator setup is unavailable.", { status: 503 });
}
export async function POST(request: Request) {
  const config = adminConfig();
  if (!config)
    return new Response("Member administrator access is not available yet.", {
      status: 503,
    });
  if (!(await readForm(request, config, [])))
    return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  if ((await adminAccess(client, false)) !== "admin")
    return new Response("Access denied", { status: 403 });
  let stage:
    "list_factors" | "remove_pending" | "provider_enroll" | "render_result" =
    "list_factors";
  try {
    const factors = await adminFactors(client);
    if (factors.some((f) => f.status === "verified"))
      return new Response("Use your existing authenticator.", { status: 409 });
    // Only remove this authenticated user's unfinished TOTP enrollments.
    for (const factor of factors.filter((f) => f.status === "unverified")) {
      stage = "remove_pending";
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) return unavailable("remove_pending");
    }
    stage = "provider_enroll";
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "HavenForward staging",
      issuer: "HavenForward",
    });
    if (error) return unavailable("provider_enroll");
    stage = "render_result";
    const setup = setupMarkup(data);
    if (!setup) return unavailable("invalid_result");
    if (!setup.qrAvailable) console.warn("Member MFA enrollment: qr_fallback");
    return privateHtml("Set up your authenticator", setup.markup);
  } catch {
    return unavailable(stage);
  }
}
