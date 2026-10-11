import { NextResponse } from "next/server";
import { serverClient } from "../../../../lib/server";
import { adminConfig } from "../../../../lib/admin-server";
import { readForm } from "../../../../lib/request";
import { issueInvitation } from "../../../../lib/admin";
import { privateHtml, escapeHtml as e } from "../../../../lib/private-html";
export async function POST(request: Request) {
  const config = adminConfig();
  if (!config)
    return new Response("Member administrator access is not available yet.", {
      status: 503,
    });
  const form = await readForm(request, config, ["email", "hours"]);
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  const result = await issueInvitation(
    client,
    form.get("email") || "",
    form.get("hours") || "",
  );
  if (result.state !== "issued")
    return NextResponse.redirect(
      new URL("/admin?notice=failed", config.origin),
      303,
    );
  return privateHtml(
    "Invitation created",
    `<p>Copy this code now. It is not emailed automatically and cannot be retrieved later. Give it only to the intended test account.</p><dl><dt>Recipient</dt><dd>${e(result.email)}</dd><dt>Invitation code</dt><dd><code>${e(result.token)}</code></dd><dt>Invitation ID</dt><dd><code>${e(result.id)}</code></dd><dt>Expires at (UTC)</dt><dd>${e(result.expiresAt)}</dd></dl><p>Save the invitation ID if you need to revoke it. Reloading this POST can create another invitation; return to the tools page instead.</p>`,
  );
}
