/**
 * Renders every notification email with sample data so the templates can be
 * checked in a browser before deploying the edge function.
 *
 *   npx tsx scripts/preview-notification-emails.ts [outDir]
 *
 * Writes one HTML file per email plus index.html, which shows them all.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildBookingEmail, buildEnquiryEmail, buildGenericEmail, type NotificationRow } from "../supabase/functions/send-notification-email/email";

const outDir = resolve(process.argv[2] ?? "test-results/notification-emails");
const appUrl = "https://www.nokta.uk";

const venue = { name: "Nokta Forwarding Test", phone: "020 7946 0000", website: "https://example.com/", instagram: "https://instagram.com/nokta", is_claimed: false };
const booking = {
  id: "43efd843-c7ba-4634-a6e1-7080fcbedb8c",
  venues: venue,
  customer_name: "Forwarding Test",
  customer_email: "guest@example.com",
  customer_phone: "07700 900123",
  party_size: 4,
  requested_date: "2026-10-29",
  requested_time: "20:00",
  proposed_date: "2026-10-29",
  proposed_time: "21:30",
  occasion: "Birthday",
  message: "Could we sit outside if it's dry?\nOne of us is vegetarian.",
  owner_response_message: "All good, accepted.\nSee you soon!",
  proposed_message: "We're full at 20:00 but 21:30 works.",
  customer_alternative_response_message: "21:30 is too late for us, sorry.",
  confirmation_reference: "NK-7Q4D",
};

function notification(notification_type: NotificationRow["notification_type"], recipient_type: NotificationRow["recipient_type"], action_url: string | null): NotificationRow {
  return { id: "preview", recipient_email: null, recipient_type, notification_type, action_url, action_label: null, booking_request_id: booking.id, enquiry_id: null, venue_id: "preview", title: "Your listing update was approved", body: "Your changes are now live on nokta." };
}

const statusUrl = "/booking-status/preview-token";
const demandUrl = `/admin/demand?item=${booking.id}`;
const emails = {
  "submitted-customer-unclaimed": buildBookingEmail(notification("booking_request_submitted", "customer", statusUrl), booking, appUrl),
  "submitted-customer-claimed": buildBookingEmail(notification("booking_request_submitted", "customer", statusUrl), { ...booking, venues: { ...venue, is_claimed: true } }, appUrl),
  "submitted-admin": buildBookingEmail(notification("booking_request_submitted", "admin", demandUrl), booking, appUrl),
  "submitted-owner": buildBookingEmail(notification("booking_request_submitted", "owner", `/owner/bookings?booking=${booking.id}`), booking, appUrl),
  "accepted": buildBookingEmail(notification("booking_request_accepted", "customer", statusUrl), booking, appUrl),
  "accepted-no-message": buildBookingEmail(notification("booking_request_accepted", "customer", statusUrl), { ...booking, owner_response_message: null }, appUrl),
  "declined": buildBookingEmail(notification("booking_request_declined", "customer", statusUrl), booking, appUrl),
  "alternative-proposed": buildBookingEmail(notification("booking_alternative_proposed", "customer", statusUrl), booking, appUrl),
  "alternative-accepted-admin": buildBookingEmail(notification("booking_alternative_accepted", "admin", demandUrl), { ...booking, customer_alternative_response_message: null }, appUrl),
  "alternative-declined-owner": buildBookingEmail(notification("booking_alternative_declined", "owner", null), booking, appUrl),
  "cancelled": buildBookingEmail(notification("booking_cancelled", "customer", statusUrl), booking, appUrl),
  "reply": buildBookingEmail(notification("booking_reply", "customer", statusUrl), booking, appUrl),
  "enquiry-owner": buildEnquiryEmail(notification("enquiry_submitted", "owner", "/owner/enquiries"), { venues: venue, customer_name: "Ayla", customer_email: "ayla@example.com", customer_phone: null, enquiry_type: "private_event", party_size: 30, message: "Do you do private hire on Saturdays?" }, appUrl),
  "generic": buildGenericEmail(notification("enquiry_submitted", "owner", "/owner"), appUrl),
};

mkdirSync(outDir, { recursive: true });
for (const [name, email] of Object.entries(emails)) {
  writeFileSync(join(outDir, `${name}.html`), email.html);
  writeFileSync(join(outDir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
}
const cards = Object.entries(emails).map(([name, email]) => `<figure><figcaption><b>${name}</b><br>${email.subject.replace(/</g, "&lt;")}</figcaption><iframe src="${name}.html"></iframe></figure>`).join("");
writeFileSync(join(outDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Notification emails</title><style>body{margin:0;padding:24px;background:#eee;font:13px system-ui}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px}figure{margin:0}figcaption{margin-bottom:6px}iframe{width:100%;height:900px;border:1px solid #ccc;background:#fff}</style><main>${cards}</main>`);
console.log(`Wrote ${Object.keys(emails).length} emails to ${outDir}`);
