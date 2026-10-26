import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { mapVenueToVenueRow } from "@/lib/venueMappers";
import { venue } from "@/test/venueFixtures";
import { hasQaEnv, qaEnv } from "./qaEnv";

// Broski Lounge's official record; the stored score is set by the test, not the FSA.
const FHRS_ID = 1316490;

function testVenues(project: string) {
  const run = `${project}-${Date.now()}`;
  return {
    rated: venue({ id: `nokta-21-rated-${run}`, name: `Nokta e2e rated ${run}` }),
    unrated: venue({ id: `nokta-21-unrated-${run}`, name: `Nokta e2e unrated ${run}` }),
  };
}

test.describe("food hygiene rating on the venue page", () => {
  test.skip(!hasQaEnv, "Needs QA Supabase credentials in .env.qa.local or QA_* variables");

  const client = createClient(qaEnv.supabaseUrl || "http://localhost", qaEnv.serviceRoleKey || "none", { auth: { persistSession: false } });

  let { rated, unrated } = testVenues("unset");

  test.beforeAll(async ({}, testInfo) => {
    ({ rated, unrated } = testVenues(testInfo.project.name));
    // Real venues (not isTest), since the page hides test venues from visitors; removed afterwards.
    const venues = [rated, unrated].map((testVenue) => mapVenueToVenueRow({ ...testVenue, slug: testVenue.id }));
    const { error } = await client.from("venues").insert(venues);
    if (error) throw new Error(`Could not create QA test venues: ${error.message}`);

    const { error: hygieneError } = await client.from("venue_food_hygiene").insert([
      { venue_id: rated.id, link_status: "source", fhrs_id: FHRS_ID, scheme: "FHRS", rating: "2", rating_date: "2025-03-14", official_url: `https://ratings.food.gov.uk/business/${FHRS_ID}` },
      { venue_id: unrated.id, link_status: "unmatched" },
    ]);
    if (hygieneError) throw new Error(`Could not store QA test ratings: ${hygieneError.message}`);
  });

  test.afterAll(async () => {
    await client.from("venues").delete().in("id", [rated.id, unrated.id]);
  });

  test("a rated venue shows its score, inspection date and official page", async ({ page }) => {
    await page.goto(`/venues/${rated.id}`);
    await expect(page.getByRole("heading", { level: 1, name: rated.name })).toBeVisible();

    const rating = page.getByTestId("venue-food-hygiene");
    await expect(rating).toBeVisible();
    await expect(rating).toContainText("Food hygiene rating");
    await expect(rating).toContainText("2 out of 5");
    await expect(rating).toContainText("Inspected 14 March 2025");
    await expect(rating.getByRole("link", { name: "Official rating" })).toHaveAttribute("href", `https://ratings.food.gov.uk/business/${FHRS_ID}`);
  });

  test("an unrated venue shows no rating area", async ({ page }) => {
    await page.goto(`/venues/${unrated.id}`);
    await expect(page.getByRole("heading", { level: 1, name: unrated.name })).toBeVisible();
    // The hours and location card has rendered, without a rating in it.
    await expect(page.getByText(unrated.address).first()).toBeVisible();
    await expect(page.getByTestId("venue-food-hygiene")).toHaveCount(0);
  });
});
