import { NextResponse } from "next/server";
import { appConfig, serverClient } from "../../../lib/server";
import { readForm } from "../../../lib/request";
export async function POST(request: Request) {
  const config = appConfig();
  if (!config)
    return new Response("Member access is not available yet.", { status: 503 });
  if (!(await readForm(request, config, [])))
    return new Response("Invalid request", { status: 403 });
  const { client, clear } = await serverClient(config, true);
  let failed = false;
  try {
    failed = !!(await client.auth.signOut({ scope: "local" })).error;
  } catch {
    failed = true;
  }
  clear();
  return NextResponse.redirect(
    new URL(
      "/login?notice=" + (failed ? "logout-unavailable" : "signed-out"),
      config.origin,
    ),
    303,
  );
}
