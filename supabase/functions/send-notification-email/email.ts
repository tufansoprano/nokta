/**
 * Email templates for booking and enquiry notifications.
 *
 * Pure functions with no Deno or Supabase dependencies, so the same code renders
 * in the edge function and in `scripts/preview-notification-emails.ts`.
 *
 * Colours are the site's design tokens from src/styles.css, converted from oklch
 * to hex because email clients do not support oklch.
 */

export type NotificationType =
  | "booking_request_submitted"
  | "booking_request_accepted"
  | "booking_request_declined"
  | "booking_alternative_proposed"
  | "booking_alternative_accepted"
  | "booking_alternative_declined"
  | "booking_cancelled"
  | "booking_reply"
  | "enquiry_submitted";

export interface NotificationRow {
  id: string;
  recipient_email: string | null;
  recipient_type: "owner" | "customer" | "admin";
  notification_type: NotificationType;
  title?: string | null;
  body?: string | null;
  action_url: string | null;
  action_label: string | null;
  booking_request_id: string | null;
  enquiry_id: string | null;
  venue_id: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type Tone = "neutral" | "ok" | "bad" | "warn" | "info";
type Row = [label: string, value: unknown];

interface EmailContent {
  subject: string;
  /** Short status label shown as a chip above the title. */
  status: { label: string; tone: Tone };
  title: string;
  intro: string;
  /** A message someone wrote, shown as-is with its line breaks. */
  message?: { label: string; body: unknown };
  sections: { title?: string; rows: Row[] }[];
  action?: { label: string; url: string | null };
  footer: string;
}

const color = {
  pageBg: "#ffe7d2",
  surface: "#ffffff",
  ink: "#1e130f",
  inkMuted: "#62554f",
  border: "#e2d0c4",
  divider: "#f0e5df",
  accent: "#b3543c",
  accentDark: "#5c1e0f",
  chipTint: "#ffede9",
  button: "#c45d3e",
};

const tones: Record<Tone, { bg: string; ink: string; line: string }> = {
  neutral: { bg: "#f6eee8", ink: "#483a34", line: "#e2d0c4" },
  ok: { bg: "#e3f4e6", ink: "#1e4729", line: "#b6ddbd" },
  bad: { bg: "#ffe8e6", ink: "#89312f", line: "#f3bfba" },
  warn: { bg: "#ffeed1", ink: "#5b3b00", line: "#f0ca96" },
  info: { bg: "#ddedff", ink: "#1d456b", line: "#b6d1ee" },
};

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const WORDMARK_FONT = `Onest, ${FONT}`;

const FOOTERS = {
  customer: "You received this email because you made a booking request or enquiry on nokta.",
  owner: "You received this email because you manage a venue on nokta.",
  admin: "You received this email because you forward booking requests for unclaimed venues on nokta.",
};

export function buildBookingEmail(notification: NotificationRow, booking: Record<string, any>, appUrl: string): RenderedEmail {
  const venueName = clean(booking.venues?.name) || "the venue";
  const isClaimed = booking.venues?.is_claimed !== false;
  const actionUrl = notification.action_url ? absoluteUrl(appUrl, notification.action_url) : null;
  const ownerUrl = absoluteUrl(appUrl, `/owner/bookings?booking=${booking.id}`);
  const party = booking.party_size ? `${booking.party_size} ${booking.party_size === 1 ? "person" : "people"}` : "";
  const requested: Row[] = [["Venue", venueName], ["Date", formatDate(booking.requested_date)], ["Time", booking.requested_time], ["Party", party]];
  const proposedRows: Row[] = [["Venue", venueName], ["Suggested", formatDateTime(booking.proposed_date, booking.proposed_time)], ["You asked for", formatDateTime(booking.requested_date, booking.requested_time)], ["Party", party]];
  const reference: Row = ["Reference", booking.confirmation_reference];
  const customer: Row[] = [["Name", booking.customer_name], ["Email", booking.customer_email], ["Phone", booking.customer_phone], ["Occasion", booking.occasion]];
  const venueContact: Row[] = [["Phone", booking.venues?.phone], ["Website", booking.venues?.website], ["Instagram", booking.venues?.instagram]];
  const statusAction = (label = "View booking") => ({ label, url: actionUrl });

  switch (notification.notification_type) {
    case "booking_request_submitted":
      if (notification.recipient_type === "admin") {
        return renderEmail({
          subject: `Forward booking request: ${venueName}`,
          status: { label: "To forward", tone: "warn" },
          title: `Booking request for ${venueName}`,
          intro: `${venueName} isn't on nokta yet. Pass this request on, then record their answer in Demand and the customer is emailed.`,
          message: { label: "Customer's message", body: booking.message },
          sections: [{ rows: [...requested, reference] }, { title: "Customer", rows: customer }, { title: "Venue contact", rows: venueContact }],
          action: { label: "Open in Demand", url: actionUrl },
          footer: FOOTERS.admin,
        });
      }
      if (notification.recipient_type === "owner") {
        return renderEmail({
          subject: `New booking request for ${venueName}`,
          status: { label: "New request", tone: "info" },
          title: "New booking request",
          intro: `${clean(booking.customer_name) || "A customer"} would like to book ${venueName}. Accept, decline or suggest another time.`,
          message: { label: "Customer's message", body: booking.message },
          sections: [{ rows: [...requested, reference] }, { title: "Customer", rows: customer }],
          action: { label: "Manage booking", url: actionUrl ?? ownerUrl },
          footer: FOOTERS.owner,
        });
      }
      return renderEmail({
        subject: "Your booking request has been sent",
        status: { label: "Request sent", tone: "neutral" },
        title: "Your booking request is sent",
        intro: isClaimed
          ? `It isn't confirmed until ${venueName} accepts. We'll email you as soon as they answer.`
          : `We've passed it on to ${venueName}. It isn't confirmed until they accept, and we'll email you their answer.`,
        message: { label: "Your message", body: booking.message },
        sections: [{ rows: [...requested, reference] }],
        action: statusAction(),
        footer: FOOTERS.customer,
      });
    case "booking_request_accepted":
      return renderEmail({
        subject: `Your booking at ${venueName} is confirmed`,
        status: { label: "Confirmed", tone: "ok" },
        title: "Your booking is confirmed",
        intro: `${venueName} accepted your booking request.`,
        message: { label: `Message from ${venueName}`, body: booking.owner_response_message },
        sections: [{ rows: [...requested, reference] }],
        action: statusAction(),
        footer: FOOTERS.customer,
      });
    case "booking_request_declined":
      return renderEmail({
        subject: `${venueName} couldn't take your booking`,
        status: { label: "Declined", tone: "bad" },
        title: "Your booking request was declined",
        intro: `${venueName} can't take this booking.`,
        message: { label: `Message from ${venueName}`, body: booking.owner_response_message },
        sections: [{ rows: [...requested, reference] }],
        action: statusAction(),
        footer: FOOTERS.customer,
      });
    case "booking_alternative_proposed":
      return renderEmail({
        subject: `${venueName} suggested another time`,
        status: { label: "New time suggested", tone: "info" },
        title: `${venueName} suggested another time`,
        intro: "They can't do the time you asked for, but can do the one below. Accept or decline it from your booking page.",
        message: { label: `Message from ${venueName}`, body: booking.proposed_message },
        sections: [{ rows: [...proposedRows, reference] }],
        action: statusAction("Review the new time"),
        footer: FOOTERS.customer,
      });
    case "booking_alternative_accepted":
    case "booking_alternative_declined": {
      const accepted = notification.notification_type === "booking_alternative_accepted";
      const isAdmin = notification.recipient_type === "admin";
      return renderEmail({
        subject: accepted ? `Customer accepted the suggested time at ${venueName}` : `Customer declined the suggested time at ${venueName}`,
        status: accepted ? { label: "Time accepted", tone: "ok" } : { label: "Time declined", tone: "bad" },
        title: accepted ? "The customer accepted the new time" : "The customer declined the new time",
        intro: isAdmin
          ? `Let ${venueName} know the customer ${accepted ? "accepted" : "declined"} the time they suggested.`
          : accepted ? "The booking is now confirmed for the time you suggested." : "They can't make the time you suggested.",
        message: { label: "Customer's message", body: booking.customer_alternative_response_message },
        sections: [
          { rows: [["Venue", venueName], ["Suggested", formatDateTime(booking.proposed_date, booking.proposed_time)], ["Originally asked for", formatDateTime(booking.requested_date, booking.requested_time)], ["Party", party], reference] },
          { title: "Customer", rows: customer },
          ...(isAdmin ? [{ title: "Venue contact", rows: venueContact }] : []),
        ],
        action: isAdmin ? { label: "Open in Demand", url: actionUrl } : { label: "View booking", url: ownerUrl },
        footer: isAdmin ? FOOTERS.admin : FOOTERS.owner,
      });
    }
    case "booking_cancelled":
      return renderEmail({
        subject: `Your booking at ${venueName} was cancelled`,
        status: { label: "Cancelled", tone: "bad" },
        title: "Your booking was cancelled",
        intro: `${venueName} cancelled this booking.`,
        message: { label: `Message from ${venueName}`, body: booking.owner_response_message },
        sections: [{ rows: [...requested, reference] }],
        action: statusAction(),
        footer: FOOTERS.customer,
      });
    case "booking_reply":
      // A reply does not change the booking, so the status stays out of the subject.
      return renderEmail({
        subject: `${venueName} replied to your booking request`,
        status: { label: "New message", tone: "info" },
        title: `${venueName} replied`,
        intro: "Your booking hasn't changed. Here's what they said.",
        message: { label: `Message from ${venueName}`, body: booking.owner_response_message },
        sections: [{ rows: [...requested, reference] }],
        action: statusAction(),
        footer: FOOTERS.customer,
      });
    default:
      return buildGenericEmail(notification, appUrl);
  }
}

export function buildEnquiryEmail(notification: NotificationRow, enquiry: Record<string, any>, appUrl: string): RenderedEmail {
  const venueName = clean(enquiry.venues?.name) || "your venue";
  return renderEmail({
    subject: `New enquiry for ${venueName}`,
    status: { label: "New enquiry", tone: "info" },
    title: "New enquiry",
    intro: `${clean(enquiry.customer_name) || "A customer"} sent ${venueName} an enquiry. Reply to them directly.`,
    message: { label: "Customer's message", body: enquiry.message },
    sections: [{ rows: [["Venue", venueName], ["Type", humanise(enquiry.enquiry_type)], ["Party", enquiry.party_size ? `${enquiry.party_size} people` : null], ["Name", enquiry.customer_name], ["Email", enquiry.customer_email], ["Phone", enquiry.customer_phone]] }],
    action: { label: notification.action_label ?? "View enquiries", url: absoluteUrl(appUrl, notification.action_url ?? "/owner/enquiries") },
    footer: FOOTERS.owner,
  });
}

export function buildGenericEmail(notification: NotificationRow, appUrl: string): RenderedEmail {
  const title = clean(notification.title) || "You have a new notification";
  return renderEmail({
    subject: title,
    status: { label: "Update", tone: "neutral" },
    title,
    intro: clean(notification.body) || "There's something new for you on nokta.",
    sections: [],
    action: notification.action_url ? { label: notification.action_label ?? "Open nokta", url: absoluteUrl(appUrl, notification.action_url) } : undefined,
    footer: notification.recipient_type === "owner" ? FOOTERS.owner : notification.recipient_type === "admin" ? FOOTERS.admin : FOOTERS.customer,
  });
}

function renderEmail(content: EmailContent): RenderedEmail {
  const tone = tones[content.status.tone];
  const message = cleanMultiline(content.message?.body);
  const sections = content.sections
    .map((section) => ({ title: section.title, rows: section.rows.map(([label, value]) => [label, clean(value)] as const).filter(([, value]) => value) }))
    .filter((section) => section.rows.length);
  const action = content.action?.url ? content.action : null;

  const messageHtml = message && content.message
    ? `<tr><td style="padding:20px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${color.chipTint};border-left:3px solid ${color.accent};border-radius:12px"><tr><td style="padding:14px 16px"><p style="margin:0 0 6px;font-size:11px;line-height:1.4;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${color.accentDark}">${escapeHtml(content.message.label)}</p><p style="margin:0;font-size:15px;line-height:1.6;color:${color.ink}">${escapeHtml(message).replace(/\n/g, "<br>")}</p></td></tr></table></td></tr>`
    : "";

  const sectionsHtml = sections.map((section) => {
    const heading = section.title ? `<p style="margin:0 0 4px;font-size:11px;line-height:1.4;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${color.inkMuted}">${escapeHtml(section.title)}</p>` : "";
    const rows = section.rows.map(([label, value]) => `<tr><td valign="top" style="padding:9px 12px 9px 0;border-top:1px solid ${color.divider};font-size:13px;line-height:1.5;color:${color.inkMuted};width:38%">${escapeHtml(label)}</td><td valign="top" style="padding:9px 0;border-top:1px solid ${color.divider};font-size:14px;line-height:1.5;font-weight:600;color:${color.ink};word-break:break-word">${linkify(value)}</td></tr>`).join("");
    return `<tr><td style="padding:22px 0 0">${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table></td></tr>`;
  }).join("");

  const actionHtml = action
    ? `<tr><td style="padding:26px 0 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${color.button}"><a href="${escapeHtml(action.url!)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(action.label)}</a></td></tr></table><p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${color.inkMuted};word-break:break-all">Or open <a href="${escapeHtml(action.url!)}" style="color:${color.accent}">${escapeHtml(action.url!)}</a></p></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${color.pageBg};font-family:${FONT};color:${color.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(content.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${color.pageBg}">
<tr><td align="center" style="padding:32px 16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px"><span style="font-family:${WORDMARK_FONT};font-size:22px;font-weight:700;letter-spacing:0.02em;color:${color.ink}">nokta</span><span style="display:inline-block;width:6px;height:6px;margin-left:2px;border-radius:50%;background:${color.accent}"></span></td></tr>
<tr><td style="background:${color.surface};border:1px solid ${color.border};border-radius:16px;padding:28px 26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td><span style="display:inline-block;padding:4px 10px;border:1px solid ${tone.line};border-radius:999px;background:${tone.bg};font-size:12px;line-height:1.3;font-weight:600;color:${tone.ink}">${escapeHtml(content.status.label)}</span></td></tr>
<tr><td style="padding:14px 0 0"><h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.5px;color:${color.ink}">${escapeHtml(content.title)}</h1></td></tr>
<tr><td style="padding:8px 0 0"><p style="margin:0;font-size:15px;line-height:1.6;color:${color.inkMuted}">${escapeHtml(content.intro)}</p></td></tr>
${messageHtml}
${sectionsHtml}
${actionHtml}
</table>
</td></tr>
<tr><td style="padding:18px 6px 0"><p style="margin:0;font-size:12px;line-height:1.6;color:${color.inkMuted}">${escapeHtml(content.footer)}</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.title,
    "",
    content.intro,
    ...(message && content.message ? ["", `${content.message.label}:`, message] : []),
    ...sections.flatMap((section) => ["", ...(section.title ? [section.title] : []), ...section.rows.map(([label, value]) => `${label}: ${value}`)]),
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    "",
    "--",
    content.footer,
  ].join("\n");

  return { subject: content.subject, html, text };
}

function absoluteUrl(appUrl: string, path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${appUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** "2026-10-29" -> "Thu 29 Oct 2026". Unparseable input is returned as-is. */
function formatDate(value: unknown) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date(`${raw}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(date: unknown, time: unknown) {
  return [formatDate(date), clean(time)].filter(Boolean).join(", ");
}

function humanise(value: unknown) {
  const raw = clean(value).replace(/_/g, " ");
  return raw ? raw[0].toUpperCase() + raw.slice(1) : "";
}

/** Links URLs and email addresses in a detail value; everything else is escaped text. */
function linkify(value: string) {
  const escaped = escapeHtml(value);
  if (/^https?:\/\//.test(value)) return `<a href="${escaped}" style="color:${color.accent}">${escapeHtml(value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `<a href="mailto:${escaped}" style="color:${color.accent}">${escaped}</a>`;
  if (/^\+?[\d\s()-]{7,}$/.test(value)) return `<a href="tel:${escapeHtml(value.replace(/[^\d+]/g, ""))}" style="color:${color.ink};text-decoration:none">${escaped}</a>`;
  return escaped;
}

export function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Like clean, but keeps the line breaks someone typed into a message. */
function cleanMultiline(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
