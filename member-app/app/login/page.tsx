import { appConfig } from "../../lib/server";
import { Closed } from "../components";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!appConfig()) return <Closed />;
  const { notice } = await searchParams;
  const message =
    notice === "invalid"
      ? "We couldn't sign you in. Check your details and try again."
      : notice === "unavailable"
        ? "Sign-in is temporarily unavailable. Please try again."
        : notice === "signed-out"
          ? "You've signed out of this browser."
          : notice === "logout-unavailable"
            ? "You've signed out of this browser. We couldn't confirm that the provider session was revoked."
            : null;
  return (
    <section className="panel">
      <p className="eyebrow">Welcome back</p>
      <h1>Your next step starts here.</h1>
      <p>
        Sign in with the account prepared for your invitation. An email-update
        subscription is separate from membership.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <form method="post" action="/auth/login">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          required
        />
        <button>Sign in</button>
      </form>
      <p className="small">
        Invitation-only pilot. If you need help with your account, contact the
        person who invited you. Account recovery is not available in this pilot
        screen yet.
      </p>
    </section>
  );
}
