import { entry, type Member, type Provider } from "./flow";

export type Profile = {
  handle: string;
  displayName: string;
  directoryListed: boolean;
  hugNotifications: boolean;
  renameAvailableAt: string;
};
const handlePattern = /^[a-z][a-z0-9_]{2,23}$/;
const reservedHandle =
  /^(admin|administrator|moderator|staff|havenforward|support)(_|$)/;
const reservedName = /\b(admin|administrator|moderator|staff|havenforward)\b/i;
export function validProfileInput(handle: string, name: string) {
  return (
    handlePattern.test(handle) &&
    !reservedHandle.test(handle) &&
    [...name].length >= 2 &&
    [...name].length <= 40 &&
    name === name.trim() &&
    /^[\p{L}\p{M}\p{N} .'-]+$/u.test(name) &&
    !reservedName.test(name)
  );
}
function parseProfile(
  data: unknown,
  memberId: string,
): Profile | null | undefined {
  if (!data || typeof data !== "object") return undefined;
  const result = data as Record<string, unknown>;
  if (result.memberId !== memberId) return undefined;
  if (result.profile === null) return null;
  if (!result.profile || typeof result.profile !== "object") return undefined;
  const p = result.profile as Record<string, unknown>;
  if (
    typeof p.handle !== "string" ||
    typeof p.displayName !== "string" ||
    !validProfileInput(p.handle, p.displayName) ||
    typeof p.directoryListed !== "boolean" ||
    typeof p.hugNotifications !== "boolean" ||
    typeof p.renameAvailableAt !== "string" ||
    !Number.isFinite(Date.parse(p.renameAvailableAt))
  )
    return undefined;
  return {
    handle: p.handle,
    displayName: p.displayName,
    directoryListed: p.directoryListed,
    hugNotifications: p.hugNotifications,
    renameAvailableAt: p.renameAvailableAt,
  };
}
export async function profileSelf(client: Provider, member: Member) {
  try {
    const result = await client.rpc("haven_profile_self");
    if (result.error) return { state: "unavailable" } as const;
    const profile = parseProfile(result.data, member.id);
    return profile === undefined
      ? ({ state: "unavailable" } as const)
      : ({ state: "ready", profile } as const);
  } catch {
    return { state: "unavailable" } as const;
  }
}
export async function saveProfile(client: Provider, form: URLSearchParams) {
  const access = await entry(client);
  if (access.state !== "member") return access.state;
  const handle = form.get("handle") || "";
  const name = form.get("displayName") || "";
  if (
    !validProfileInput(handle, name) ||
    ["directoryListed", "hugNotifications"].some(
      (key) => form.has(key) && form.get(key) !== "yes",
    )
  )
    return "invalid";
  try {
    const result = await client.rpc("haven_save_profile", {
      p_handle: handle,
      p_display_name: name,
      p_directory_listed: form.get("directoryListed") === "yes",
      p_hug_notifications: form.get("hugNotifications") === "yes",
    });
    if (result.error) {
      if (result.error.code === "42501") return "invitation";
      if (result.error.code === "P0002") return "cooldown";
      if (result.error.code === "P0003") return "limited";
      if (["22023", "23505"].includes(result.error.code)) return "invalid";
      return "unavailable";
    }
    return parseProfile(result.data, access.member.id)
      ? "saved"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}
