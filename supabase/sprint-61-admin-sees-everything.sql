-- Give the nokta admin the same visibility as every venue owner, in one place.
--
-- 1. Every alert an owner gets (new booking request, new enquiry, a customer
--    answering a suggested time) is copied to the admin, by email and in-app.
--    The copy points at Demand instead of the owner's inbox.
-- 2. Enquiries for unclaimed venues alert the admin. Until now they alerted
--    nobody: the trigger returned early when a venue had no owner.
-- 3. The admin can upload photos from any venue's owner workspace.
--
-- Sprint 60's before-insert trigger turns each admin alert's email into the
-- admin's account and adds in_app, so these inserts only name the email.

create or replace function public.copy_owner_notification_to_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text := public.get_booking_forwarding_admin_email();
  venue_name text;
begin
  -- The admin owning a venue themselves would otherwise get every alert twice.
  if lower(coalesce(new.recipient_email, '')) = lower(admin_email) then
    return new;
  end if;

  select name into venue_name from public.venues where id = new.venue_id;

  insert into public.notifications (
    recipient_user_id,
    recipient_email,
    recipient_type,
    notification_type,
    title,
    body,
    action_label,
    action_url,
    related_entity_type,
    related_entity_id,
    venue_id,
    booking_request_id,
    enquiry_id,
    delivery_channels
  )
  values (
    null,
    admin_email,
    'admin',
    new.notification_type,
    coalesce(venue_name || ': ', '') || new.title,
    new.body,
    'Open in Demand',
    case
      when new.booking_request_id is not null then '/admin/demand?item=' || new.booking_request_id::text
      when new.enquiry_id is not null then '/admin/demand?item=' || new.enquiry_id::text
      else new.action_url
    end,
    new.related_entity_type,
    new.related_entity_id,
    new.venue_id,
    new.booking_request_id,
    new.enquiry_id,
    '["email", "in_app"]'::jsonb
  );

  return new;
end;
$$;

revoke execute on function public.copy_owner_notification_to_admin() from public, anon, authenticated;

drop trigger if exists copy_owner_notification_to_admin on public.notifications;
create trigger copy_owner_notification_to_admin
after insert on public.notifications
for each row
when (new.recipient_type = 'owner')
execute function public.copy_owner_notification_to_admin();

create or replace function public.notify_venue_enquiry_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_record public.venues%rowtype;
begin
  select * into venue_record from public.venues where id = new.venue_id;

  if venue_record.claimed_by is null then
    insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, enquiry_id, delivery_channels)
    values (null, public.get_booking_forwarding_admin_email(), 'admin', 'enquiry_submitted', coalesce(venue_record.name || ': ', '') || 'Enquiry to forward', 'An enquiry for unclaimed venue ' || coalesce(venue_record.name, new.venue_id) || ' needs forwarding.', 'Open in Demand', '/admin/demand?item=' || new.id::text, 'venue_enquiry', new.id::text, new.venue_id, new.id, '["email", "in_app"]'::jsonb);
    return new;
  end if;

  insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, enquiry_id, delivery_channels)
  values (venue_record.claimed_by, public.get_user_email(venue_record.claimed_by), 'owner', 'enquiry_submitted', 'New enquiry', 'You have a new enquiry for ' || venue_record.name || '.', 'View enquiries', '/owner/enquiries', 'venue_enquiry', new.id::text, new.venue_id, new.id, public.get_booking_notification_channels(venue_record.claimed_by, 'owner'));

  return new;
end;
$$;

revoke execute on function public.notify_venue_enquiry_inserted() from anon, authenticated;

drop policy if exists "Admins can insert venue media" on public.venue_media;
create policy "Admins can insert venue media"
on public.venue_media
for insert
with check (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()));

drop policy if exists "Admins can upload venue media files" on storage.objects;
create policy "Admins can upload venue media files"
on storage.objects
for insert
with check (
  bucket_id = 'venue-media'
  and exists (select 1 from public.admin_users where admin_users.user_id = auth.uid())
);

notify pgrst, 'reload schema';
