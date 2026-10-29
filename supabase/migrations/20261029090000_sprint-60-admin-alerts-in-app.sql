-- Show nokta admin alerts in the in-app bell, not just by email.
--
-- The booking triggers (sprints 57 and 58) address admin alerts to the
-- forwarding email only: recipient_user_id is null and delivery_channels is
-- ["email"]. The bell lists notifications by recipient_user_id, so the admin
-- never saw them in the app.
--
-- Rather than touch every trigger that writes an admin alert, resolve the
-- recipient once, on the way into notifications: if the admin email belongs to
-- a nokta account, address the alert to that account and add in_app. The
-- after-insert trigger then logs the in_app delivery as usual; email is
-- unchanged.

create or replace function public.resolve_admin_notification_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_user_id uuid;
begin
  if new.recipient_type <> 'admin' or new.recipient_user_id is not null or new.recipient_email is null then
    return new;
  end if;

  select id into admin_user_id from auth.users where lower(email) = lower(new.recipient_email) limit 1;
  if admin_user_id is null then
    return new;
  end if;

  new.recipient_user_id := admin_user_id;
  if not coalesce(new.delivery_channels, '[]'::jsonb) ? 'in_app' then
    new.delivery_channels := coalesce(new.delivery_channels, '[]'::jsonb) || '["in_app"]'::jsonb;
  end if;
  return new;
end;
$$;

revoke execute on function public.resolve_admin_notification_recipient() from public, anon, authenticated;

drop trigger if exists resolve_admin_notification_recipient on public.notifications;
create trigger resolve_admin_notification_recipient
before insert on public.notifications
for each row
execute function public.resolve_admin_notification_recipient();

-- Earlier admin alerts go into the bell as history, already read: they were
-- emailed and handled at the time.
update public.notifications as notification
set recipient_user_id = admin_user.id,
    read_at = coalesce(notification.read_at, now())
from auth.users as admin_user
where notification.recipient_type = 'admin'
  and notification.recipient_user_id is null
  and lower(admin_user.email) = lower(notification.recipient_email);

notify pgrst, 'reload schema';
