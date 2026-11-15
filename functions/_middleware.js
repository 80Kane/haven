import {
  SECURITY_HEADERS,
  isFunctionPath,
  isPublicPath,
} from "../scripts/public-site.mjs";

// Fail closed: only paths the build publishes (and the existing Functions)
// reach the asset server. Any other path, including stale copies of repo files
// from before the site was built into dist/, gets the custom 404 from here.
export async function onRequest({ request, env, next }) {
  const { pathname } = new URL(request.url);
  if (isFunctionPath(pathname) || isPublicPath(pathname)) return next();
  return notFound(request, env);
}

async function notFound(request, env) {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex");
  headers.set("X-Haven-Guard", "1");
  let body = "<!doctype html><title>Page unavailable</title><p>Not found.</p>";
  try {
    const page = await env.ASSETS.fetch(new URL("/404", request.url));
    if (page.ok) body = await page.text();
  } catch {
    // Keep the minimal fallback body; the status is still 404.
  }
  return new Response(request.method === "HEAD" ? null : body, {
    status: 404,
    headers,
  });
}
