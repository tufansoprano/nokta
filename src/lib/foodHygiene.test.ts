import { describe, expect, it } from "vitest";
import {
  buildFoodHygieneRow,
  formatFoodHygieneRating,
  getFoodHygieneDisplay,
  mapEstablishmentToRecord,
  mapFoodHygieneRow,
  matchEstablishment,
  nameSimilarity,
  parseFhrsIdFromSource,
  planFoodHygieneLookup,
} from "@/lib/foodHygiene";
import type { FoodHygieneVenue, FsaEstablishment, VenueFoodHygiene } from "@/types/foodHygiene";

function establishment(overrides: Partial<FsaEstablishment> = {}): FsaEstablishment {
  return {
    FHRSID: 1316490,
    BusinessName: "Broski Lounge",
    AddressLine1: "",
    AddressLine2: "112 Whitfield Street",
    AddressLine3: "",
    AddressLine4: "London",
    PostCode: "W1T 5EE",
    RatingValue: "5",
    RatingDate: "2021-10-07T00:00:00",
    SchemeType: "FHRS",
    ...overrides,
  };
}

const venue: FoodHygieneVenue = { id: "broski", name: "Broski Lounge", address: "112 Whitfield Street", postcode: "W1T 5EE", foodHygieneSource: null };

function stored(overrides: Partial<VenueFoodHygiene>): VenueFoodHygiene {
  return {
    venueId: "broski",
    linkStatus: "matched",
    fhrsId: 1316490,
    scheme: "FHRS",
    rating: "5",
    ratingDate: "2021-10-07",
    officialUrl: "https://ratings.food.gov.uk/business/1316490",
    businessName: "Broski Lounge",
    businessAddress: "112 Whitfield Street, London, W1T 5EE",
    checkedAt: "2026-10-20T04:17:00Z",
    updatedAt: "2026-10-20T04:17:00Z",
    ...overrides,
  };
}

describe("parseFhrsIdFromSource", () => {
  it.each([
    ["https://ratings.food.gov.uk/business/1316490/broski-lounge", 1316490],
    ["https://ratings.food.gov.uk/business/1470420", 1470420],
    ["https://ratings.food.gov.uk/business/930162/patisserie-patchi-ltd/online-ratings", 930162],
    ["https://ratings.food.gov.uk/business/en-GB/1016494/Shisha-Garden", 1016494],
    ["https://api.ratings.food.gov.uk/Establishments/1316490", 1316490],
    [" https://ratings.food.gov.uk/business/42 ", 42],
  ])("reads the official record id from %s", (source, id) => {
    expect(parseFhrsIdFromSource(source)).toBe(id);
  });

  it.each([null, undefined, "", "not a url", "https://hygieneratings.uk/665823-eurika-cafe", "https://ratings.food.gov.uk/search?q=broski", "https://ratings.food.gov.uk.evil.example/business/1"])(
    "gives null for %s, which is not an official record",
    (source) => {
      expect(parseFhrsIdFromSource(source)).toBeNull();
    },
  );
});

describe("planFoodHygieneLookup", () => {
  it("uses the food hygiene source link first, even over a team unlink", () => {
    const linked = { ...venue, foodHygieneSource: "https://ratings.food.gov.uk/business/99" };
    expect(planFoodHygieneLookup(linked, stored({ linkStatus: "unlinked", fhrsId: null }))).toEqual({ kind: "record", fhrsId: 99, linkStatus: "source" });
  });

  it("keeps a team unlink", () => {
    expect(planFoodHygieneLookup(venue, stored({ linkStatus: "unlinked", fhrsId: null }))).toEqual({ kind: "keep-unlinked" });
  });

  it("re-reads an earlier automatic match by its id", () => {
    expect(planFoodHygieneLookup(venue, stored({}))).toEqual({ kind: "record", fhrsId: 1316490, linkStatus: "matched" });
  });

  it("searches when nothing is linked, including after the source link was removed", () => {
    expect(planFoodHygieneLookup(venue, null)).toEqual({ kind: "search" });
    expect(planFoodHygieneLookup(venue, stored({ linkStatus: "unmatched", fhrsId: null }))).toEqual({ kind: "search" });
    expect(planFoodHygieneLookup(venue, stored({ linkStatus: "source" }))).toEqual({ kind: "search" });
  });
});

