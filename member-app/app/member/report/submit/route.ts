import { NextResponse } from "next/server";
import { reportingConfig } from "../../../../lib/report-server";
import { serverClient } from "../../../../lib/server";
import { readForm } from "../../../../lib/request";
import { submitReport } from "../../../../lib/reports";
export async function POST(request: Request) {
  const config = reportingConfig();
  if (!config)
    return new Response("Reporting is not available yet.", { status: 503 });
  const form = await readForm(
    request,
    config,
    ["submissionKey", "circle", "category", "details", "acknowledge"],
    16384,
  );
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  const result = await submitReport(client, form);
  const path =
    result === "signed-out"
      ? "/login"
      : result === "invitation"
        ? "/invitation"
        : "/member/report?notice=" + result;
  return NextResponse.redirect(new URL(path, config.origin), 303);
}
