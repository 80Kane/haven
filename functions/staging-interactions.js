import { handleStagingPage } from "../backend/staging-page.mjs";
export function onRequest({ request, env }) {
  return handleStagingPage(request, env);
}
