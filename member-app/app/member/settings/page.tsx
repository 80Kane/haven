import { redirect } from "next/navigation";
import { appConfig, serverClient } from "../../../lib/server";
import { entry } from "../../../lib/flow";
import { profileSelf } from "../../../lib/profile";
import { Closed, Unavailable } from "../../components";
import { MemberNavigation } from "../navigation";

const notices: Record<string, string> = {
  saved: "Your profile and privacy preferences have been saved.",
  invalid:
    "We couldn't save those details. Check the format or choose another handle. Staff labels are reserved.",
  cooldown:
    "Your display name can change once every seven days. Keep the current name to save privacy preferences.",
  limited:
    "You've reached the profile update limit. You can still turn off directory listing or Hug notifications.",
  unavailable: "We couldn't save your settings. Try again in a moment.",
};
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const config = appConfig();
  if (!config) return <Closed />;
  const { client } = await serverClient(config);
  const access = await entry(client);
  if (access.state === "signed-out") redirect("/login");
  if (access.state === "invitation") redirect("/invitation");
  if (access.state !== "member") return <Unavailable />;
  const result = await profileSelf(client, access.member);
  if (result.state !== "ready") return <Unavailable />;
  const profile = result.profile;
  const renameLocked =
    !!profile && Date.parse(profile.renameAvailableAt) > Date.now();
  const notice = (await searchParams).notice;
  return (
    <div className="member-shell">
      <MemberNavigation current="settings" member={access.member} />
      <div className="member-content">
        <section
          className="panel settings-panel"
          aria-labelledby="settings-title"
        >
          <p className="eyebrow">Your identity. Your choices.</p>
          <h1 id="settings-title">Profile &amp; privacy</h1>
          <p>
            Choose how you want to be known. A pseudonym is welcome; your legal
            name isn’t required.
          </p>
          {notice && (
            <p className="notice" role="status">
              {notices[notice] || notices.unavailable}
            </p>
          )}
          <form method="post" action="/member/settings/save">
            <label htmlFor="handle">Your unique handle</label>
            <input
              id="handle"
              name="handle"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-z][a-z0-9_]{2,23}"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={profile?.handle || ""}
              readOnly={!!profile}
              aria-describedby="handle-help"
            />
            <p id="handle-help" className="small field-help">
              Start with a lowercase letter; use 3–24 lowercase letters,
              numbers, or underscores. Your handle stays the same during this
              pilot. Staff labels are reserved.
            </p>
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              name="displayName"
              required
              minLength={2}
              maxLength={40}
              autoComplete="off"
              defaultValue={profile?.displayName || ""}
              readOnly={renameLocked}
              aria-describedby="name-help"
            />
            <p id="name-help" className="small field-help">
              Use 2–40 letters, numbers, spaces, apostrophes, periods, or
              hyphens. Display names may be shared by different members; handles
              identify accounts.
              {renameLocked && profile ? (
                <>
                  {" "}
                  Your next name change is available{" "}
                  {new Date(profile.renameAvailableAt).toLocaleString("en-US", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  UTC. Privacy preferences can change anytime.
                </>
              ) : (
                " You can change your display name once every seven days."
              )}
            </p>
            <fieldset className="privacy-choices">
              <legend>Your visibility and notifications</legend>
              <p className="small">
                The member directory and Hug notifications are planned. These
                choices save your preferences for those features; they don’t
                publish a listing or send notifications now.
              </p>
              <label className="check">
                <input
                  name="directoryListed"
                  type="checkbox"
                  value="yes"
                  defaultChecked={profile?.directoryListed ?? false}
                />
                <span>
                  List me when the member directory opens.
                  <span className="choice-detail">
                    Share only my display name and handle with other active
                    members. Keep my email private.
                  </span>
                </span>
              </label>
              <label className="check">
                <input
                  name="hugNotifications"
                  type="checkbox"
                  value="yes"
                  defaultChecked={profile?.hugNotifications ?? false}
                />
                <span>
                  Allow private Hug notifications when available.
                  <span className="choice-detail">
                    Hugs won’t have public counts in the member pilot.
                  </span>
                </span>
              </label>
            </fieldset>
            <button>Save profile &amp; privacy</button>
          </form>
          <p className="small">
            Saving a profile doesn’t change your membership or staff
            permissions.{" "}
            <a href="https://havenforward.com/privacy">
              Read the privacy information
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
