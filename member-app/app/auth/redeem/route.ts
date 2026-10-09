import { NextResponse } from "next/server";
import { appConfig, serverClient } from "../../../lib/server";
import { readForm } from "../../../lib/request";
import { redeem } from "../../../lib/flow";
export async function POST(request: Request) {
  const config = appConfig();
  if (!config)
    return new Response("Member access is not available yet.", { status: 503 });
  const form = await readForm(request, config, [
    "token",
    "consent",
    "consentVersion",
  ]);
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  const result = await redeem(client, form);
  const path =
    result === "member"
      ? "/member"
      : result === "signed-out"
        ? "/login"
        : "/invitation?notice=" + result;
  return NextResponse.redirect(new URL(path, config.origin), 303);
}
