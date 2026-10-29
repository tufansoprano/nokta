import { isAdminUser } from "@/lib/admin";
import { mapVenueRowToVenue } from "@/lib/venueMappers";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import type { VenueRow } from "@/types/database";
import type { Venue } from "@/types/venue";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function getMyClaimedVenues(userId: string): Promise<Venue[]> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("venues")
    .select("*")
    .eq("is_claimed", true)
    .eq("claimed_by", userId)
    .order("name", { ascending: true });

  if (error) throw new Error(`Could not load claimed venues: ${error.message}`);
  return ((data ?? []) as VenueRow[]).map(mapVenueRowToVenue);
}

/**
 * The venue, if this user may manage it: its owner, or a nokta admin. Admins
 * open any venue's owner workspace, claimed or not, to monitor and assist.
 */
export async function getMyClaimedVenue(input: { userId: string; venueId: string }): Promise<Venue | null> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("venues")
    .select("*")
    .or(`id.eq.${input.venueId},slug.eq.${input.venueId}`)
    .maybeSingle();

  if (error) throw new Error(`Could not load claimed venue: ${error.message}`);
  if (!data) return null;
  const row = data as VenueRow;
  const isOwner = row.is_claimed && row.claimed_by === input.userId;
  if (!isOwner && !(await isAdmin(input.userId))) return null;
  return mapVenueRowToVenue(row);
}

const adminChecks = new Map<string, Promise<boolean>>();

/** Same rule as `useIsAdmin`: the email allowlist or an `admin_users` row. Cached per session. */
export function isAdmin(userId: string): Promise<boolean> {
  let check = adminChecks.get(userId);
  if (!check) {
    const client = ensureSupabase();
    check = (async () => {
      const { data: auth } = await client.auth.getUser();
      if (auth.user?.id === userId && isAdminUser(auth.user)) return true;
      const { data } = await client.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
      return Boolean(data);
    })().catch(() => {
      adminChecks.delete(userId);
      return false;
    });
    adminChecks.set(userId, check);
  }
  return check;
}

export async function userCanAccessVenue(input: { userId: string; venueId: string }): Promise<boolean> {
  const venue = await getMyClaimedVenue(input);
  return Boolean(venue);
}
