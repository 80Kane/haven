export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function privateHtml(title: string, trustedMarkup: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | HavenForward</title><link rel="stylesheet" href="/admin-result.css"></head><body><a href="#main">Skip to content</a><main id="main"><p>HavenForward · Staging administrator</p><h1>${escapeHtml(title)}</h1>${trustedMarkup}<p><a href="/admin">Return to administrator tools</a></p><form method="post" action="/auth/logout"><button>Sign out</button></form></main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
