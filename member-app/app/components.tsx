export function Closed() {
  return (
    <section className="panel">
      <p className="eyebrow">Invitation-only community</p>
      <h1>We're preparing a place to move forward.</h1>
      <p>
        Member access is not available yet. Public support resources remain
        available below.
      </p>
    </section>
  );
}
export function Unavailable() {
  return (
    <section className="panel">
      <h1>We couldn't check your access.</h1>
      <p>
        Please try again in a moment. Your support resources are still available
        below.
      </p>
      <a className="button" href="/">
        Try again
      </a>
    </section>
  );
}
export function SignOut() {
  return (
    <form method="post" action="/auth/logout">
      <button className="secondary">Sign out</button>
    </form>
  );
}
