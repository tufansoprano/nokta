-- Forward booking requests for unclaimed venues to the nokta admin.
--
-- Every venue now takes booking requests, claimed or not. A claimed venue's owner
-- is emailed on each new request; an unclaimed venue has no owner, so until now
-- the request sat on the admin Demand page with nobody told about it. This adds
-- an admin email for those requests so nokta can pass them on to the venue.
--
-- The admin inbox is a single address for now. Move it to a settings table when
-- more than one person handles forwarding.

create or replace function public.notify_booking_request_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_record public.venues%rowtype;
  status_url text;
begin
  select * into venue_record from public.venues where id = new.venue_id;
  status_url := case when new.customer_access_token is null then null else '/booking-status/' || new.customer_access_token end;

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
    delivery_channels
  )
  values (
    new.submitted_by,
    new.customer_email,
    'customer',
    'booking_request_submitted',
    'Your booking request has been sent',
    'Your booking request for ' || coalesce(venue_record.name, 'this venue') || ' has been sent.',
    'View booking status',
    status_url,
    'booking_request',
    new.id::text,
    new.venue_id,
    new.id,
    case when new.submitted_by is null then '["email"]'::jsonb else public.get_booking_notification_channels(new.submitted_by, 'customer') end
  );

  if venue_record.claimed_by is not null then
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
      delivery_channels
    )
    values (
      venue_record.claimed_by,
      public.get_user_email(venue_record.claimed_by),
      'owner',
      'booking_request_submitted',
      'New booking request',
      'You have a new booking request for ' || venue_record.name || '.',
      'View booking',
      '/owner/bookings?booking=' || new.id::text,
      'booking_request',
      new.id::text,
      new.venue_id,
      new.id,
      public.get_booking_notification_channels(venue_record.claimed_by, 'owner')
    );
  else
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
      delivery_channels
    )
    values (
      null,
      'tufanbutuner@gmail.com',
      'admin',
      'booking_request_submitted',
      'Booking request to forward',
      'A booking request for unclaimed venue ' || coalesce(venue_record.name, new.venue_id) || ' needs forwarding.',
      'Open in Demand',
      '/admin/demand?item=' || new.id::text,
      'booking_request',
      new.id::text,
      new.venue_id,
      new.id,
      '["email"]'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_booking_request_inserted() from anon, authenticated;

notify pgrst, 'reload schema';
