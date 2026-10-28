import { trackEvent } from "@/lib/analytics";
import { reportError } from "@/lib/errorReporting";

interface SendNotificationEmailInput {
  notificationId?: string;
  bookingRequestId?: string;
  enquiryId?: string;
}

interface SendNotificationEmailResult {
  processed?: number;
  error?: string;
}

/**
 * The Supabase function that sends these emails runs with the service role key, so
 * it is not callable from the browser. This posts to the server-side proxy at
 * /api/send-notification-email, which holds the shared secret and forwards the call.
 */
const DISPATCH_ENDPOINT = "/api/send-notification-email";

export async function queueEmailDeliveryForNotification(input: SendNotificationEmailInput): Promise<void> {
  trackEvent("email_notification_queued", { hasActionUrl: true });
  try {
    await sendNotificationEmail(input);
  } catch (error) {
    // Callers fire and forget, so this is the one place a failed send is seen in production.
    reportError(error, {
      source: "email_delivery",
      notification_id: input.notificationId,
      booking_request_id: input.bookingRequestId,
      enquiry_id: input.enquiryId,
    });
    throw error;
  }
}

export async function sendNotificationEmail(input: SendNotificationEmailInput): Promise<void> {
  const first = await dispatch(input);
  if ((first.processed ?? 0) > 0) return;

  // The notification rows are written by database triggers, so a request that
  // arrives before those land finds nothing pending. One short retry covers it.
  await new Promise((resolve) => window.setTimeout(resolve, 750));
  const retry = await dispatch(input);
  if ((retry.processed ?? 0) === 0) throw new Error("Could not send notification email: no pending email notification was found.");
}

async function dispatch(input: SendNotificationEmailInput): Promise<SendNotificationEmailResult> {
  let response: Response;
  try {
    response = await fetch(DISPATCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Network request failed.";
    throw new Error(`Could not send notification email: ${message}`);
  }

  const result = (await response.json().catch(() => ({}))) as SendNotificationEmailResult;
  if (!response.ok) throw new Error(`Could not send notification email: ${result.error ?? response.statusText}`);
  if (result.error) throw new Error(`Could not send notification email: ${result.error}`);
  return result;
}
