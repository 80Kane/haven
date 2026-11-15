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

## Decisions applied (Tim, 2026-11-14)

1. Hugs: private notifications only; no public counts. Notifications optional.
2. Moderators: chosen staff names, published coverage hours, "On duty" only
   when someone is available, an off-hours state, and "Moderation isn't
   emergency support".
3. Member directory: opt-in, unlisted by default, easy to leave.
4. Posting: author-controlled replies and optional content notes; reporting
   and moderator review stay available when replies are off.
5. Names: pseudonyms, unique @handles, display-name change cooldown (30 days
   shown as an example value), Staff badge, no legal names.
6. Learning: owned or documented-permission material only; K.E.Y.S. and CEO
   Hockley items stay private drafts until rights and content review; formats
   are captioned video, audio + transcript and accessible PDF.
7. Emergency links on every screen: "Emotional distress: call/text 988" and
   "Immediate danger or medical emergency: call 911", plus a Support link.
