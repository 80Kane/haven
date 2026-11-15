# Member app design mockups (for review, not implementation)

Static HTML/CSS proposals for Tim's review, following the shared brief:

- `member-dashboard.html` — member welcome dashboard
- `circle-recovery-healing.html` — one Community Circle (Recovery & Healing)
- `mockup.css` — mockup-only styles layered on the public site's
  `/assets/styles.css` tokens and fonts

All names, posts, counts, dates and learning items are **synthetic sample
content**. K.E.Y.S. and CEO Hockley items are labelled placeholders only.
Pages are `noindex, nofollow`, unlinked from the public site, absent from the
sitemap and build allowlist, and make no network requests. Nothing here
changes the member app, authentication, Supabase, or `functions/`.

When implemented, these screens belong in `member-app/` (Next.js), which
already provides invitation sign-in, member/moderator/admin roles and admin
MFA. Display names, circles, posts, reports, blocks and learning items need
new reviewed schema; none exists yet.
