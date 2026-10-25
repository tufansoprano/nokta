# Food hygiene ratings (NOKTA-20)

Each venue's official food hygiene rating is stored on Nokta and refreshed on a
schedule. The venue page display, the hygiene filter and owner reports build on
this.

## Where the data comes from

The Food Standards Agency ratings API (`https://api.ratings.food.gov.uk`,
`x-api-version: 2`, no key). It covers both schemes:

- **FHRS** (England, Wales, Northern Ireland): scores `0`–`5`.
- **FHIS** (Scotland): `Pass` or `Improvement Required`. "Pass and Eat Safe" is
  stored as `Pass`.

"Awaiting inspection", "Awaiting publication" and "Exempt" are stored as no
rating, with the link to the record kept.

## What is stored

`public.venue_food_hygiene`, one row per venue (sprint-56 migration): the
official record id (`fhrs_id`), scheme, rating, last inspection date, official
page (`https://ratings.food.gov.uk/business/<id>`), the official business name
and address, and when it was last checked. It is a separate table, not columns on
`venues`, so the refresh never touches a venue row or its `updated_at`. Anyone can
read it; only admins and the service role write it.

`link_status` records how the venue is tied to its record:

| Status | Meaning | Next refresh |
|---|---|---|
| `source` | `data_sources.foodHygieneSource` is a ratings.food.gov.uk link | Re-reads that record |
| `matched` | Found automatically | Re-reads that record; searches again if it has gone |
| `unmatched` | No record found | Searches again |
| `unlinked` | The team said the venue has no official record | Left alone |

## Matching

A `foodHygieneSource` link to ratings.food.gov.uk always wins. Other sites (for
example hygieneratings.uk) are not treated as the official record.

Without one, the refresh searches by name and postcode, then by postcode alone,
and accepts a record only if the postcode matches exactly and the names are close
after dropping generic words ("lounge", "ltd", "shisha"…). Two equally close
records mean no match: a wrong rating is worse than none. Logic and tests:
`src/lib/foodHygiene.ts`.

## Keeping it up to date

`.github/workflows/refresh-food-hygiene.yml` runs `npm run refresh:food-hygiene`
on Mondays and Thursdays at 04:17 UTC, so a new official rating shows within a
week even if one run fails. It can also be run by hand from the Actions tab.

The API blocks clients that send bursts (every call then gets 403 for a while),
so requests go out at most one a second, and a run stops after five failures in
a row. A venue that fails keeps its stored rating. The run exits non-zero, which
GitHub emails about, when it stops early or more than 10% of venues fail.

**Setup:** add repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
for production.

To run it by hand: `npm run refresh:food-hygiene -- --env=.env.qa.local`, adding
`--venue=<id>` for one venue.

## Correcting a match

In the admin venue editor, Data provenance shows the linked record and its rating:

- **Wrong record:** put the right ratings.food.gov.uk page in *Food hygiene
  source*, save, then **Refresh now**.
- **No official record:** **No official record** stores no rating and stops
  automatic matching. **Match automatically again** undoes it.

## Tests

- Unit: `src/lib/foodHygiene.test.ts`, `src/services/foodHygieneRefreshService.test.ts` (`npm test`).
- Integration: `src/services/foodHygieneRefreshService.integration.test.ts`
  (`npm run test:integration`) creates test venues in the QA Supabase project,
  refreshes them against the live ratings API, and deletes them. It reads QA
  credentials from `QA_SUPABASE_URL`/`QA_SUPABASE_SERVICE_ROLE_KEY` or
  `.env.qa.local` only, and is skipped without them.
