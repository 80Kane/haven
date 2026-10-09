import { handlePublicApi } from "../../backend/public-api.mjs";
export function onRequest({ request, env }) {
  return handlePublicApi(request, env, {
    reportFailure: (code) =>
      console.error(`Public interaction service: ${code}`),
  });
}
