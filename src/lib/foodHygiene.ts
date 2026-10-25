import type {
  FoodHygieneLookup,
  FoodHygieneRating,
  FoodHygieneRecord,
  FoodHygieneScheme,
  FoodHygieneVenue,
  FsaEstablishment,
  VenueFoodHygiene,
  VenueFoodHygieneRow,
} from "@/types/foodHygiene";

export const FSA_RATINGS_SITE = "https://ratings.food.gov.uk";

const FSA_HOSTS = new Set(["ratings.food.gov.uk", "www.ratings.food.gov.uk", "api.ratings.food.gov.uk"]);
const FHRS_SCORES = new Set(["0", "1", "2", "3", "4", "5"]);
// Name words too common to tell two businesses apart.
const GENERIC_NAME_WORDS = new Set(["the", "and", "ltd", "limited", "plc", "llp", "co", "uk", "london", "shisha", "hookah", "lounge", "bar", "cafe", "restaurant", "grill", "kitchen"]);
const MIN_NAME_SIMILARITY = 0.6;

/**
 * The FHRS id in an official rating page or API link, such as
 * https://ratings.food.gov.uk/business/1316490/broski-lounge. Links to any other
 * site are not the official record, so they give null.
 */
export function parseFhrsIdFromSource(source: string | null | undefined): number | null {
  if (!source) return null;

  let url: URL;
  try {
    url = new URL(source.trim());
  } catch {
    return null;
  }

  if (!FSA_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/\/(?:business|establishments)\/(?:[a-z]{2}-[a-z]{2}\/)?(\d+)(?:\/|$)/i);
  return match ? Number(match[1]) : null;
}

export function getOfficialRatingUrl(fhrsId: number): string {
  return `${FSA_RATINGS_SITE}/business/${fhrsId}`;
}

/**
 * Decides where the refresh looks for a venue's record. A link in
 * foodHygieneSource always wins, so the team corrects a wrong match by setting it.
 */
export function planFoodHygieneLookup(venue: FoodHygieneVenue, existing: VenueFoodHygiene | null): FoodHygieneLookup {
  const sourceId = parseFhrsIdFromSource(venue.foodHygieneSource);
  if (sourceId !== null) return { kind: "record", fhrsId: sourceId, linkStatus: "source" };
  if (existing?.linkStatus === "unlinked") return { kind: "keep-unlinked" };
  if (existing?.linkStatus === "matched" && existing.fhrsId !== null) return { kind: "record", fhrsId: existing.fhrsId, linkStatus: "matched" };
  return { kind: "search" };
}

/** Maps an official record to what Nokta stores; "Awaiting inspection", "Exempt" and the like have no rating. */
export function mapEstablishmentToRecord(establishment: FsaEstablishment): FoodHygieneRecord | null {
  const scheme = mapScheme(establishment.SchemeType);
  if (!scheme) return null;

  const rating = mapRating(scheme, establishment.RatingValue);
  return {
    fhrsId: establishment.FHRSID,
    scheme,
    rating,
    ratingDate: rating ? mapRatingDate(establishment.RatingDate) : null,
    officialUrl: getOfficialRatingUrl(establishment.FHRSID),
    businessName: establishment.BusinessName.trim(),
    businessAddress: formatEstablishmentAddress(establishment),
  };
}

function mapScheme(value: string): FoodHygieneScheme | null {
  const scheme = value.trim().toUpperCase();
  return scheme === "FHRS" || scheme === "FHIS" ? scheme : null;
}

function mapRating(scheme: FoodHygieneScheme, value: string): FoodHygieneRating | null {
  const rating = value.trim();

  if (scheme === "FHRS") return FHRS_SCORES.has(rating) ? (rating as FoodHygieneRating) : null;

  const normalised = rating.toLowerCase().replace(/\s+/g, " ");
  // "Pass and Eat Safe" is a Pass with Scotland's extra award.
  if (normalised === "pass" || normalised === "pass and eat safe") return "Pass";
  if (normalised === "improvement required") return "Improvement Required";
  return null;
}

