import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFoodHygieneRow, mapEstablishmentToRecord, mapFoodHygieneRow, matchEstablishment, planFoodHygieneLookup } from "@/lib/foodHygiene";
import type { FoodHygieneVenue, FsaEstablishment, VenueFoodHygiene, VenueFoodHygieneRow } from "@/types/foodHygiene";

/*
 * Keeps venue_food_hygiene in step with the Food Standards Agency. Takes its
 * Supabase client as an argument so the scheduled script (service role) and the
 * admin tools (an admin's session) share it; it never imports the browser client.
 */

const FSA_API_URL = "https://api.ratings.food.gov.uk";
const SEARCH_PAGE_SIZE = 100;
// This many failures in a row means the ratings API is down or blocking us: stop rather than hammer it.
const MAX_FAILURES_IN_A_ROW = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FsaApi {
  getEstablishment(fhrsId: number): Promise<FsaEstablishment | null>;
  searchEstablishments(query: { name?: string; address: string }): Promise<FsaEstablishment[]>;
}

/**
 * The ratings API blocks clients that send bursts of requests (403 for every
 * call afterwards), so requests are spaced at least minIntervalMs apart.
 */
export function createFsaApi({ fetchFn = fetch, minIntervalMs = 1000 }: { fetchFn?: typeof fetch; minIntervalMs?: number } = {}): FsaApi {
  let nextRequestAt = 0;

  async function waitForTurn() {
    const now = Date.now();
    const startAt = Math.max(now, nextRequestAt);
    nextRequestAt = startAt + minIntervalMs;
    if (startAt > now) await sleep(startAt - now);
  }

  async function request(path: string): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      await waitForTurn();
      const response = await fetchFn(`${FSA_API_URL}${path}`, { headers: { "x-api-version": "2", Accept: "application/json" } });
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 3) return response;
      await sleep(attempt * 5000);
    }
  }

  return {
    async getEstablishment(fhrsId) {
      const response = await request(`/Establishments/${fhrsId}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Could not load food hygiene record ${fhrsId}: the ratings API answered ${response.status}`);
      return (await response.json()) as FsaEstablishment;
    },
    async searchEstablishments({ name, address }) {
      const params = new URLSearchParams({ address, pageSize: String(SEARCH_PAGE_SIZE) });
      if (name) params.set("name", name);
      const response = await request(`/Establishments?${params}`);
      if (!response.ok) throw new Error(`Could not search food hygiene records: the ratings API answered ${response.status}`);
      const body = (await response.json()) as { establishments?: FsaEstablishment[] };
      return body.establishments ?? [];
    },
  };
}

async function findEstablishment(fsa: FsaApi, venue: FoodHygieneVenue): Promise<FsaEstablishment | null> {
  if (!venue.postcode.trim()) return null;

  const byName = await fsa.searchEstablishments({ name: venue.name, address: venue.postcode });
  const match = matchEstablishment(venue, byName);
  if (match) return match;

  // The official name often differs (a company name, say), so try everything at the postcode.
  const atPostcode = await fsa.searchEstablishments({ address: venue.postcode });
  return matchEstablishment(venue, atPostcode);
}

