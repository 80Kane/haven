import { NextResponse } from "next/server";
import { appConfig, serverClient } from "../../../../lib/server";
import { readForm } from "../../../../lib/request";
import { saveProfile } from "../../../../lib/profile";
export async function POST(request: Request) {
  const config = appConfig();
  if (!config)
    return new Response("Member access is not available yet.", { status: 503 });
  const form = await readForm(request, config, [
    "handle",
    "displayName",
    "directoryListed",
    "hugNotifications",
  ]);
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  const result = await saveProfile(client, form);
  const path =
    result === "signed-out"
      ? "/login"
      : result === "invitation"
        ? "/invitation"
        : "/member/settings?notice=" + result;
  return NextResponse.redirect(new URL(path, config.origin), 303);
}