function mapRatingDate(value: string | null): string | null {
  const date = value?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // The API uses 1901-01-01 for "no date".
  return date.startsWith("1901-") ? null : date;
}

export function formatEstablishmentAddress(establishment: FsaEstablishment): string {
  return [establishment.AddressLine1, establishment.AddressLine2, establishment.AddressLine3, establishment.AddressLine4, establishment.PostCode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function normalisePostcode(postcode: string): string {
  return postcode.replace(/\s+/g, "").toUpperCase();
}

function nameTokens(name: string): string[] {
  const tokens = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const distinctive = tokens.filter((token) => !GENERIC_NAME_WORDS.has(token));
  return distinctive.length ? distinctive : tokens;
}

/** 0-1: how alike two business names are, ignoring words like "lounge" and "ltd". */
export function nameSimilarity(a: string, b: string): number {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return 0;
  if (left.join("") === right.join("")) return 1;

  const rightSet = new Set(right);
  const shared = new Set(left.filter((token) => rightSet.has(token))).size;
  return (2 * shared) / (new Set(left).size + rightSet.size);
}

/**
 * Picks the venue's official record from search results: same postcode, a name
 * close enough, and no equally good rival. Anything less is no match, since a
 * wrong rating is worse than none.
 */
export function matchEstablishment(venue: Pick<FoodHygieneVenue, "name" | "postcode">, candidates: FsaEstablishment[]): FsaEstablishment | null {
  const postcode = normalisePostcode(venue.postcode);
  if (!postcode) return null;

  const scored = candidates
    .filter((candidate) => normalisePostcode(candidate.PostCode) === postcode && mapScheme(candidate.SchemeType))
    .map((candidate) => ({ candidate, score: nameSimilarity(venue.name, candidate.BusinessName) }))
    .filter(({ score }) => score >= MIN_NAME_SIMILARITY)
    .sort((a, b) => b.score - a.score);

  const [best, runnerUp] = scored;
  if (!best) return null;
  if (runnerUp && runnerUp.score === best.score && runnerUp.candidate.FHRSID !== best.candidate.FHRSID) return null;
  return best.candidate;
}

export function buildFoodHygieneRow(
  venueId: string,
  linkStatus: VenueFoodHygiene["linkStatus"],
  record: FoodHygieneRecord | null,
  now: string,
): Omit<VenueFoodHygieneRow, "updated_at"> {
  const linked = (linkStatus === "source" || linkStatus === "matched") && record ? record : null;
  return {
    venue_id: venueId,
    link_status: linked ? linkStatus : linkStatus === "unlinked" ? "unlinked" : "unmatched",
    fhrs_id: linked?.fhrsId ?? null,
    scheme: linked?.scheme ?? null,
    rating: linked?.rating ?? null,
    rating_date: linked?.ratingDate ?? null,
    official_url: linked?.officialUrl ?? null,
    business_name: linked?.businessName ?? null,
    business_address: linked?.businessAddress ?? null,
    checked_at: now,
  };
}

export function mapFoodHygieneRow(row: VenueFoodHygieneRow): VenueFoodHygiene {
  return {
    venueId: row.venue_id,
    linkStatus: row.link_status,
    fhrsId: row.fhrs_id,
    scheme: row.scheme,
    rating: row.rating,
    ratingDate: row.rating_date,
    officialUrl: row.official_url,
    businessName: row.business_name,
    businessAddress: row.business_address,
    checkedAt: row.checked_at,
    updatedAt: row.updated_at,
  };
}

export function formatFoodHygieneRating(rating: FoodHygieneRating): string {
  return FHRS_SCORES.has(rating) ? `${rating} out of 5` : rating;
}

export const FOOD_HYGIENE_LINK_STATUS_LABELS: Record<VenueFoodHygiene["linkStatus"], string> = {
  source: "Linked from the food hygiene source",
  matched: "Matched automatically by name and postcode",
  unmatched: "No official record found",
  unlinked: "Marked as having no official record",
};