describe("mapEstablishmentToRecord", () => {
  it("stores an England, Wales or Northern Ireland score with its inspection date and official page", () => {
    expect(mapEstablishmentToRecord(establishment())).toEqual({
      fhrsId: 1316490,
      scheme: "FHRS",
      rating: "5",
      ratingDate: "2021-10-07",
      officialUrl: "https://ratings.food.gov.uk/business/1316490",
      businessName: "Broski Lounge",
      businessAddress: "112 Whitfield Street, London, W1T 5EE",
    });
  });

  it("stores low scores exactly as given", () => {
    expect(mapEstablishmentToRecord(establishment({ RatingValue: "0" }))?.rating).toBe("0");
  });

  it.each([
    ["Pass", "Pass"],
    ["Pass and Eat Safe", "Pass"],
    ["Improvement Required", "Improvement Required"],
  ])("stores Scotland's %s result in Scotland's format", (value, rating) => {
    const record = mapEstablishmentToRecord(establishment({ SchemeType: "FHIS", RatingValue: value, RatingDate: "2025-04-17T00:00:00" }));
    expect(record).toMatchObject({ scheme: "FHIS", rating, ratingDate: "2025-04-17" });
  });

  it.each([
    ["FHRS", "AwaitingInspection"],
    ["FHRS", "Exempt"],
    ["FHRS", "AwaitingPublication"],
    ["FHIS", "Awaiting Inspection"],
    ["FHIS", "Exempt"],
    ["FHIS", "Awaiting Publication"],
  ])("keeps the link but stores no rating for %s %s", (scheme, value) => {
    const record = mapEstablishmentToRecord(establishment({ SchemeType: scheme, RatingValue: value, RatingDate: "1901-01-01T00:00:00" }));
    expect(record).toMatchObject({ fhrsId: 1316490, rating: null, ratingDate: null });
  });

  it("does not mix the schemes", () => {
    expect(mapEstablishmentToRecord(establishment({ SchemeType: "FHIS", RatingValue: "5" }))?.rating).toBeNull();
    expect(mapEstablishmentToRecord(establishment({ RatingValue: "Pass" }))?.rating).toBeNull();
  });

  it("drops a missing or placeholder inspection date", () => {
    expect(mapEstablishmentToRecord(establishment({ RatingDate: null }))?.ratingDate).toBeNull();
    expect(mapEstablishmentToRecord(establishment({ RatingDate: "1901-01-01T00:00:00" }))?.ratingDate).toBeNull();
  });

  it("ignores an unknown scheme", () => {
    expect(mapEstablishmentToRecord(establishment({ SchemeType: "OTHER" }))).toBeNull();
  });
});

describe("matchEstablishment", () => {
  it("matches the same name at the same postcode, ignoring spacing, case and generic words", () => {
    expect(matchEstablishment({ name: "Broski", postcode: "w1t5ee" }, [establishment()])?.FHRSID).toBe(1316490);
    expect(matchEstablishment({ name: "BROSKI SHISHA LOUNGE LTD", postcode: "W1T 5EE" }, [establishment()])?.FHRSID).toBe(1316490);
  });

  it("never matches a different postcode", () => {
    expect(matchEstablishment(venue, [establishment({ PostCode: "W1T 5EF" })])).toBeNull();
  });

  it("never matches a different business at the same postcode", () => {
    expect(matchEstablishment(venue, [establishment({ BusinessName: "Costa Coffee", FHRSID: 2 })])).toBeNull();
  });

  it("picks the closest of several businesses at the postcode", () => {
    const candidates = [establishment({ BusinessName: "Broski Express", FHRSID: 2 }), establishment(), establishment({ BusinessName: "Tesco", FHRSID: 3 })];
    expect(matchEstablishment(venue, candidates)?.FHRSID).toBe(1316490);
  });

  it("gives no match when two different records are equally close", () => {
    expect(matchEstablishment(venue, [establishment(), establishment({ FHRSID: 2 })])).toBeNull();
  });

  it("needs a postcode", () => {
    expect(matchEstablishment({ name: "Broski Lounge", postcode: " " }, [establishment()])).toBeNull();
  });
});

