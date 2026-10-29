import { mapVenueBookingBlackoutDateRow, mapVenueBookingSettingsRow, mapVenueBookingWindowRow } from "@/lib/bookingAvailabilityMappers";
import { validateVenueBookingSettings, validateVenueBookingWindow } from "@/lib/bookingAvailabilityValidation";
import { trackEvent } from "@/lib/analytics";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import { getMyClaimedVenue } from "@/services/ownerVenueService";
import type { VenueBookingAvailability, VenueBookingBlackoutDate, VenueBookingSettings, VenueBookingWindow } from "@/types/bookingAvailability";
import type { VenueBookingBlackoutDateRow, VenueBookingSettingsRow, VenueBookingWindowRow } from "@/types/database";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function getOwnerVenueBookingAvailability(input: { ownerUserId: string; venueId: string }): Promise<VenueBookingAvailability> {
  const client = ensureSupabase();
  const venue = await getMyClaimedVenue({ userId: input.ownerUserId, venueId: input.venueId });
  if (!venue) throw new Error("You do not have access to this venue's availability settings.");
  await client.from("venue_booking_settings").insert({ venue_id: input.venueId }).select("*").maybeSingle();
  const [{ data: settings }, { data: windows }, { data: blackoutDates }] = await Promise.all([
    client.from("venue_booking_settings").select("*").eq("venue_id", input.venueId).single(),
    client.from("venue_booking_windows").select("*").eq("venue_id", input.venueId).order("day_of_week").order("start_time"),
    client.from("venue_booking_blackout_dates").select("*").eq("venue_id", input.venueId).order("blackout_date"),
  ]);
  return {
    settings: mapVenueBookingSettingsRow(settings as VenueBookingSettingsRow),
    windows: ((windows ?? []) as VenueBookingWindowRow[]).map(mapVenueBookingWindowRow),
    blackoutDates: ((blackoutDates ?? []) as VenueBookingBlackoutDateRow[]).map(mapVenueBookingBlackoutDateRow),
    bookedSlots: [],
  };
}

export async function updateOwnerVenueBookingSettings(input: { ownerUserId: string; venueId: string; settings: Partial<VenueBookingSettings> }): Promise<VenueBookingSettings> {
  const validation = validateVenueBookingSettings(input.settings);
  if (!validation.isValid) throw new Error(Object.values(validation.errors)[0] ?? "Booking settings are invalid.");
  const client = ensureSupabase();
  const { data, error } = await client.from("venue_booking_settings").update(mapSettingsPatch(input.settings)).eq("venue_id", input.venueId).select("*").single();
  if (error) throw new Error(`Could not update availability settings: ${error.message}`);
  const settings = mapVenueBookingSettingsRow(data as VenueBookingSettingsRow);
  trackEvent("owner_availability_settings_updated", { venueId: input.venueId, bookingRequestsEnabled: settings.bookingRequestsEnabled });
  return settings;
}

export async function upsertOwnerVenueBookingWindow(input: { ownerUserId: string; venueId: string; window: Partial<VenueBookingWindow> }): Promise<VenueBookingWindow> {
  const validation = validateVenueBookingWindow({ ...input.window, venueId: input.venueId });
  if (!validation.isValid) throw new Error(Object.values(validation.errors)[0] ?? "Booking window is invalid.");
  const client = ensureSupabase();
  const values = { venue_id: input.venueId, day_of_week: input.window.dayOfWeek, start_time: input.window.startTime, end_time: input.window.endTime, is_enabled: input.window.isEnabled ?? true };
  const query = input.window.id ? client.from("venue_booking_windows").update(values).eq("id", input.window.id) : client.from("venue_booking_windows").insert(values);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`Could not save booking window: ${error.message}`);
  trackEvent(input.window.id ? "owner_booking_window_updated" : "owner_booking_window_added", { venueId: input.venueId, dayOfWeek: input.window.dayOfWeek });
  return mapVenueBookingWindowRow(data as VenueBookingWindowRow);
}

