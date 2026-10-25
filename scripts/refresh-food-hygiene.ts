/// <reference types="node" />

/**
 * Refreshes every venue's food hygiene rating from the Food Standards Agency
 * (NOKTA-20). Run on a schedule by .github/workflows/refresh-food-hygiene.yml so a
 * changed official rating shows on Nokta within a week.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Locally it reads .env.local,
 * or pass --env=.env.qa.local to point at another project.
 *
 * Usage:
 *   npx tsx scripts/refresh-food-hygiene.ts
 *   npx tsx scripts/refresh-food-hygiene.ts --env=.env.qa.local --venue=<venue id>
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { createFsaApi, refreshAllFoodHygiene } from "../src/services/foodHygieneRefreshService";

// A run where more venues than this fail exits non-zero so the schedule reports it.
const MAX_FAILURE_RATIO = 0.1;

const args = process.argv.slice(2);
const envFile = args.find((arg) => arg.startsWith("--env="))?.slice("--env=".length);
const venueIds = args.filter((arg) => arg.startsWith("--venue=")).map((arg) => arg.slice("--venue=".length));

config({ path: envFile ?? ".env.local", quiet: true, override: Boolean(envFile) });
config({ quiet: true });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const summary = await refreshAllFoodHygiene(client, createFsaApi(), { venueIds: venueIds.length ? venueIds : undefined });

console.log(
  `Food hygiene refresh: ${summary.total} venues, ${summary.rated} rated, ${summary.noRating} linked without a rating, ` +
    `${summary.unmatched} with no official record, ${summary.unlinked} marked by the team as having none, ${summary.failures.length} failed.`,
);
for (const failure of summary.failures) console.error(`  ${failure.venueId}: ${failure.message}`);
if (summary.stoppedEarly) console.error("Stopped early after repeated failures; venues not reached keep their stored rating.");

if (summary.stoppedEarly || (summary.total > 0 && summary.failures.length / summary.total > MAX_FAILURE_RATIO)) process.exit(1);
