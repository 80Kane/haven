import test from "node:test";
import assert from "node:assert/strict";
import { profileSelf, saveProfile, validProfileInput } from "../lib/profile";
import type { Member, Provider } from "../lib/flow";
const id = "00000000-0000-4000-8000-000000000001";
const member: Member = {
  id,
  role: "member",
  status: "active",
  consentVersion: "member-v1",
};
const profile = {
  handle: "gentle_river",
  displayName: "River",
  directoryListed: false,
  hugNotifications: false,
  renameAvailableAt: "2027-01-01T00:00:00Z",
};
function fixture(
  options: {
    error?: string;
    data?: unknown;
    denied?: boolean;
    signedOut?: boolean;
    throws?: boolean;
  } = {},
) {
  const calls: { name: string; args?: unknown }[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.signedOut
            ? null
            : {
                id,
                email: "active@example.test",
                email_confirmed_at: "2026-01-01",
                is_anonymous: false,
              },
        },
        error: null,
      }),
    },
    rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args });
      if (options.throws) throw Error("private provider message");
      if (name === "haven_member_self")
        return {
          data: member,
          error: options.denied ? { code: "42501" } : null,
        };
      return {
        data: "data" in options ? options.data : { memberId: id, profile },
        error: options.error
          ? { code: options.error, message: "private provider message" }
          : null,
      };
    },
  } as unknown as Provider;
  return { client, calls };
}
const form = () =>
  new URLSearchParams({ handle: "gentle_river", displayName: "River" });
test("profile input permits pseudonyms but reserves staff labels and rejects controls and invalid handles", () => {
  assert.equal(validProfileInput("gentle_river", "River"), true);
  assert.equal(validProfileInput("new_path", "María"), true);
  for (const [handle, name] of [
    ["admin", "River"],
    ["support_team", "River"],
    ["ab", "River"],
    ["Name", "River"],
    ["abc", "Moderator"],
    ["abc", "River\u202eName"],
    ["abc", "River\nName"],
    ["abc", "x"],
    ["abc", " River "],
  ])
    assert.equal(validProfileInput(handle, name), false);
});
test("profile reads are owner-bound, minimal, and handle missing profiles without creating one", async () => {
  const { client } = fixture();
  assert.deepEqual(await profileSelf(client, member), {
    state: "ready",
    profile,
  });
  assert.deepEqual(
    await profileSelf(
      fixture({ data: { memberId: id, profile: null } }).client,
      member,
    ),
    { state: "ready", profile: null },
  );
  for (const data of [
    { memberId: "another-user", profile },
    { memberId: id, profile: { ...profile, directoryListed: "true" } },
    { memberId: id, profile: { ...profile, renameAvailableAt: "invalid" } },
  ])
    assert.deepEqual(await profileSelf(fixture({ data }).client, member), {
      state: "unavailable",
    });
});
test("saving settings requires current membership and unchecked privacy choices remain off", async () => {
  const { client, calls } = fixture();
  assert.equal(await saveProfile(client, form()), "saved");
  assert.deepEqual(calls[1], {
    name: "haven_save_profile",
    args: {
      p_handle: "gentle_river",
      p_display_name: "River",
      p_directory_listed: false,
      p_hug_notifications: false,
    },
  });
  const denied = fixture({ denied: true });
  assert.equal(await saveProfile(denied.client, form()), "invitation");
  assert.equal(denied.calls.length, 1);
  const signedOut = fixture({ signedOut: true });
  assert.equal(await saveProfile(signedOut.client, form()), "signed-out");
  assert.equal(signedOut.calls.length, 0);
});
test("profile validation rejects malformed preference values before any write", async () => {
  for (const changes of [
    { handle: "ADMIN" },
    { displayName: "Staff" },
    { directoryListed: "true" },
  ]) {
    const input = form();
    for (const [key, value] of Object.entries(changes)) input.set(key, value);
    const f = fixture();
    assert.equal(await saveProfile(f.client, input), "invalid");
    assert.equal(
      f.calls.some((c) => c.name === "haven_save_profile"),
      false,
    );
  }
});
test("SQL cooldown, limits, collisions, revocation and outages map to fixed safe outcomes", async () => {
  for (const [error, result] of [
    ["P0002", "cooldown"],
    ["P0003", "limited"],
    ["23505", "invalid"],
    ["22023", "invalid"],
    ["42501", "invitation"],
    ["XX000", "unavailable"],
  ])
    assert.equal(await saveProfile(fixture({ error }).client, form()), result);
  assert.deepEqual(
    await profileSelf(fixture({ throws: true }).client, member),
    { state: "unavailable" },
  );
  assert.equal(
    await saveProfile(
      fixture({ data: { memberId: "other", profile } }).client,
      form(),
    ),
    "unavailable",
  );
});
