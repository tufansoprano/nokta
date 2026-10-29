import { subscriptionHasPlanAccess, type VenuePlanFeature } from "@/lib/planFeatureAccess";
import { createFreeSubscriptionFallback, mapVenueSubscriptionRowToSubscription } from "@/lib/subscriptionMappers";
import { supabase, supabaseConfigError } from "@/lib/supabase";
import { getMyClaimedVenue } from "@/services/ownerVenueService";
import type { VenueSubscriptionRow } from "@/types/database";
import type { VenueSubscription } from "@/types/subscriptions";

function ensureSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  return supabase;
}

export async function getOwnerVenueSubscription(input: { userId: string; venueId: string }): Promise<VenueSubscription | null> {
  const client = ensureSupabase();
  const venue = await getMyClaimedVenue({ userId: input.userId, venueId: input.venueId });
  if (!venue) return null;

  const { data, error } = await client.from("venue_subscriptions").select("*").eq("venue_id", venue.id).maybeSingle();

  if (error) throw new Error(`Could not load venue subscription: ${error.message}`);
  return data ? mapVenueSubscriptionRowToSubscription(data as VenueSubscriptionRow) : createFreeSubscriptionFallback({ venueId: venue.id });
}

export async function getOwnerVenueSubscriptions(userId: string): Promise<VenueSubscription[]> {
  const client = ensureSupabase();
  const { data: venues, error: venueError } = await client.from("venues").select("id").eq("is_claimed", true).eq("claimed_by", userId);

  if (venueError) throw new Error(`Could not load owned venues: ${venueError.message}`);
  const venueIds = (venues ?? []).map((venue) => venue.id as string);
  if (!venueIds.length) return [];

  const { data, error } = await client.from("venue_subscriptions").select("*").in("venue_id", venueIds);

  if (error) throw new Error(`Could not load venue subscriptions: ${error.message}`);
  const subscriptions = new Map(((data ?? []) as VenueSubscriptionRow[]).map((row) => [row.venue_id, mapVenueSubscriptionRowToSubscription(row)]));

  return venueIds.map((venueId) => subscriptions.get(venueId) ?? createFreeSubscriptionFallback({ venueId }));
}

export async function ownerVenueHasFeatureAccess(input: { userId: string; venueId: string; feature: VenuePlanFeature }): Promise<boolean> {
  const subscription = await getOwnerVenueSubscription({ userId: input.userId, venueId: input.venueId });
  return subscriptionHasPlanAccess(subscription, input.feature);
}
