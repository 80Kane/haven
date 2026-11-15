import { NextResponse } from "next/server";
import { reportAdminConfig } from "../../../../lib/report-server";
import { serverClient } from "../../../../lib/server";
import { readForm } from "../../../../lib/request";
import { reviewReport } from "../../../../lib/reports";
import { uuid } from "../../../../lib/admin";
export async function POST(request: Request) {
  const config = reportAdminConfig();
  if (!config)
    return new Response("Report review is not available yet.", { status: 503 });
  const form = await readForm(request, config, [
    "reportId",
    "version",
    "status",
    "resolution",
  ]);
  if (!form) return new Response("Invalid request", { status: 403 });
  const { client } = await serverClient(config, true);
  const result = await reviewReport(client, form);
  const id = form.get("reportId") || "";
  const path =
    result === "signed-out"
      ? "/login"
      : result === "mfa"
        ? "/admin/mfa"
        : uuid.test(id)
          ? `/admin/reports/${id}?notice=${result}`
          : "/admin/reports";
  return NextResponse.redirect(new URL(path, config.origin), 303);
}