export async function replaceOwnerVenueBookingWindows(input: { ownerUserId: string; venueId: string; windows: Partial<VenueBookingWindow>[] }): Promise<VenueBookingWindow[]> {
  input.windows.forEach((window) => {
    const validation = validateVenueBookingWindow({ ...window, venueId: input.venueId });
    if (!validation.isValid) throw new Error(Object.values(validation.errors)[0] ?? "Booking window is invalid.");
  });

  const client = ensureSupabase();
  const { error: deleteError } = await client.from("venue_booking_windows").delete().eq("venue_id", input.venueId);
  if (deleteError) throw new Error(`Could not replace booking windows: ${deleteError.message}`);

  if (!input.windows.length) {
    trackEvent("owner_booking_windows_replaced", { venueId: input.venueId, windowsCount: 0 });
    return [];
  }

  const values = input.windows.map((window) => ({
    venue_id: input.venueId,
    day_of_week: window.dayOfWeek,
    start_time: window.startTime,
    end_time: window.endTime,
    is_enabled: window.isEnabled ?? true,
  }));
  const { data, error } = await client.from("venue_booking_windows").insert(values).select("*").order("day_of_week").order("start_time");
  if (error) throw new Error(`Could not replace booking windows: ${error.message}`);
  trackEvent("owner_booking_windows_replaced", { venueId: input.venueId, windowsCount: values.length });
  return ((data ?? []) as VenueBookingWindowRow[]).map(mapVenueBookingWindowRow);
}

export async function deleteOwnerVenueBookingWindow(input: { ownerUserId: string; venueId: string; windowId: string }): Promise<void> {
  const client = ensureSupabase();
  const { error } = await client.from("venue_booking_windows").delete().eq("id", input.windowId).eq("venue_id", input.venueId);
  if (error) throw new Error(`Could not delete booking window: ${error.message}`);
  trackEvent("owner_booking_window_deleted", { venueId: input.venueId });
}

export async function createOwnerVenueBookingBlackoutDate(input: { ownerUserId: string; venueId: string; blackoutDate: { blackoutDate: string; reason?: string | null; isFullDay?: boolean; startTime?: string | null; endTime?: string | null } }): Promise<VenueBookingBlackoutDate> {
  const client = ensureSupabase();
  const { data, error } = await client.from("venue_booking_blackout_dates").insert({ venue_id: input.venueId, blackout_date: input.blackoutDate.blackoutDate, reason: nullableText(input.blackoutDate.reason), is_full_day: input.blackoutDate.isFullDay ?? true, start_time: nullableText(input.blackoutDate.startTime), end_time: nullableText(input.blackoutDate.endTime), created_by: input.ownerUserId }).select("*").single();
  if (error) throw new Error(`Could not add blackout date: ${error.message}`);
  trackEvent("owner_blackout_date_added", { venueId: input.venueId, hasBlackoutDate: true });
  return mapVenueBookingBlackoutDateRow(data as VenueBookingBlackoutDateRow);
}

export async function deleteOwnerVenueBookingBlackoutDate(input: { ownerUserId: string; venueId: string; blackoutDateId: string }): Promise<void> {
  const client = ensureSupabase();
  const { error } = await client.from("venue_booking_blackout_dates").delete().eq("id", input.blackoutDateId).eq("venue_id", input.venueId);
  if (error) throw new Error(`Could not delete blackout date: ${error.message}`);
  trackEvent("owner_blackout_date_deleted", { venueId: input.venueId, hasBlackoutDate: false });
}

function mapSettingsPatch(settings: Partial<VenueBookingSettings>) {
  return {
    booking_requests_enabled: settings.bookingRequestsEnabled,
    min_party_size: settings.minPartySize,
    max_party_size: settings.maxPartySize,
    min_notice_minutes: settings.minNoticeMinutes,
    max_advance_days: settings.maxAdvanceDays,
    default_booking_duration_minutes: settings.defaultBookingDurationMinutes,
    slot_capacity: settings.slotCapacity,
    booking_instructions: nullableText(settings.bookingInstructions),
    internal_notes: nullableText(settings.internalNotes),
  };
}

function nullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
