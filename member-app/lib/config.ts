export type AppConfig = {
  origin: string;
  url: string;
  key: string;
  secure: boolean;
};
export function appConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig | null {
  if (
    env.MEMBER_UI_ENABLED !== "true" ||
    env.MEMBER_APP_ENVIRONMENT !== "staging"
  )
    return null;
  try {
    const origin = new URL(env.MEMBER_UI_ORIGIN || "");
    const local =
      env.NODE_ENV === "development" &&
      origin.origin === "http://127.0.0.1:4180";
    if (
      (!local && origin.protocol !== "https:") ||
      origin.origin !== env.MEMBER_UI_ORIGIN ||
      origin.username ||
      origin.password ||
      origin.hostname.endsWith(".invalid") ||
      /(^|\.)havenforward\.com$/i.test(origin.hostname)
    )
      return null;
    const url = new URL(env.SUPABASE_URL || "");
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
      url.origin !== env.SUPABASE_URL ||
      url.username ||
      url.password ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(
        env.SUPABASE_PUBLISHABLE_KEY || "",
      )
    )
      return null;
    return {
      origin: origin.origin,
      url: url.origin,
      key: env.SUPABASE_PUBLISHABLE_KEY!,
      secure: !local,
    };
  } catch {
    return null;
  }
}

export function adminAppConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return env.MEMBER_ADMIN_UI_ENABLED === "true" ? appConfig(env) : null;
}
