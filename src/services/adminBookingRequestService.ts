import { trackEvent } from "@/lib/analytics";
import { mapBookingRequestRowToBookingRequest } from "@/lib/bookingRequestMappers";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import { queueEmailDeliveryForNotification } from "@/services/emailDeliveryService";
import type { BookingRequest } from "@/types/bookingRequests";
import type { BookingRequestRow } from "@/types/database";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function getAdminBookingRequests(input?: { status?: string; venueId?: string; dateFrom?: string; dateTo?: string }): Promise<BookingRequest[]> {
  const client = ensureSupabase();
  let query = client.from("booking_requests").select("*").order("created_at", { ascending: false });
  if (input?.status && input.status !== "all") query = query.eq("status", input.status);
  if (input?.venueId && input.venueId !== "all") query = query.eq("venue_id", input.venueId);
  if (input?.dateFrom) query = query.gte("requested_date", input.dateFrom);
  if (input?.dateTo) query = query.lte("requested_date", input.dateTo);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load booking requests: ${error.message}`);
  return ((data ?? []) as BookingRequestRow[]).map(mapBookingRequestRowToBookingRequest);
}

export async function markBookingRequestSpam(input: { bookingRequestId: string; adminUserId: string; adminNotes?: string | null }): Promise<BookingRequest> {
  const request = await updateBookingRequestAdminFields(input.bookingRequestId, { status: "spam", admin_notes: nullableText(input.adminNotes) });
  trackEvent("admin_booking_marked_spam", { venueId: request.venueId, status: request.status });
  return request;
}

export function updateBookingRequestAdminNotes(input: { bookingRequestId: string; adminUserId: string; adminNotes: string }): Promise<BookingRequest> {
  return updateBookingRequestAdminFields(input.bookingRequestId, { admin_notes: nullableText(input.adminNotes) });
}

/**
 * nokta answers booking requests on behalf of unclaimed venues: the admin passes the
 * request on, hears back, and records the venue's answer here. The status triggers
 * email the customer exactly as they would for an owner's answer.
 */
export type AdminBookingAnswer =
  | { kind: "accept"; message?: string | null }
  | { kind: "decline"; message?: string | null }
  | { kind: "propose"; proposedDate: string; proposedTime: string; message?: string | null };

export async function answerBookingRequestForVenue(input: { bookingRequestId: string; adminUserId: string; answer: AdminBookingAnswer }): Promise<BookingRequest> {
  const now = new Date().toISOString();
  const { answer } = input;
  const updates =
    answer.kind === "accept"
      ? { status: "accepted", owner_response_message: nullableText(answer.message), accepted_at: now, confirmed_at: now }
      : answer.kind === "decline"
        ? { status: "declined", owner_response_message: nullableText(answer.message), declined_at: now, confirmed_at: null }
        : { status: "alternative_proposed", proposed_date: answer.proposedDate, proposed_time: answer.proposedTime, proposed_message: nullableText(answer.message), proposed_at: now, confirmed_at: null };
  // Recorded as the venue's first reply so Demand counts the request as answered.
  const request = await updateBookingRequestAdminFields(input.bookingRequestId, { ...updates, owner_last_updated_by: input.adminUserId, owner_last_updated_at: now });
  trackEvent("admin_booking_answered_for_venue", { venueId: request.venueId, status: request.status });
  queueEmailDeliveryForNotification({ bookingRequestId: request.id }).catch((error) => {
    if (import.meta.env.DEV) console.info("[email delivery]", error instanceof Error ? error.message : "Could not send booking email.");
  });
  return request;
}

async function updateBookingRequestAdminFields(bookingRequestId: string, updates: Record<string, unknown>) {
  const client = ensureSupabase();
  const { data, error } = await client.from("booking_requests").update(updates).eq("id", bookingRequestId).select("*").single();
  if (error) {
    if (error.message.includes("SLOT_CAPACITY_REACHED")) throw new Error("That time is now full. Suggest a different time instead.");
    throw new Error(`Could not update booking request: ${error.message}`);
  }
  return mapBookingRequestRowToBookingRequest(data as BookingRequestRow);
}

function nullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
