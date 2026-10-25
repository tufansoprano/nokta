-- Sprint 56: store each venue's official food hygiene rating (NOKTA-20).
--
-- One row per venue, written by the scheduled refresh
-- (scripts/refresh-food-hygiene.ts, run by .github/workflows/refresh-food-hygiene.yml)
-- and by the admin tools. Ratings come from the Food Standards Agency API, which
-- covers England, Wales and Northern Ireland (FHRS, 0-5) and Scotland (FHIS,
-- Pass / Improvement Required). The rating is stored rather than looked up live
-- because the search and map filters need it.
--
-- link_status says how the venue is tied to its official record:
--   source    - the record named by data_sources.foodHygieneSource
--   matched   - found automatically by name and postcode
--   unmatched - no official record found; retried on every refresh
--   unlinked  - the team said the venue has no official record; never auto-matched
--
-- rating is null when the venue has no rating: no record, or a record officially
-- "Awaiting inspection", "Awaiting publication" or "Exempt".

create table if not exists public.venue_food_hygiene (
  venue_id text primary key references public.venues(id) on delete cascade,
  link_status text not null,
  fhrs_id integer,
  scheme text,
  rating text,
  rating_date date,
  official_url text,
  business_name text,
  business_address text,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_food_hygiene_link_status_check
    check (link_status in ('source', 'matched', 'unmatched', 'unlinked')),
  constraint venue_food_hygiene_record_check
    check ((link_status in ('source', 'matched')) = (fhrs_id is not null and scheme is not null and official_url is not null)),
  constraint venue_food_hygiene_rating_check
    check (
      rating is null
      or (scheme = 'FHRS' and rating in ('0', '1', '2', '3', '4', '5'))
      or (scheme = 'FHIS' and rating in ('Pass', 'Improvement Required'))
    ),
  constraint venue_food_hygiene_rating_date_check
    check (rating is not null or rating_date is null)
);

create index if not exists venue_food_hygiene_rating_idx
  on public.venue_food_hygiene (rating)
  where rating is not null;

alter table public.venue_food_hygiene enable row level security;

drop policy if exists "Anyone can read venue food hygiene" on public.venue_food_hygiene;
create policy "Anyone can read venue food hygiene"
on public.venue_food_hygiene
for select
using (true);

drop policy if exists "Admins can manage venue food hygiene" on public.venue_food_hygiene;
create policy "Admins can manage venue food hygiene"
on public.venue_food_hygiene
for all
using (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()));

grant select on public.venue_food_hygiene to anon, authenticated;
grant insert, update, delete on public.venue_food_hygiene to authenticated;
grant all on public.venue_food_hygiene to service_role;

notify pgrst, 'reload schema';
