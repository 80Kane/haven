import type { SupabaseClient } from "@supabase/supabase-js";
import { entry } from "./flow";
export type AdminProvider = Pick<SupabaseClient, "auth" | "rpc">;
export const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function adminAccess(client: AdminProvider, requireMfa = true) {
  const result = await entry(client);
  if (result.state !== "member") return result.state;
  if (result.member.role !== "admin") return "denied";
  if (!requireMfa) return "admin";
  try {
    const { data, error } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return "unavailable";
    return data.currentLevel === "aal2" ? "admin" : "mfa";
  } catch {
    return "unavailable";
  }
}
export async function adminFactors(client: AdminProvider) {
  // getUser and fresh SQL membership must be checked before calling this helper.
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new Error("Provider unavailable");
  return data.all.filter((f) => f.factor_type === "totp" && uuid.test(f.id));
}
export async function verifyAdminFactor(
  client: AdminProvider,
  factorId: string,
  code: string,
) {
  if (!uuid.test(factorId) || !/^[0-9]{6}$/.test(code)) return "invalid";
  if ((await adminAccess(client, false)) !== "admin") return "denied";
  try {
    const factors = await adminFactors(client);
    if (!factors.some((f) => f.id === factorId)) return "invalid";
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) return "invalid";
    return (await adminAccess(client)) === "admin" ? "admin" : "denied";
  } catch {
    return "unavailable";
  }
}
export async function issueInvitation(
  client: AdminProvider,
  email: string,
  hours: string,
) {
  email = email.trim().toLowerCase();
  if (
    email.length > 254 ||
    !email.endsWith("@example.test") ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    !/^(?:[1-9]|[1-9][0-9]|1[0-5][0-9]|16[0-8])$/.test(hours)
  )
    return { state: "invalid" as const };
  if ((await adminAccess(client)) !== "admin")
    return { state: "denied" as const };
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const hash = [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  try {
    const { data, error } = await client.rpc("haven_issue_member_invitation", {
      p_email: email,
      p_token_hash: hash,
      p_expires_hours: Number(hours),
    });
    // SQL independently rechecks current admin membership, aal2 and issuance limit.
    if (error)
      return {
        state:
          error.code === "P0001" ? ("limited" as const) : ("denied" as const),
      };
    if (
      !data ||
      !uuid.test(data.id) ||
      typeof data.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(data.expiresAt))
    )
      return { state: "unavailable" as const };
    return {
      state: "issued" as const,
      token,
      email,
      id: data.id as string,
      expiresAt: data.expiresAt as string,
    };
  } catch {
    return { state: "unavailable" as const };
  }
}
export async function revokeInvitation(client: AdminProvider, id: string) {
  if (!uuid.test(id)) return "invalid";
  if ((await adminAccess(client)) !== "admin") return "denied";
  try {
    const { data, error } = await client.rpc("haven_revoke_member_invitation", {
      p_invitation_id: id,
    });
    return !error && data?.revoked === true ? "revoked" : "denied";
  } catch {
    return "unavailable";
  }
}
