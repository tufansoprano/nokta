import { mapFoodHygieneRow } from "@/lib/foodHygiene";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import type { VenueFoodHygiene, VenueFoodHygieneRow } from "@/types/foodHygiene";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

/** The venue's stored food hygiene rating for the venue page, or null when it has never been checked. */
export async function getPublicVenueFoodHygiene(venueId: string): Promise<VenueFoodHygiene | null> {
  const { data, error } = await ensureSupabase().from("venue_food_hygiene").select("*").eq("venue_id", venueId).maybeSingle();
  if (error) throw new Error(`Could not load food hygiene rating: ${error.message}`);
  return data ? mapFoodHygieneRow(data as VenueFoodHygieneRow) : null;
}
