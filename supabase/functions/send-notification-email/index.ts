import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function is invoked server-to-server by the /api/send-notification-email
// proxy, never from a browser, so no cross-origin access is granted.
const corsHeaders = {};

type NotificationType =
  | "booking_request_submitted"
  | "booking_request_accepted"
  | "booking_request_declined"
  | "booking_alternative_proposed"
  | "booking_alternative_accepted"
  | "booking_alternative_declined"
  | "booking_cancelled"
  | "booking_reply"
  | "enquiry_submitted";

interface NotificationRow {
  id: string;
  recipient_email: string | null;
  recipient_type: "owner" | "customer" | "admin";
  notification_type: NotificationType;
  action_url: string | null;
  action_label: string | null;
  booking_request_id: string | null;
  enquiry_id: string | null;
  venue_id: string | null;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...init.headers },
  });
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

/**
 * This function holds the service role key and cannot require a Supabase JWT,
 * because signed-out visitors submit bookings and enquiries and still need their
 * confirmation email. It therefore authenticates its caller with a shared secret
 * that only the server-side proxy knows.
 */
function isAuthorisedCaller(request: Request) {
  const expected = Deno.env.get("NOTIFICATION_DISPATCH_SECRET");
  if (!expected) return false;
  const provided = request.headers.get("x-notification-secret");
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

// Compare in constant time so a caller cannot recover the secret byte by byte.
function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, { status: 405 });

  if (!Deno.env.get("NOTIFICATION_DISPATCH_SECRET")) {
    console.log("send-notification-email rejected", { reason: "missing_dispatch_secret" });
    return jsonResponse({ error: "Email delivery is not configured." }, { status: 500 });
  }

  if (!isAuthorisedCaller(request)) {
    console.log("send-notification-email rejected", { reason: "unauthorised_caller" });
    return jsonResponse({ error: "Not authorised." }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const payload = await request.json();
    const notificationId = asUuid(payload?.notificationId);
    const deliveryLogId = asUuid(payload?.deliveryLogId);
    const bookingRequestId = asUuid(payload?.bookingRequestId);
    const enquiryId = asUuid(payload?.enquiryId);
    console.log("send-notification-email request", { notificationId, deliveryLogId, bookingRequestId, enquiryId });
    if (!notificationId && !deliveryLogId && !bookingRequestId && !enquiryId) {
      return jsonResponse({ error: "A valid notificationId, deliveryLogId, bookingRequestId or enquiryId is required." }, { status: 400 });
    }
    const notifications = await getTargetNotifications(supabase, { notificationId, deliveryLogId, bookingRequestId, enquiryId });
    console.log("send-notification-email targets", { count: notifications.length });
    const results = [];

    for (const notification of notifications) {
      results.push(await sendNotification(supabase, notification));
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send notification email.";
    return jsonResponse({ error: message }, { status: 500 });
  }
});

