import { NextRequest, NextResponse } from "next/server";
import { appConfig } from "./lib/config";
import { createAuthClient, cookieOptions } from "./lib/provider";
export async function proxy(request: NextRequest) {
  const config = appConfig();
  const nonce = Buffer.from(
    crypto.getRandomValues(new Uint8Array(24)),
  ).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}; style-src 'self'${dev ? " 'unsafe-inline'" : ""}; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", csp);
  headers.set("x-nonce", nonce);
  let response = NextResponse.next({ request: { headers } });
  if (config && new URL(request.url).origin !== config.origin)
    response = new NextResponse("Not found", { status: 404 });
  else if (config && ["GET", "HEAD"].includes(request.method)) {
    try {
      const client = createAuthClient(config, {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          for (const { name, value } of values)
            request.cookies.set(name, value);
          headers.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers } });
          for (const { name, value, options } of values)
            response.cookies.set(name, value, {
              ...options,
              ...cookieOptions(config),
              ...(options.maxAge === 0 ? { maxAge: 0 } : {}),
            });
        },
      });
      // Refresh in a writable boundary, never trust getSession's user payload.
      const { error } = await client.auth.getUser();
      if (
        error &&
        (!error.status || error.status >= 500) &&
        error.name !== "AuthSessionMissingError"
      )
        response = new NextResponse(
          "Member access is temporarily unavailable.",
          { status: 503 },
        );
    } catch {
      response = new NextResponse("Member access is temporarily unavailable.", {
        status: 503,
      });
    }
  }
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
