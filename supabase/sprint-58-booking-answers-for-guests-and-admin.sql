-- Email guests when their booking request is answered, and route unclaimed
-- venues' alternative responses to the nokta admin.
--
-- Every customer-facing branch of notify_booking_request_updated required
-- submitted_by, so a customer who booked without signing in never heard that
-- the venue accepted, declined, suggested another time, replied or cancelled.
-- The insert trigger already emails guests ('["email"]' when submitted_by is
-- null); the update trigger now does the same.
--
-- nokta answers requests on behalf of unclaimed venues (sprint-57). When the
-- customer then accepts or declines a suggested time, there is no owner to tell,
-- so those two branches email the admin instead.

create or replace function public.notify_booking_request_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_record public.venues%rowtype;
  customer_action_url text;
  customer_channels jsonb;
  owner_id uuid;
begin
  select * into venue_record from public.venues where id = new.venue_id;
  customer_action_url := case when new.customer_access_token is null then null else '/booking-status/' || new.customer_access_token end;
  customer_channels := case when new.submitted_by is null then '["email"]'::jsonb else public.get_booking_notification_channels(new.submitted_by, 'customer') end;
  owner_id := venue_record.claimed_by;

  /**
   * A reply with no status change. Checked before the status branches so that
   * an owner who accepts and writes a message still gets one notification for
   * the acceptance, which already carries the message, rather than two.
   */
  if old.status = new.status then
    if new.owner_response_message is not null
      and new.owner_response_message is distinct from old.owner_response_message
    then
      insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
      values (new.submitted_by, new.customer_email, 'customer', 'booking_reply', 'Venue replied', venue_record.name || ' replied to your booking request.', 'View booking status', customer_action_url, 'booking_request', new.id::text, new.venue_id, new.id, customer_channels);
    end if;

    return new;
  end if;

  if new.status = 'accepted' then
    insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
    values (new.submitted_by, new.customer_email, 'customer', 'booking_request_accepted', 'Booking confirmed', venue_record.name || ' has accepted your booking request.', 'View booking status', customer_action_url, 'booking_request', new.id::text, new.venue_id, new.id, customer_channels);
  elsif new.status = 'declined' then
    insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
    values (new.submitted_by, new.customer_email, 'customer', 'booking_request_declined', 'Booking declined', venue_record.name || ' was unable to accept your booking request.', 'View booking status', customer_action_url, 'booking_request', new.id::text, new.venue_id, new.id, customer_channels);
  elsif new.status = 'alternative_proposed' then
    insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
    values (new.submitted_by, new.customer_email, 'customer', 'booking_alternative_proposed', 'Venue proposed another time', venue_record.name || ' has suggested another date or time for your booking.', 'Review alternative', customer_action_url, 'booking_request', new.id::text, new.venue_id, new.id, customer_channels);
  elsif new.status = 'cancelled' then
    insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
    values (new.submitted_by, new.customer_email, 'customer', 'booking_cancelled', 'Booking cancelled', venue_record.name || ' cancelled this booking.', 'View booking status', customer_action_url, 'booking_request', new.id::text, new.venue_id, new.id, customer_channels);
  elsif new.status = 'customer_accepted_alternative' then
    if owner_id is not null then
      insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
      values (owner_id, public.get_user_email(owner_id), 'owner', 'booking_alternative_accepted', 'Alternative accepted', 'The customer accepted your proposed booking time.', 'View booking', '/owner/bookings?booking=' || new.id::text, 'booking_request', new.id::text, new.venue_id, new.id, public.get_booking_notification_channels(owner_id, 'owner'));
    else
      insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
      values (null, public.get_booking_forwarding_admin_email(), 'admin', 'booking_alternative_accepted', 'Alternative accepted', 'The customer accepted the time suggested for ' || venue_record.name || '.', 'Open in Demand', '/admin/demand?item=' || new.id::text, 'booking_request', new.id::text, new.venue_id, new.id, '["email"]'::jsonb);
    end if;
  elsif new.status = 'customer_declined_alternative' then
    if owner_id is not null then
      insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
      values (owner_id, public.get_user_email(owner_id), 'owner', 'booking_alternative_declined', 'Alternative declined', 'The customer declined your proposed booking time.', 'View booking', '/owner/bookings?booking=' || new.id::text, 'booking_request', new.id::text, new.venue_id, new.id, public.get_booking_notification_channels(owner_id, 'owner'));
    else
      insert into public.notifications (recipient_user_id, recipient_email, recipient_type, notification_type, title, body, action_label, action_url, related_entity_type, related_entity_id, venue_id, booking_request_id, delivery_channels)
      values (null, public.get_booking_forwarding_admin_email(), 'admin', 'booking_alternative_declined', 'Alternative declined', 'The customer declined the time suggested for ' || venue_record.name || '.', 'Open in Demand', '/admin/demand?item=' || new.id::text, 'booking_request', new.id::text, new.venue_id, new.id, '["email"]'::jsonb);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_booking_request_updated() from anon, authenticated;

notify pgrst, 'reload schema';
