import { trackEvent, trackVenueAnalyticsEvent } from "@/lib/analytics";
import { getRequestedDateBucket, getPartySizeBucket } from "@/lib/bookingRequestAnalytics";
import { mapBookingRequestRowToBookingRequest } from "@/lib/bookingRequestMappers";
import { validateCreateBookingRequestInput } from "@/lib/bookingRequestValidation";
import { generateConfirmationReference, generateCustomerAccessToken, getCustomerAccessTokenExpiry } from "@/lib/bookingTokens";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import { checkVenueBookingRequestAvailability, getVenueBookingGate } from "@/services/bookingAvailabilityService";
import { queueEmailDeliveryForNotification } from "@/services/emailDeliveryService";
import type { BookingRequest, CreateBookingRequestInput } from "@/types/bookingRequests";
import type { BookingRequestRow } from "@/types/database";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function createBookingRequest(input: { userId?: string | null; request: CreateBookingRequestInput; venue?: { city?: string | null; area?: string | null } }): Promise<BookingRequest> {
  const validation = validateCreateBookingRequestInput(input.request);
  if (!validation.isValid) throw new Error(Object.values(validation.errors)[0] ?? "Booking request is not valid.");
  // Unclaimed venues still take requests: nokta forwards them until the venue joins.
  // Only a claimed venue that switched requests off is closed.
  const gate = await getVenueBookingGate(input.request.venueId);
  if (!gate || gate.state === "disabled") throw new Error("This venue is not taking Nokta booking requests right now. Contact the venue directly.");
  const availability = await checkVenueBookingRequestAvailability({ venueId: input.request.venueId, requestedDate: input.request.requestedDate, requestedTime: input.request.requestedTime, partySize: input.request.partySize });
  if (!availability.isAvailable) {
    trackEvent("booking_request_blocked_by_availability", { venueId: input.request.venueId, reason: availability.errors[0] ?? "unavailable", sourceSurface: input.request.sourceSurface ?? "venue_page" });
    throw new Error(availability.errors[0] ?? "This booking request is not available.");
  }

  const client = ensureSupabase();
  const bookingRequestId = crypto.randomUUID();
  const customerAccessToken = generateCustomerAccessToken();
  const customerAccessTokenExpiresAt = getCustomerAccessTokenExpiry();
  const confirmationReference = generateConfirmationReference();
  const createdAt = new Date().toISOString();
  const sourceSurface = input.request.sourceSurface ?? "venue_page";
  const customerName = input.request.customerName.trim();
  const customerEmail = input.request.customerEmail.trim();
  const customerPhone = nullableText(input.request.customerPhone);
  const occasion = nullableText(input.request.occasion);
  const message = nullableText(input.request.message);
  const { error } = await client
    .from("booking_requests")
    .insert({
      id: bookingRequestId,
      venue_id: input.request.venueId,
      submitted_by: input.userId ?? null,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      party_size: input.request.partySize,
      requested_date: input.request.requestedDate,
      requested_time: input.request.requestedTime,
      occasion,
      message,
      source_surface: sourceSurface,
      status: "pending",
      customer_access_token: customerAccessToken,
      customer_access_token_expires_at: customerAccessTokenExpiresAt,
      confirmation_reference: confirmationReference,
    });

  if (error) {
    trackEvent("booking_request_submit_failed", { venueId: input.request.venueId, sourceSurface: input.request.sourceSurface ?? "venue_page" });
    throw new Error(`Could not send booking request: ${error.message}`);
  }

  const request: BookingRequest = {
    id: bookingRequestId,
    venueId: input.request.venueId,
    submittedBy: input.userId ?? null,
    customerName,
    customerEmail,
    customerPhone,
    partySize: input.request.partySize,
    requestedDate: input.request.requestedDate,
    requestedTime: input.request.requestedTime,
    occasion,
    message,
    status: "pending",
    ownerResponseMessage: null,
    proposedDate: null,
    proposedTime: null,
    proposedMessage: null,
    acceptedAt: null,
    declinedAt: null,
    proposedAt: null,
    cancelledAt: null,
    customerAccessToken,
    customerAccessTokenExpiresAt,
    customerAlternativeResponseMessage: null,
    customerRespondedAt: null,
    confirmedAt: null,
    confirmationReference,
    ownerLastUpdatedBy: null,
    ownerLastUpdatedAt: null,
    adminNotes: null,
    sourceSurface,
    createdAt,
    updatedAt: createdAt,
  };
  const safeMetadata = {
    venueId: request.venueId,
    city: input.venue?.city ?? null,
    area: input.venue?.area ?? null,
    partySizeBucket: getPartySizeBucket(request.partySize),
    requestedDateBucket: getRequestedDateBucket(request.requestedDate),
    status: request.status,
    sourceSurface: request.sourceSurface,
  };
  trackEvent("booking_request_submitted", safeMetadata);
  trackEvent("booking_request_status_link_created", { venueId: request.venueId, sourceSurface: request.sourceSurface });
  trackVenueAnalyticsEvent({
    venueId: request.venueId,
    eventName: "venue_booking_request_submitted",
    city: input.venue?.city,
    area: input.venue?.area,
    sourceSurface: request.sourceSurface ?? "venue_page",
    metadata: {
      partySizeBucket: safeMetadata.partySizeBucket,
      requestedDateBucket: safeMetadata.requestedDateBucket,
      status: request.status,
    },
  });
  queueEmailDeliveryForNotification({ bookingRequestId: request.id }).catch((error) => {
    if (import.meta.env.DEV) console.info("[email delivery]", error instanceof Error ? error.message : "Could not send booking email.");
  });
  return request;
}

export async function getMyBookingRequests(userId: string): Promise<BookingRequest[]> {
  const client = ensureSupabase();
  const { data, error } = await client.from("booking_requests").select("*").eq("submitted_by", userId).order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load booking requests: ${error.message}`);
  return ((data ?? []) as BookingRequestRow[]).map(mapBookingRequestRowToBookingRequest);
}

export async function getBookingRequestById(input: { bookingRequestId: string; userId: string }): Promise<BookingRequest | null> {
  const client = ensureSupabase();
  const { data, error } = await client.from("booking_requests").select("*").eq("id", input.bookingRequestId).eq("submitted_by", input.userId).maybeSingle();
  if (error) throw new Error(`Could not load booking request: ${error.message}`);
  return data ? mapBookingRequestRowToBookingRequest(data as BookingRequestRow) : null;
}

function nullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
