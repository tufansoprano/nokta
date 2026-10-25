import { createClient } from "@supabase/supabase-js";
import { parse } from "dotenv";
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapVenueToVenueRow } from "@/lib/venueMappers";
import { createFsaApi, loadStoredFoodHygiene, refreshAllFoodHygiene } from "@/services/foodHygieneRefreshService";
import { venue } from "@/test/venueFixtures";

/*
 * Runs the refresh against the QA Supabase project and the live Food Standards
 * Agency API. Credentials come from QA_SUPABASE_URL / QA_SUPABASE_SERVICE_ROLE_KEY
 * or .env.qa.local, never from the ambient environment, so it cannot reach prod.
 */

const qaEnv = fs.existsSync(".env.qa.local") ? parse(fs.readFileSync(".env.qa.local")) : {};
const supabaseUrl = process.env.QA_SUPABASE_URL ?? qaEnv.SUPABASE_URL;
const serviceRoleKey = process.env.QA_SUPABASE_SERVICE_ROLE_KEY ?? qaEnv.SUPABASE_SERVICE_ROLE_KEY;

// Broski Lounge, 112 Whitfield Street: a long-standing FHRS 5.
const BROSKI_FHRS_ID = 1316490;
const RUN = `${Date.now()}`;
const ids = { source: `nokta-20-source-${RUN}`, matched: `nokta-20-matched-${RUN}`, none: `nokta-20-none-${RUN}`, unlinked: `nokta-20-unlinked-${RUN}` };

describe.skipIf(!supabaseUrl || !serviceRoleKey)("food hygiene refresh against QA", () => {
  const client = createClient(supabaseUrl ?? "", serviceRoleKey ?? "", { auth: { persistSession: false } });

  beforeAll(async () => {
    const testVenues = [
      venue({ id: ids.source, name: "Nokta test source venue", postcode: "ZZ1 1ZZ", dataSources: { foodHygieneSource: `https://ratings.food.gov.uk/business/${BROSKI_FHRS_ID}/broski-lounge` } }),
      venue({ id: ids.matched, name: "Broski Lounge", address: "112 Whitfield Street", postcode: "W1T 5EE" }),
      venue({ id: ids.none, name: "Nokta test venue with no record", postcode: "W1T 5EE" }),
      venue({ id: ids.unlinked, name: "Broski Lounge", address: "112 Whitfield Street", postcode: "W1T 5EE" }),
    ].map((testVenue) => ({ ...mapVenueToVenueRow({ ...testVenue, slug: testVenue.id, isTest: true }) }));

    const { error } = await client.from("venues").insert(testVenues);
    if (error) throw new Error(`Could not create QA test venues: ${error.message}`);

    const { error: unlinkError } = await client.from("venue_food_hygiene").insert({ venue_id: ids.unlinked, link_status: "unlinked" });
    if (unlinkError) throw new Error(`Could not unlink QA test venue: ${unlinkError.message}`);
  });

  afterAll(async () => {
    await client.from("venues").delete().in("id", Object.values(ids));
  });

  it("stores the official rating, inspection date and page, and no rating where there is no record", async () => {
    const summary = await refreshAllFoodHygiene(client, createFsaApi(), { venueIds: Object.values(ids), concurrency: 2 });
    expect(summary.failures).toEqual([]);
    expect(summary.total).toBe(4);

    const stored = await loadStoredFoodHygiene(client, Object.values(ids));
    const official = { fhrsId: BROSKI_FHRS_ID, scheme: "FHRS", officialUrl: `https://ratings.food.gov.uk/business/${BROSKI_FHRS_ID}` };

    expect(stored.get(ids.source)).toMatchObject({ linkStatus: "source", ...official });
    expect(stored.get(ids.matched)).toMatchObject({ linkStatus: "matched", ...official });
    for (const id of [ids.source, ids.matched]) {
      expect(stored.get(id)?.rating).toMatch(/^[0-5]$/);
      expect(stored.get(id)?.ratingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    expect(stored.get(ids.none)).toMatchObject({ linkStatus: "unmatched", fhrsId: null, rating: null });
    expect(stored.get(ids.unlinked)).toMatchObject({ linkStatus: "unlinked", fhrsId: null, rating: null });
  });

  it("updates a stored rating on the next refresh", async () => {
    await client.from("venue_food_hygiene").update({ rating: "1", rating_date: "2000-01-01" }).eq("venue_id", ids.matched);

    await refreshAllFoodHygiene(client, createFsaApi(), { venueIds: [ids.matched] });

    const refreshed = (await loadStoredFoodHygiene(client, [ids.matched])).get(ids.matched);
    expect(refreshed?.ratingDate).not.toBe("2000-01-01");
    expect(refreshed?.fhrsId).toBe(BROSKI_FHRS_ID);
  });
});
