import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { AppConfig } from "./config";
export type Cookie = { name: string; value: string; options: CookieOptions };
export type CookiePort = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: Cookie[]): void;
};
export const cookieName = (config: AppConfig) =>
  config.secure ? "__Host-haven-auth" : "haven-auth";
export function cookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  };
}
export function createAuthClient(
  config: AppConfig,
  cookies: CookiePort,
  fetcher: typeof fetch = fetch,
) {
  // One client per request. There is deliberately no browser Supabase client.
  return createServerClient(config.url, config.key, {
    cookieOptions: { name: cookieName(config), ...cookieOptions(config) },
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (values) =>
        cookies.setAll(
          values.map((cookie) => ({
            ...cookie,
            options: {
              ...cookie.options,
              ...cookieOptions(config),
              ...(cookie.options.maxAge === 0 ? { maxAge: 0 } : {}),
            },
          })),
        ),
    },
    global: {
      fetch: (input, init) =>
        fetcher(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        }),
    },
  });
}
export function clearAuthCookies(config: AppConfig, cookies: CookiePort) {
  const prefix = cookieName(config);
  cookies.setAll(
    cookies
      .getAll()
      .filter(
        (cookie) =>
          cookie.name === prefix ||
          cookie.name.startsWith(prefix + ".") ||
          cookie.name.startsWith(prefix + "-code-verifier"),
      )
      .map((cookie) => ({
        name: cookie.name,
        value: "",
        options: { ...cookieOptions(config), maxAge: 0 },
      })),
  );
}
