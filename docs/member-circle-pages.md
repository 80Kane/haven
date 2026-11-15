# Member pages: Circles, resources and Learning

This extends the private pilot with a Circle directory, six additional Circle previews, a resource hub and a Learning page. Recovery & Healing keeps its existing URL and becomes part of the same seven-entry catalog.

## Routes and content

- `/member/circles`: seven Circle cards, each linked to a preview.
- `/member/circles/[slug]`: Recovery & Healing, Choices & Change, Mental Wellness, Veterans Connection, Family & Relationships, Reentry & New Beginnings, Purpose & Personal Growth.
- `/member/resources`: links to the existing public support page, resource directory, meeting finders and treatment information.
- `/member/learning`: honest library status, links to original Circle reflections, and the requirements for permission and accessible formats before third-party materials are published.

Each preview has a distinct introduction, optional reflection prompt, expandable reflection ideas, community-care reminders and navigation to the other Circles. All reflection text is original editorial content. No participant stories, submitted answers, third-party worksheets or licensed courses are included.

## Access and feature boundaries

Every page repeats the existing server-side entry checks: valid application configuration, current verified Auth identity and active SQL membership. Signed-out accounts go to login; pending and suspended accounts go to invitation entry. Lookup of an unknown Circle happens only after the membership checks, then renders the route's not-found page. Routes remain dynamic, private/no-store and excluded from indexing by the existing layout/proxy.

The navigation now exposes Circles, Profile & privacy, Support resources and Learning. Administrator tools remain role- and feature-flag-dependent. The public Cloudflare site, hosting configuration, Auth flow and database are unchanged.

These are working navigation/content pages, not active discussion groups. Joining, member lists, posts, replies, Hugs, moderation queues and messaging remain unavailable. The Learning page has no course enrollment, downloads, certificates or progress tracking. Native details elements provide optional reflection ideas without a new client component, browser storage, answer input or write endpoint.

## Verification

Browser coverage includes every new route for signed-out, pending and suspended accounts, and after logout. Active-member checks traverse all seven Circle links at 320px and 1440px, expand reflections, inspect private/no-store headers, run automated accessibility and overflow checks, verify the sole form is sign-out, and check unknown/prototype-like slugs. Resource and Learning navigation and screenshots are included. Existing profile and administrator tests continue to run.
