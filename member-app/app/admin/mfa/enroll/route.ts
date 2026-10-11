import { serverClient } from "../../../../lib/server";
import { adminConfig } from "../../../../lib/admin-server";
import { readForm } from "../../../../lib/request";
import { adminAccess, adminFactors, uuid } from "../../../../lib/admin";
import { privateHtml, escapeHtml as e } from "../../../../lib/private-html";
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
  try {
    const factors = await adminFactors(client);
    if (factors.some((f) => f.status === "verified"))
      return new Response("Use your existing authenticator.", { status: 409 });
    // Only remove this authenticated user's unfinished TOTP enrollments.
    for (const factor of factors.filter((f) => f.status === "unverified")) {
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error)
        return new Response("Authenticator setup is unavailable.", {
          status: 503,
        });
    }
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "HavenForward staging",
      issuer: "HavenForward",
    });
    if (
      error ||
      !data ||
      !uuid.test(data.id) ||
      !data.totp?.secret ||
      !data.totp.qr_code?.startsWith("data:image/svg+xml;utf-8,") ||
      data.totp.qr_code.length > 100000
    )
      return new Response("Authenticator setup is unavailable.", {
        status: 503,
      });
    return privateHtml(
      "Set up your authenticator",
      `<p>Scan this QR code with your authenticator app, or enter the setup key manually. Keep the key private.</p><img width="240" height="240" alt="Authenticator setup QR code" src="${e("data:image/svg+xml;charset=utf-8," + encodeURIComponent(data.totp.qr_code.slice("data:image/svg+xml;utf-8,".length)))}"><p>Manual setup key: <code>${e(data.totp.secret)}</code></p><form method="post" action="/admin/mfa/verify"><input type="hidden" name="factorId" value="${e(data.id)}"><label for="code">Six-digit authenticator code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required><button>Verify authenticator</button></form><p>Save the setup key in your authenticator before leaving this screen. Reloading this POST can restart setup.</p>`,
    );
  } catch {
    return new Response("Authenticator setup is unavailable.", { status: 503 });
  }
}
