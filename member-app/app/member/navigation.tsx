import { SignOut } from "../components";
import type { Member } from "../../lib/flow";

export function MemberNavigation({
  current,
  member,
}: {
  current: "home" | "circle" | "settings" | "resources" | "learning" | "report";
  member: Member;
}) {
  return (
    <aside className="member-sidebar" aria-label="Member area">
      <p className="eyebrow">Your space</p>
      <nav className="member-navigation" aria-label="Member navigation">
        <a
          href="/member"
          aria-current={current === "home" ? "page" : undefined}
        >
          Your home <span aria-hidden="true">↗</span>
        </a>
        <a
          href="/member/circles"
          aria-current={current === "circle" ? "page" : undefined}
        >
          Circles <span aria-hidden="true">↗</span>
        </a>
        <a
          href="/member/settings"
          aria-current={current === "settings" ? "page" : undefined}
        >
          Profile &amp; privacy
        </a>
        <a
          href="/member/resources"
          aria-current={current === "resources" ? "page" : undefined}
        >
          Support resources
        </a>
        <a
          href="/member/learning"
          aria-current={current === "learning" ? "page" : undefined}
        >
          Learning
        </a>
        <a href="https://havenforward.com/guidelines">Community guidelines</a>
        {process.env.MEMBER_REPORTING_ENABLED === "true" && (
          <a
            href="/member/report"
            aria-current={current === "report" ? "page" : undefined}
          >
            Report a concern
          </a>
        )}
        {member.role === "admin" &&
          process.env.MEMBER_ADMIN_UI_ENABLED === "true" && (
            <a href="/admin">Administrator tools</a>
          )}
      </nav>
      <div className="member-account">
        <p className="eyebrow">Your membership</p>
        <dl>
          <dt>Status</dt>
          <dd>Active</dd>
          <dt>Role</dt>
          <dd>{member.role}</dd>
        </dl>
        <SignOut />
      </div>
      <p className="small">Your voice. Your choices. Your own pace.</p>
    </aside>
  );
}

export function CircleMark({
  kind,
}: {
  kind: "leaf" | "path" | "sun" | "star" | "heart" | "door" | "compass";
}) {
  const paths = {
    leaf: "M12 21V11M12 12C12 6 18 4 21 4C21 9 18 13 12 12ZM12 16C6 16 3 12 3 8C8 8 12 11 12 16Z",
    path: "M12 22V2M12 5H20L23 8L20 11H12M12 13H4L1 16L4 19H12",
    sun: "M12 1V3M12 21V23M1 12H3M21 12H23M4 4L6 6M18 18L20 20M4 20L6 18M18 6L20 4M17 12A5 5 0 1 1 7 12A5 5 0 1 1 17 12Z",
    star: "M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8Z",
    heart: "M12 21S2 15 2 8A5 5 0 0 1 12 5A5 5 0 0 1 22 8C22 15 12 21 12 21Z",
    door: "M3 22H21M6 22V3H18V22M14 12H14.1",
    compass:
      "M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12ZM16 8L14 14L8 16L10 10Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
