import type { SupabaseClient, User } from "@supabase/supabase-js";
export type Member = {
  id: string;
  role: "member" | "moderator" | "admin";
  status: "active";
  consentVersion: "member-v1";
};
export type Provider = Pick<SupabaseClient, "auth" | "rpc">;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function verified(user: User | null): user is User {
  return (
    !!user &&
    uuid.test(user.id) &&
    !!user.email &&
    !!user.email_confirmed_at &&
    user.is_anonymous !== true
  );
}
export async function entry(
  client: Provider,
): Promise<
  | { state: "member"; member: Member }
  | { state: "signed-out" | "invitation" | "unavailable" }
> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error)
      return {
        state:
          error.status && error.status < 500 ? "signed-out" : "unavailable",
      };
    if (!verified(data.user)) return { state: "signed-out" };
    const result = await client.rpc("haven_member_self");
    if (result.error)
      return {
        state: result.error.code === "42501" ? "invitation" : "unavailable",
      };
    const member = result.data;
    if (
      !member ||
      member.id !== data.user.id ||
      member.status !== "active" ||
      !["member", "moderator", "admin"].includes(member.role) ||
      member.consentVersion !== "member-v1"
    )
      return { state: "unavailable" };
    return {
      state: "member",
      member: {
        id: member.id,
        role: member.role,
        status: "active",
        consentVersion: "member-v1",
      },
    };
  } catch {
    return { state: "unavailable" };
  }
}
export async function signIn(
  client: Provider,
  form: URLSearchParams,
): Promise<"invalid" | "member" | "invitation" | "unavailable"> {
  const email = (form.get("email") || "").trim();
  const password = form.get("password") || "";
  if (
    email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    password.length < 1 ||
    password.length > 1024
  )
    return "invalid";
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error)
      return error.status && error.status >= 500 ? "unavailable" : "invalid";
    const result = await entry(client);
    if (result.state === "signed-out") {
      await client.auth.signOut({ scope: "local" });
      return "invalid";
    }
    return result.state;
  } catch {
    return "unavailable";
  }
}
export async function redeem(
  client: Provider,
  form: URLSearchParams,
): Promise<"invalid" | "member" | "signed-out" | "unavailable"> {
  const token = form.get("token") || "";
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    form.get("consent") !== "yes" ||
    form.get("consentVersion") !== "member-v1"
  )
    return "invalid";
  try {
    const { data, error } = await client.auth.getUser();
    if (error)
      return error.status && error.status >= 500 ? "unavailable" : "signed-out";
    if (!verified(data.user)) return "signed-out";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const p_token_hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const result = await client.rpc("haven_redeem_member_invitation", {
      p_token_hash,
      p_consent_version: "member-v1",
    });
    if (result.error)
      return result.error.code === "42501" ? "invalid" : "unavailable";
    if (result.data?.accepted !== true) return "invalid";
    const current = await entry(client);
    return current.state === "member" ? "member" : "unavailable";
  } catch {
    return "unavailable";
  }
}