describe("nameSimilarity", () => {
  it("scores shared distinctive words", () => {
    expect(nameSimilarity("Zephyr Lounge", "The Zephyr Lounge Ltd")).toBe(1);
    expect(nameSimilarity("Café Nour", "Cafe Nour")).toBe(1);
    expect(nameSimilarity("Shisha Garden Grill", "Garden Grill Restaurant")).toBe(1);
    expect(nameSimilarity("Zephyr", "Nour")).toBe(0);
  });
});

describe("buildFoodHygieneRow", () => {
  const record = mapEstablishmentToRecord(establishment());

  it("stores a linked record", () => {
    expect(buildFoodHygieneRow("broski", "matched", record, "2026-10-26T04:17:00Z")).toEqual({
      venue_id: "broski",
      link_status: "matched",
      fhrs_id: 1316490,
      scheme: "FHRS",
      rating: "5",
      rating_date: "2021-10-07",
      official_url: "https://ratings.food.gov.uk/business/1316490",
      business_name: "Broski Lounge",
      business_address: "112 Whitfield Street, London, W1T 5EE",
      checked_at: "2026-10-26T04:17:00Z",
    });
  });

  it("stores no rating when there is no record", () => {
    expect(buildFoodHygieneRow("broski", "matched", null, "now")).toMatchObject({ link_status: "unmatched", fhrs_id: null, rating: null, official_url: null });
    expect(buildFoodHygieneRow("broski", "unlinked", record, "now")).toMatchObject({ link_status: "unlinked", fhrs_id: null, rating: null });
  });

  it("round-trips through mapFoodHygieneRow", () => {
    const row = { ...buildFoodHygieneRow("broski", "source", record, "2026-10-26T04:17:00Z"), updated_at: "2026-10-26T04:17:00Z" };
    expect(mapFoodHygieneRow(row)).toEqual(stored({ linkStatus: "source", checkedAt: "2026-10-26T04:17:00Z", updatedAt: "2026-10-26T04:17:00Z" }));
  });
});

describe("formatFoodHygieneRating", () => {
  it("shows scores out of 5 and Scottish results as given", () => {
    expect(formatFoodHygieneRating("4")).toBe("4 out of 5");
    expect(formatFoodHygieneRating("Improvement Required")).toBe("Improvement Required");
  });
});

describe("getFoodHygieneDisplay", () => {
  it("shows the score, inspection date and official page", () => {
    expect(getFoodHygieneDisplay(stored({}))).toEqual({
      heading: "Food hygiene rating",
      result: "5 out of 5",
      inspectedLabel: "Inspected 7 October 2021",
      officialUrl: "https://ratings.food.gov.uk/business/1316490",
      officialLinkLabel: "Official rating",
    });
  });

  it("shows low scores exactly as given", () => {
    for (const rating of ["0", "1", "2"] as const) {
      expect(getFoodHygieneDisplay(stored({ rating }))).toMatchObject({ heading: "Food hygiene rating", result: `${rating} out of 5` });
    }
  });

  it("shows Scottish results in Scotland's own format", () => {
    expect(getFoodHygieneDisplay(stored({ scheme: "FHIS", rating: "Pass" }))).toMatchObject({ heading: "Food hygiene inspection", result: "Pass", officialLinkLabel: "Official inspection result" });
    expect(getFoodHygieneDisplay(stored({ scheme: "FHIS", rating: "Improvement Required" }))).toMatchObject({ result: "Improvement Required" });
  });

  it("leaves out the date when the official record has none", () => {
    expect(getFoodHygieneDisplay(stored({ ratingDate: null }))?.inspectedLabel).toBeNull();
  });

  it("shows nothing without a rating, including Awaiting inspection and Exempt", () => {
    expect(getFoodHygieneDisplay(null)).toBeNull();
    expect(getFoodHygieneDisplay(stored({ rating: null, ratingDate: null }))).toBeNull();
    expect(getFoodHygieneDisplay(stored({ linkStatus: "unmatched", fhrsId: null, scheme: null, rating: null, ratingDate: null, officialUrl: null }))).toBeNull();
  });
});
