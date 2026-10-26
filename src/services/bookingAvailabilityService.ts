import { mapVenueBookingBlackoutDateRow, mapVenueBookingSettingsRow, mapVenueBookingWindowRow } from "@/lib/bookingAvailabilityMappers";
import { checkBookingAvailability } from "@/lib/bookingAvailabilityValidation";
import { getEffectiveBookingSlot, OCCUPYING_BOOKING_STATUSES } from "@/lib/bookingSlot";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import type { BookingAvailabilityCheckResult, VenueBookingAvailability, VenueBookingGate } from "@/types/bookingAvailability";
import type { BookingRequestRow, VenueBookingBlackoutDateRow, VenueBookingSettingsRow, VenueBookingWindowRow } from "@/types/database";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function getVenueBookingAvailability(venueId: string): Promise<VenueBookingAvailability | null> {
  const client = ensureSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settings, error: settingsError }, { data: windows, error: windowsError }, { data: blackoutDates, error: blackoutError }, { data: bookedRows, error: bookedSlotsError }] = await Promise.all([
    client.from("venue_booking_settings").select("*").eq("venue_id", venueId).maybeSingle(),
    client.from("venue_booking_windows").select("*").eq("venue_id", venueId).order("day_of_week").order("start_time"),
    client.from("venue_booking_blackout_dates").select("*").eq("venue_id", venueId).order("blackout_date"),
    client
      .from("booking_requests")
      .select("requested_date, requested_time, proposed_date, proposed_time, status")
      .eq("venue_id", venueId)
      .in("status", OCCUPYING_BOOKING_STATUSES)
      .or(`requested_date.gte.${today},proposed_date.gte.${today}`),
  ]);
  if (settingsError) throw new Error(`Could not load booking settings: ${settingsError.message}`);
  if (windowsError) throw new Error(`Could not load booking windows: ${windowsError.message}`);
  if (blackoutError) throw new Error(`Could not load blackout dates: ${blackoutError.message}`);
  if (bookedSlotsError) throw new Error(`Could not load booked slots: ${bookedSlotsError.message}`);
  if (!settings) return null;
  const bookedSlots = ((bookedRows ?? []) as Pick<BookingRequestRow, "requested_date" | "requested_time" | "proposed_date" | "proposed_time" | "status">[])
    // An accepted alternative frees the originally requested slot and occupies the
    // proposed one, so capacity is counted against the slot that is really taken.
    .map((row) => getEffectiveBookingSlot({
      status: row.status,
      requestedDate: row.requested_date,
      requestedTime: row.requested_time,
      proposedDate: row.proposed_date,
      proposedTime: row.proposed_time,
    }))
    .filter((slot) => slot.date >= today);
  return {
    settings: mapVenueBookingSettingsRow(settings as VenueBookingSettingsRow),
    windows: ((windows ?? []) as VenueBookingWindowRow[]).map(mapVenueBookingWindowRow),
    blackoutDates: ((blackoutDates ?? []) as VenueBookingBlackoutDateRow[]).map(mapVenueBookingBlackoutDateRow),
    bookedSlots,
  };
}

export async function checkVenueBookingRequestAvailability(input: { venueId: string; requestedDate: string; requestedTime: string; partySize: number }): Promise<BookingAvailabilityCheckResult> {
  const availability = await getVenueBookingAvailability(input.venueId);
  if (!availability) return { isAvailable: true, errors: [], warnings: ["Booking availability settings are not configured yet."] };
  return checkBookingAvailability({ availability, requestedDate: input.requestedDate, requestedTime: input.requestedTime, partySize: input.partySize });
}

export async function getVenueBookingGate(venueId: string): Promise<VenueBookingGate> {
  const client = ensureSupabase();
  const { data, error } = await client.from("public_venue_booking_states").select("*").eq("venue_id", venueId).maybeSingle();
  if (error) throw new Error(`Could not load booking status: ${error.message}`);
  if (!data) throw new Error("Could not load booking status for this venue.");

  /**
   * A state this build does not know about is not a reason to refuse a booking.
   * The view is deployed separately from the app, so during a rollout it can
   * still return a state that has since been retired; treating that as an error
   * blocks the request the customer came to make. Unclaimed and disabled are
   * explicit, and anything else is treated as live. Only disabled refuses a
   * request; unclaimed requests are forwarded to the venue by nokta.
   */
  const state: VenueBookingGate["state"] = data.state === "unclaimed" || data.state === "disabled" ? data.state : "live";

  return {
    venueId: data.venue_id as string,
    isClaimed: Boolean(data.is_claimed),
    bookingRequestsEnabled: Boolean(data.booking_requests_enabled),
    responsive: Boolean(data.responsive),
    state,
  };
}