/** Looks up one venue's official record and stores the result. */
export async function refreshVenueFoodHygiene(
  client: SupabaseClient,
  fsa: FsaApi,
  venue: FoodHygieneVenue,
  existing: VenueFoodHygiene | null,
  now: Date = new Date(),
): Promise<VenueFoodHygiene> {
  const plan = planFoodHygieneLookup(venue, existing);
  let row = buildFoodHygieneRow(venue.id, "unlinked", null, now.toISOString());

  if (plan.kind !== "keep-unlinked") {
    let establishment = plan.kind === "record" ? await fsa.getEstablishment(plan.fhrsId) : null;
    let linkStatus: "source" | "matched" = plan.kind === "record" ? plan.linkStatus : "matched";

    // An automatic match whose record has gone (closed, re-registered) is searched for again.
    if (!establishment && !(plan.kind === "record" && plan.linkStatus === "source")) {
      establishment = await findEstablishment(fsa, venue);
      linkStatus = "matched";
    }

    const record = establishment ? mapEstablishmentToRecord(establishment) : null;
    row = buildFoodHygieneRow(venue.id, record ? linkStatus : "unmatched", record, now.toISOString());
  }

  const { data, error } = await client
    .from("venue_food_hygiene")
    .upsert({ ...row, updated_at: now.toISOString() }, { onConflict: "venue_id" })
    .select("*")
    .single();
  if (error) throw new Error(`Could not save food hygiene rating for ${venue.id}: ${error.message}`);
  return mapFoodHygieneRow(data as VenueFoodHygieneRow);
}

interface VenueSourceRow {
  id: string;
  name: string;
  address: string;
  postcode: string;
  data_sources: Record<string, string> | null;
}

export async function loadFoodHygieneVenues(client: SupabaseClient, venueIds?: string[]): Promise<FoodHygieneVenue[]> {
  let query = client.from("venues").select("id, name, address, postcode, data_sources").order("id");
  if (venueIds) query = query.in("id", venueIds);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load venues for food hygiene: ${error.message}`);

  return ((data ?? []) as VenueSourceRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    postcode: row.postcode,
    foodHygieneSource: row.data_sources?.foodHygieneSource ?? null,
  }));
}

export async function loadStoredFoodHygiene(client: SupabaseClient, venueIds?: string[]): Promise<Map<string, VenueFoodHygiene>> {
  let query = client.from("venue_food_hygiene").select("*");
  if (venueIds) query = query.in("venue_id", venueIds);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load food hygiene ratings: ${error.message}`);
  return new Map(((data ?? []) as VenueFoodHygieneRow[]).map((row) => [row.venue_id, mapFoodHygieneRow(row)]));
}

export interface FoodHygieneRefreshSummary {
  total: number;
  rated: number;
  noRating: number;
  unmatched: number;
  unlinked: number;
  failures: Array<{ venueId: string; message: string }>;
  /** True when the run stopped early after MAX_FAILURES_IN_A_ROW failures; unvisited venues keep their stored rating. */
  stoppedEarly: boolean;
}

/**
 * Refreshes every venue (or just venueIds). A venue that fails keeps its stored
 * rating and is reported in failures; the rest carry on unless failures keep
 * coming, when the run stops early.
 */
export async function refreshAllFoodHygiene(
  client: SupabaseClient,
  fsa: FsaApi,
  options: { venueIds?: string[]; concurrency?: number; now?: Date } = {},
): Promise<FoodHygieneRefreshSummary> {
  const [venues, stored] = await Promise.all([loadFoodHygieneVenues(client, options.venueIds), loadStoredFoodHygiene(client, options.venueIds)]);
  const summary: FoodHygieneRefreshSummary = { total: venues.length, rated: 0, noRating: 0, unmatched: 0, unlinked: 0, failures: [], stoppedEarly: false };
  const queue = [...venues];
  let failuresInARow = 0;

  async function worker() {
    for (let venue = queue.shift(); venue; venue = queue.shift()) {
      try {
        const result = await refreshVenueFoodHygiene(client, fsa, venue, stored.get(venue.id) ?? null, options.now);
        if (result.rating) summary.rated += 1;
        else if (result.linkStatus === "unmatched") summary.unmatched += 1;
        else if (result.linkStatus === "unlinked") summary.unlinked += 1;
        else summary.noRating += 1;
        failuresInARow = 0;
      } catch (caughtError) {
        summary.failures.push({ venueId: venue.id, message: caughtError instanceof Error ? caughtError.message : String(caughtError) });
        failuresInARow += 1;
        if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
          summary.stoppedEarly = true;
          queue.length = 0;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency ?? 2 }, worker));
  return summary;
}
