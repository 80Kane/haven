import { NextResponse } from "next/server";
import { serverClient } from "../../../../lib/server";
import { adminConfig } from "../../../../lib/admin-server";
import { readForm } from "../../../../lib/request";
import { revokeInvitation } from "../../../../lib/admin";
export async function POST(request: Request) {
  const config = adminConfig();
  if (!config)
    return new Response("Member administrator access is not available yet.", {
      status: 503,
    });
  const form = await readForm(request, config, ["invitationId"]);
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  const result = await revokeInvitation(client, form.get("invitationId") || "");
  return NextResponse.redirect(
    new URL(
      "/admin?notice=" + (result === "revoked" ? "revoked" : "failed"),
      config.origin,
    ),
    303,
  );
}