async function getTargetNotifications(supabase: ReturnType<typeof createAdminClient>, input: { notificationId?: string; deliveryLogId?: string; bookingRequestId?: string; enquiryId?: string }) {
  if (typeof input.deliveryLogId === "string") {
    const { data, error } = await supabase
      .from("notification_delivery_logs")
      .select("notifications(*)")
      .eq("id", input.deliveryLogId)
      .eq("channel", "email")
      .eq("status", "pending")
      .maybeSingle();
    if (error) throw error;
    const notification = data?.notifications;
    return notification ? [notification as NotificationRow] : [];
  }

  let notificationIds: string[] | null = null;
  if (typeof input.bookingRequestId === "string" || typeof input.enquiryId === "string") {
    let notificationQuery = supabase.from("notifications").select("id");
    if (typeof input.bookingRequestId === "string") notificationQuery = notificationQuery.eq("booking_request_id", input.bookingRequestId);
    if (typeof input.enquiryId === "string") notificationQuery = notificationQuery.eq("enquiry_id", input.enquiryId);
    const { data, error } = await notificationQuery;
    if (error) throw error;
    notificationIds = (data ?? []).map((notification) => notification.id);
    console.log("send-notification-email notification ids", { count: notificationIds.length, bookingRequestId: input.bookingRequestId, enquiryId: input.enquiryId });
    if (notificationIds.length === 0 && typeof input.bookingRequestId === "string") {
      notificationIds = await createMissingBookingSubmittedNotifications(supabase, input.bookingRequestId);
    }
    if (notificationIds.length === 0) return [];
  }

  let query = supabase
    .from("notification_delivery_logs")
    .select("notifications(*)")
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (typeof input.notificationId === "string") query = query.eq("notification_id", input.notificationId);
  else if (notificationIds) query = query.in("notification_id", notificationIds);
  else throw new Error("notificationId, bookingRequestId or enquiryId is required.");

  const { data, error } = await query.limit(10);
  if (error) throw error;
  const notifications = ((data ?? []) as { notifications: NotificationRow | null }[]).map((row) => row.notifications).filter(Boolean) as NotificationRow[];
  if (notifications.length > 0 || !notificationIds) return notifications;

  const fallback = await supabase.from("notifications").select("*").in("id", notificationIds);
  if (fallback.error) throw fallback.error;
  console.log("send-notification-email fallback notifications", { count: fallback.data?.length ?? 0 });
  return (fallback.data ?? []) as NotificationRow[];
}

async function createMissingBookingSubmittedNotifications(supabase: ReturnType<typeof createAdminClient>, bookingRequestId: string) {
  const { data: booking, error } = await supabase
    .from("booking_requests")
    .select("id,venue_id,submitted_by,customer_email,customer_access_token,venues(name,claimed_by)")
    .eq("id", bookingRequestId)
    .single();
  if (error) throw error;
  if (!booking) return [];

  const venue = Array.isArray(booking.venues) ? booking.venues[0] : booking.venues;
  const venueName = clean(venue?.name ?? "this venue");
  const customerActionUrl = booking.customer_access_token ? `/booking-status/${booking.customer_access_token}` : null;
  const notificationsToCreate = [
    {
      recipient_user_id: booking.submitted_by,
      recipient_email: booking.customer_email,
      recipient_type: "customer",
      notification_type: "booking_request_submitted",
      title: "Your booking request has been sent",
      body: `Your booking request for ${venueName} has been sent.`,
      action_label: "View booking status",
      action_url: customerActionUrl,
      related_entity_type: "booking_request",
      related_entity_id: booking.id,
      venue_id: booking.venue_id,
      booking_request_id: booking.id,
      delivery_channels: ["email"],
    },
  ];

  if (venue?.claimed_by) {
    const ownerEmail = await getUserEmail(supabase, venue.claimed_by);
    notificationsToCreate.push({
      recipient_user_id: venue.claimed_by,
      recipient_email: ownerEmail,
      recipient_type: "owner",
      notification_type: "booking_request_submitted",
      title: "New booking request",
      body: `You have a new booking request for ${venueName}.`,
      action_label: "View booking",
      action_url: `/owner/bookings?booking=${booking.id}`,
      related_entity_type: "booking_request",
      related_entity_id: booking.id,
      venue_id: booking.venue_id,
      booking_request_id: booking.id,
      delivery_channels: ["email"],
    });
  }

  const { data, error: insertError } = await supabase.from("notifications").insert(notificationsToCreate).select("id");
  if (insertError) throw insertError;
  const notificationIds = (data ?? []).map((notification) => notification.id);
  console.log("send-notification-email created missing notifications", { count: notificationIds.length, bookingRequestId });
  return notificationIds;
}

async function getUserEmail(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    console.log("send-notification-email owner email lookup failed", { userId, reason: safeError(error.message) });
    return null;
  }
  return data.user?.email ?? null;
}

