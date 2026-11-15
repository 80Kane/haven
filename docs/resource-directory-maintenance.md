# Resource directory maintenance

The public directory is static. Editing is limited to repository contributors with
write access; resource changes go through a pull request and review before merge.
There is no public editor or direct-to-production update path.

## Updating an entry

1. Review the provider's official source for its link, contact route, eligibility,
   coverage, and any service-specific limits. Do not infer openings or say a
   service is available now unless the provider confirms that claim and its
   time-sensitive scope.
2. Update the matching entry in `data/resources.json` and the corresponding card
   in `resources.html`. Keep the name, category, eligibility, contact, region,
   provider URL, and verification display consistent.
3. Keep `lastVerified` as `null` until the details have actually been checked.
   After a review, set it to the review date in `YYYY-MM-DD` form and show that
   date on the card. Do not add a person's name or private contact information.
4. Open a pull request with the official source and the review performed. A second
   authorized contributor reviews the evidence and the rendered content before
   merge. Run `npm test` and `npm run build`.

## Corrections from the public

The directory links to GitHub Issues for corrections and broken links. Issues are
public: do not include personal or sensitive information. A maintainer reviews
reports, checks the official source, and makes any directory change through the
same pull-request workflow. Reports do not change the live directory directly.
