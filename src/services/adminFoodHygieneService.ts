import { buildFoodHygieneRow, mapFoodHygieneRow } from "@/lib/foodHygiene";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import { createFsaApi, loadFoodHygieneVenues, loadStoredFoodHygiene, refreshVenueFoodHygiene } from "@/services/foodHygieneRefreshService";
import type { VenueFoodHygiene, VenueFoodHygieneRow } from "@/types/foodHygiene";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function getAdminVenueFoodHygiene(venueId: string): Promise<VenueFoodHygiene | null> {
  const stored = await loadStoredFoodHygiene(ensureSupabase(), [venueId]);
  return stored.get(venueId) ?? null;
}

/** Re-runs the scheduled refresh for one venue now, using its saved food hygiene source. */
export async function refreshAdminVenueFoodHygiene(venueId: string): Promise<VenueFoodHygiene> {
  const client = ensureSupabase();
  const [[venue], stored] = await Promise.all([loadFoodHygieneVenues(client, [venueId]), loadStoredFoodHygiene(client, [venueId])]);
  if (!venue) throw new Error("Could not refresh food hygiene rating: venue not found");
  return refreshVenueFoodHygiene(client, createFsaApi(), venue, stored.get(venueId) ?? null);
}

/** Records that the venue has no official record, so the refresh stops matching it automatically. */
export async function unlinkAdminVenueFoodHygiene(venueId: string): Promise<VenueFoodHygiene> {
  const now = new Date().toISOString();
  const { data, error } = await ensureSupabase()
    .from("venue_food_hygiene")
    .upsert({ ...buildFoodHygieneRow(venueId, "unlinked", null, now), updated_at: now }, { onConflict: "venue_id" })
    .select("*")
    .single();
  if (error) throw new Error(`Could not unlink food hygiene record: ${error.message}`);
  return mapFoodHygieneRow(data as VenueFoodHygieneRow);
}

/** Forgets any earlier link or unlink and matches the venue again from scratch. */
export async function rematchAdminVenueFoodHygiene(venueId: string): Promise<VenueFoodHygiene> {
  const { error } = await ensureSupabase().from("venue_food_hygiene").delete().eq("venue_id", venueId);
  if (error) throw new Error(`Could not reset food hygiene record: ${error.message}`);
  return refreshAdminVenueFoodHygiene(venueId);
}