async function sendNotification(supabase: ReturnType<typeof createAdminClient>, notification: NotificationRow) {
  console.log("send-notification-email processing", { notificationId: notification.id, type: notification.notification_type, recipientType: notification.recipient_type });
  const { data: log, error: logError } = await supabase
    .from("notification_delivery_logs")
    .select("id,status")
    .eq("notification_id", notification.id)
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (logError) throw logError;
  let deliveryLogId = log?.id ?? null;
  if (!deliveryLogId) {
    const { data: createdLog, error: createLogError } = await supabase
      .from("notification_delivery_logs")
      .insert({ notification_id: notification.id, channel: "email", status: "pending" })
      .select("id")
      .single();
    if (createLogError) throw createLogError;
    deliveryLogId = createdLog.id;
    console.log("send-notification-email created missing email log", { notificationId: notification.id, deliveryLogId });
  }

  if (!notification.recipient_email) {
    await updateLog(supabase, deliveryLogId, { status: "skipped", provider: "noop", error_message: "Recipient email is missing." });
    return { notificationId: notification.id, status: "skipped", reason: "Recipient email is missing." };
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.log("send-notification-email skipped", { notificationId: notification.id, reason: "missing_resend_api_key" });
    await updateLog(supabase, deliveryLogId, { status: "skipped", provider: "noop", error_message: "RESEND_API_KEY is not configured." });
    return { notificationId: notification.id, status: "skipped", reason: "RESEND_API_KEY is not configured." };
  }

  const email = await buildEmail(supabase, notification);
  const fromName = Deno.env.get("EMAIL_FROM_NAME") ?? "Nokta";
  const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS");
  if (!fromAddress) {
    console.log("send-notification-email skipped", { notificationId: notification.id, reason: "missing_from_address" });
    await updateLog(supabase, deliveryLogId, { status: "skipped", provider: "noop", error_message: "EMAIL_FROM_ADDRESS is not configured." });
    return { notificationId: notification.id, status: "skipped", reason: "EMAIL_FROM_ADDRESS is not configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: [notification.recipient_email],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof result?.message === "string" ? result.message : "Resend email send failed.";
    console.log("send-notification-email failed", { notificationId: notification.id, reason: safeError(message) });
    await updateLog(supabase, deliveryLogId, { status: "failed", provider: "resend", error_message: safeError(message) });
    return { notificationId: notification.id, status: "failed", reason: safeError(message) };
  }

  await updateLog(supabase, deliveryLogId, { status: "sent", provider: "resend", provider_message_id: typeof result?.id === "string" ? result.id : null, error_message: null, delivered_at: new Date().toISOString() });
  console.log("send-notification-email sent", { notificationId: notification.id, providerMessageId: typeof result?.id === "string" ? result.id : null });
  return { notificationId: notification.id, status: "sent" };
}

async function buildEmail(supabase: ReturnType<typeof createAdminClient>, notification: NotificationRow) {
  if (notification.booking_request_id) {
    const { data, error } = await supabase.from("booking_requests").select("*,venues(name,phone,website,instagram)").eq("id", notification.booking_request_id).single();
    if (error) throw error;
    return buildBookingEmail(notification, data);
  }
  if (notification.enquiry_id) {
    const { data, error } = await supabase.from("venue_enquiries").select("*,venues(name)").eq("id", notification.enquiry_id).single();
    if (error) throw error;
    return buildEnquiryEmail(notification, data);
  }
  return buildGenericEmail(notification);
}

function buildBookingEmail(notification: NotificationRow, booking: Record<string, any>) {
  const venueName = clean(booking.venues?.name ?? "your venue");
  const statusUrl = notification.action_url ? absoluteUrl(notification.action_url) : null;
  const requested = `${clean(booking.requested_date)} ${clean(booking.requested_time)}`.trim();
  const proposed = `${clean(booking.proposed_date)} ${clean(booking.proposed_time)}`.trim();
  const reference = clean(booking.confirmation_reference ?? "Pending");
  const party = booking.party_size ? `${booking.party_size} people` : "";
  const common = [`Venue: ${venueName}`, `Requested: ${requested}`, `Party size: ${party}`, `Reference: ${reference}`].filter(Boolean);

  switch (notification.notification_type) {
    case "booking_request_submitted":
      // Unclaimed venue: nokta forwards the request, so the admin gets everything needed to pass it on.
      if (notification.recipient_type === "admin") return renderEmail({ subject: `Forward booking request: ${venueName}`, lines: [`${venueName} isn't on nokta yet. Pass this request on and record their answer.`, ...common, `Customer: ${clean(booking.customer_name)}`, `Email: ${clean(booking.customer_email)}`, optional("Phone", booking.customer_phone), optional("Occasion", booking.occasion), optional("Message", booking.message), optional("Venue phone", booking.venues?.phone), optional("Venue website", booking.venues?.website), optional("Venue Instagram", booking.venues?.instagram)], actionUrl: statusUrl, actionLabel: "Open in Demand", footer: "You received this email because you forward booking requests for unclaimed venues on Nokta." });
      if (notification.recipient_type === "owner") return renderEmail({ subject: `New booking request for ${venueName}`, lines: [`You have a new booking request for ${venueName}.`, ...common, `Customer: ${clean(booking.customer_name)}`, `Email: ${clean(booking.customer_email)}`, optional("Phone", booking.customer_phone), optional("Occasion", booking.occasion)], actionUrl: statusUrl ?? absoluteUrl(`/owner/bookings?booking=${booking.id}`), actionLabel: "Manage booking", owner: true });
      return renderEmail({ subject: "Your booking request has been sent", lines: [`Your booking request for ${venueName} has been sent.`, "This is not confirmed yet. The venue will review your request.", ...common], actionUrl: statusUrl, actionLabel: "View booking status" });
    case "booking_request_accepted":
      return renderEmail({ subject: "Your booking is confirmed", lines: [`${venueName} has accepted your booking request. Your booking is confirmed.`, ...common], actionUrl: statusUrl, actionLabel: "View booking status" });
    case "booking_request_declined":
      return renderEmail({ subject: "Your booking request was declined", lines: [`${venueName} was unable to accept your booking request.`, ...common, optional("Venue message", booking.owner_response_message)], actionUrl: statusUrl, actionLabel: "View booking status" });
    case "booking_alternative_proposed":
      return renderEmail({ subject: `${venueName} proposed another booking time`, lines: [`${venueName} has suggested another date or time for your booking.`, `Original request: ${requested}`, `Proposed: ${proposed}`, `Party size: ${party}`, optional("Venue message", booking.proposed_message)], actionUrl: statusUrl, actionLabel: "Review alternative" });
    case "booking_alternative_accepted":
      return renderEmail({ subject: "Customer accepted your proposed booking time", lines: [`The customer accepted your proposed booking time for ${venueName}.`, ...common, `Customer: ${clean(booking.customer_name)}`], actionUrl: absoluteUrl(`/owner/bookings?booking=${booking.id}`), actionLabel: "View booking", owner: true });
    case "booking_alternative_declined":
      return renderEmail({ subject: "Customer declined your proposed booking time", lines: [`The customer declined your proposed booking time for ${venueName}.`, `Original request: ${requested}`, `Proposed: ${proposed}`, `Party size: ${party}`, `Customer: ${clean(booking.customer_name)}`, optional("Customer response", booking.customer_alternative_response_message)], actionUrl: absoluteUrl(`/owner/bookings?booking=${booking.id}`), actionLabel: "View booking", owner: true });
    case "booking_cancelled":
      return renderEmail({ subject: "Your booking was cancelled", lines: [`${venueName} cancelled this booking.`, ...common], actionUrl: statusUrl, actionLabel: "View booking status" });
    case "booking_reply":
      // A reply does not change the booking, so the status stays out of the subject.
      return renderEmail({ subject: `${venueName} replied to your booking request`, lines: [`${venueName} replied to your booking request.`, optional("Venue message", booking.owner_response_message), "", ...common], actionUrl: statusUrl, actionLabel: "View booking status" });
    default:
      return buildGenericEmail(notification);
  }
}

function buildEnquiryEmail(notification: NotificationRow, enquiry: Record<string, any>) {
  const venueName = clean(enquiry.venues?.name ?? "your venue");
  return renderEmail({
    subject: `New enquiry for ${venueName}`,
    lines: [`You have a new enquiry for ${venueName}.`, optional("Type", enquiry.enquiry_type), `Customer: ${clean(enquiry.customer_name)}`, `Email: ${clean(enquiry.customer_email)}`, optional("Phone", enquiry.customer_phone), optional("Message", enquiry.message)],
    actionUrl: absoluteUrl(notification.action_url ?? "/owner/enquiries"),
    actionLabel: notification.action_label ?? "View enquiries",
    owner: true,
  });
}

function buildGenericEmail(notification: NotificationRow) {
  return renderEmail({ subject: clean(notification.notification_type), lines: ["There is a new Nokta notification."], actionUrl: notification.action_url ? absoluteUrl(notification.action_url) : null, actionLabel: notification.action_label });
}

function renderEmail(input: { subject: string; lines: string[]; actionUrl?: string | null; actionLabel?: string | null; owner?: boolean; footer?: string }) {
  const lines = input.lines.filter(Boolean).map((line) => truncate(clean(line), 700));
  const actionHtml = input.actionUrl ? `<p style="margin:28px 0 10px"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#B3543C;color:#ffffff;text-decoration:none;border-radius:12px;padding:13px 18px;font-weight:700">${escapeHtml(input.actionLabel ?? "Open Nokta")}</a></p><p style="margin:0;font-size:12px;line-height:1.5;color:#8C7C76;word-break:break-all">${escapeHtml(input.actionUrl)}</p>` : "";
  const htmlLines = lines.map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`).join("");
  const footer = input.footer ?? (input.owner ? "You received this email because you manage a venue on Nokta." : "You received this email because you used Nokta for a booking or venue enquiry.");
  const html = `<!doctype html><html><body style="margin:0;background:#FFF3E6;font-family:Arial,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1E130F"><main style="max-width:620px;margin:0 auto;padding:36px 18px"><div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:22px;color:#1E130F">nokta<span style="color:#DB5D2C">.</span></div><section style="background:#FEFDFD;border:1px solid #E2D0C4;border-radius:18px;padding:28px;box-shadow:0 18px 44px rgba(30,19,15,0.06)"><h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:#1E130F">${escapeHtml(input.subject)}</h1><div style="height:1px;background:#E2D0C4;margin:0 0 18px"></div><div style="font-size:15px;line-height:1.7;color:#483A34">${htmlLines}</div>${actionHtml}</section><p style="margin:18px 4px 0;font-size:12px;line-height:1.6;color:#8C7C76">${escapeHtml(footer)}</p></main></body></html>`;
  const text = [input.subject, "", ...lines, ...(input.actionUrl ? ["", input.actionLabel ?? "Open Nokta", input.actionUrl] : []), "", footer].join("\n");
  return { subject: input.subject, html, text };
}

async function updateLog(supabase: ReturnType<typeof createAdminClient>, deliveryLogId: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from("notification_delivery_logs")
    .update({ ...updates, attempted_at: new Date().toISOString() })
    .eq("id", deliveryLogId);
  if (error) throw error;
}

function absoluteUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const appUrl = Deno.env.get("APP_URL") ?? Deno.env.get("LIVE_APP_URL") ?? "http://localhost:5173";
  return `${appUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function optional(label: string, value: unknown) {
  const next = clean(value);
  return next ? `${label}: ${next}` : "";
}

function asUuid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#039;");
}

function safeError(value: string) {
  return truncate(clean(value), 300);
}
