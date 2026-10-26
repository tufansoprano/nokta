-- Let unclaimed venues receive booking requests at the database too.
--
-- Sprint-57 made nokta forward requests for unclaimed venues, and the app now
-- offers the form for them. But the insert policy from sprint-45 still called
-- can_venue_receive_booking_requests, which required state = 'live', so the
-- insert was rejected by RLS. Only a claimed venue that switched requests off
-- ('disabled') should refuse one.
--
-- The environments had also drifted: prod used the venue check without the
-- submitted_by check from fix-booking-request-insert-rls, QA the reverse. The
-- policy below keeps both, so a request must be pending, submitted as yourself
-- (or anonymously), and for a venue that is not disabled.

create or replace function public.can_venue_receive_booking_requests(target_venue_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.public_venue_booking_states
    where venue_id = target_venue_id and state <> 'disabled'
  );
$$;

revoke all on function public.can_venue_receive_booking_requests(text) from public;
grant execute on function public.can_venue_receive_booking_requests(text) to anon, authenticated;

drop policy if exists "Anyone can create booking requests" on public.booking_requests;
create policy "Anyone can create booking requests"
on public.booking_requests
for insert
to anon, authenticated
with check (
  status = 'pending'
  and (submitted_by is null or submitted_by = auth.uid())
  and public.can_venue_receive_booking_requests(venue_id)
);

notify pgrst, 'reload schema';
