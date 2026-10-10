import { NextResponse } from "next/server";
import { appConfig, serverClient } from "../../../lib/server";
import { readForm } from "../../../lib/request";
import { signIn } from "../../../lib/flow";
export async function POST(request: Request) {
  const config = appConfig();
  if (!config)
    return new Response("Member access is not available yet.", { status: 503 });
  const form = await readForm(request, config, ["email", "password"]);
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client, clear } = await serverClient(config, true);
  const result = await signIn(client, form);
  if (result === "invalid") clear();
  const path =
    result === "member"
      ? "/member"
      : result === "invitation"
        ? "/invitation"
        : "/login?notice=" + result;
  return NextResponse.redirect(new URL(path, config.origin), 303);
}
