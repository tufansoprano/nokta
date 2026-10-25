/** FHRS scores for England, Wales and Northern Ireland; FHIS results for Scotland. */
export type FoodHygieneScheme = "FHRS" | "FHIS";
export type FoodHygieneRating = "0" | "1" | "2" | "3" | "4" | "5" | "Pass" | "Improvement Required";

/** How a venue is tied to its official record. See the sprint-56 migration. */
export type FoodHygieneLinkStatus = "source" | "matched" | "unmatched" | "unlinked";

export interface VenueFoodHygiene {
  venueId: string;
  linkStatus: FoodHygieneLinkStatus;
  fhrsId: number | null;
  scheme: FoodHygieneScheme | null;
  /** Null when the venue has no rating, including "Awaiting inspection" and "Exempt". */
  rating: FoodHygieneRating | null;
  /** The last inspection, as YYYY-MM-DD. */
  ratingDate: string | null;
  officialUrl: string | null;
  businessName: string | null;
  businessAddress: string | null;
  checkedAt: string;
  updatedAt: string;
}

export interface VenueFoodHygieneRow {
  venue_id: string;
  link_status: FoodHygieneLinkStatus;
  fhrs_id: number | null;
  scheme: FoodHygieneScheme | null;
  rating: FoodHygieneRating | null;
  rating_date: string | null;
  official_url: string | null;
  business_name: string | null;
  business_address: string | null;
  checked_at: string;
  updated_at: string;
}

/** One establishment as the Food Standards Agency API (x-api-version 2) returns it; only the fields Nokta reads. */
export interface FsaEstablishment {
  FHRSID: number;
  BusinessName: string;
  AddressLine1: string;
  AddressLine2: string;
  AddressLine3: string;
  AddressLine4: string;
  PostCode: string;
  RatingValue: string;
  RatingDate: string | null;
  SchemeType: string;
}

/** The venue fields the refresh needs to find a venue's official record. */
export interface FoodHygieneVenue {
  id: string;
  name: string;
  address: string;
  postcode: string;
  foodHygieneSource: string | null;
}

/** What the refresh learned about one venue, before it is stored. */
export interface FoodHygieneRecord {
  fhrsId: number;
  scheme: FoodHygieneScheme;
  rating: FoodHygieneRating | null;
  ratingDate: string | null;
  officialUrl: string;
  businessName: string;
  businessAddress: string;
}

export type FoodHygieneLookup =
  | { kind: "record"; fhrsId: number; linkStatus: "source" | "matched" }
  | { kind: "search" }
  | { kind: "keep-unlinked" };
