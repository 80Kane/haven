import { handlePublicApi } from "../../backend/public-api.mjs";
import { handleMemberApi } from "../../backend/member-api.mjs";
export function onRequest({ request, env }) {
  if (new URL(request.url).pathname.startsWith("/api/member/"))
    return handleMemberApi(request, env, {
      reportFailure: (code) => console.error(`Member service: ${code}`),
    });
  return handlePublicApi(request, env, {
    reportFailure: (code) =>
      console.error(`Public interaction service: ${code}`),
  });
}
