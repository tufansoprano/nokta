import type { Venue } from "@/types/venue";

const squash = (value: string) => value.replace(/\s+/g, "").toLowerCase();

/**
 * The venue's address as two display lines: the street, then the town and postcode.
 * Most imported addresses already end in "Town POSTCODE", so the city and postcode
 * fields are only appended when the address is missing them.
 */
export function getVenueAddressLines(venue: Pick<Venue, "address" | "city" | "postcode">): { street: string; locality: string } {
  const address = venue.address.trim().replace(/,?\s*(United Kingdom|UK)$/i, "");
  const postcode = venue.postcode.trim();

  if (postcode && squash(address).includes(squash(postcode))) {
    const lastComma = address.lastIndexOf(",");
    if (lastComma === -1) return { street: "", locality: address };
    return { street: address.slice(0, lastComma).trim(), locality: address.slice(lastComma + 1).trim() };
  }

  return { street: address, locality: [venue.city, postcode].filter(Boolean).join(" ") };
}

/** Google Maps directions to the venue's pin, falling back to its address. */
export function getVenueDirectionsUrl(venue: Pick<Venue, "name" | "address" | "postcode" | "latitude" | "longitude">): string {
  const destination = Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude) ? `${venue.latitude},${venue.longitude}` : `${venue.name}, ${venue.address} ${venue.postcode}`.trim();
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
