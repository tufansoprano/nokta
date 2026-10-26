import type { UserLocation } from "@/types/location";

const FULL_UK_POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const UK_OUTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?$/i;
// Several places share a name (there is a village called Mansfield in Ayrshire), so the bigger one wins.
const PLACE_TYPE_RANK: Record<string, number> = { City: 0, Town: 1, "Suburban Area": 2, Village: 3, Hamlet: 4, "Other Settlement": 5 };

const LONDON_AREAS: Record<string, UserLocation> = {
  bermondsey: { latitude: 51.4979, longitude: -0.0637 },
  "canary wharf": { latitude: 51.5054, longitude: -0.0235 },
  chelsea: { latitude: 51.4875, longitude: -0.1687 },
  dalston: { latitude: 51.545, longitude: -0.0744 },
  ealing: { latitude: 51.513, longitude: -0.3089 },
  "edgware road": { latitude: 51.5195, longitude: -0.1661 },
  hackney: { latitude: 51.545, longitude: -0.0553 },
  holborn: { latitude: 51.5172, longitude: -0.1182 },
  "king's cross": { latitude: 51.5308, longitude: -0.1238 },
  kingscross: { latitude: 51.5308, longitude: -0.1238 },
  knightsbridge: { latitude: 51.499, longitude: -0.163 },
  mayfair: { latitude: 51.5116, longitude: -0.1478 },
  paddington: { latitude: 51.5154, longitude: -0.1755 },
  shoreditch: { latitude: 51.5255, longitude: -0.0771 },
  soho: { latitude: 51.5136, longitude: -0.1365 },
  stratford: { latitude: 51.5413, longitude: -0.0034 },
  wembley: { latitude: 51.5588, longitude: -0.2817 },
  westminster: { latitude: 51.4975, longitude: -0.1357 },
};

interface PostcodesIoOutcodeResponse {
  result?: { latitude?: number | null; longitude?: number | null; outcode?: string } | null;
}

interface PostcodesIoPlace {
  name_1?: string;
  local_type?: string;
  latitude?: number;
  longitude?: number;
}

interface PostcodesIoResponse {
  status: number;
  result?: {
    latitude?: number;
    longitude?: number;
    postcode?: string;
  } | null;
}

/** A full postcode ("E1 6AN") or just its outward half ("E1"). */
export function looksLikeUkPostcode(input: string) {
  const value = input.trim();
  return FULL_UK_POSTCODE_PATTERN.test(value) || UK_OUTCODE_PATTERN.test(value);
}

export async function resolveManualLocation(input: string): Promise<UserLocation | null> {
  const label = input.trim();
  if (!label) {
    return null;
  }

  const areaMatch = LONDON_AREAS[label.toLowerCase()];
  if (areaMatch) {
    return {
      ...areaMatch,
      label,
      source: "manual",
    };
  }

  if (UK_OUTCODE_PATTERN.test(label)) {
    return resolveOutcode(label);
  }

  if (!FULL_UK_POSTCODE_PATTERN.test(label)) {
    return resolvePlace(label);
  }

  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(label)}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PostcodesIoResponse;
    const latitude = data.result?.latitude;
    const longitude = data.result?.longitude;

    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      latitude,
      longitude,
      label: data.result?.postcode ?? label,
      source: "manual",
    };
  } catch {
    return null;
  }
}

async function resolveOutcode(input: string): Promise<UserLocation | null> {
  try {
    const response = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(input)}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PostcodesIoOutcodeResponse;
    const latitude = data.result?.latitude;
    const longitude = data.result?.longitude;
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
      return null;
    }

    return { latitude, longitude, label: data.result?.outcode ?? input.toUpperCase(), source: "manual" };
  } catch {
    return null;
  }
}

async function resolvePlace(input: string): Promise<UserLocation | null> {
  try {
    const response = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(input)}&limit=20`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { result?: PostcodesIoPlace[] | null };
    const wanted = input.toLowerCase();
    const rank = (place: PostcodesIoPlace) =>
      (place.name_1?.toLowerCase() === wanted ? 0 : 10) + (PLACE_TYPE_RANK[place.local_type ?? ""] ?? 6);
    const place = (data.result ?? [])
      .filter((candidate) => isFiniteNumber(candidate.latitude) && isFiniteNumber(candidate.longitude))
      .sort((a, b) => rank(a) - rank(b))[0];

    if (!place || !isFiniteNumber(place.latitude) || !isFiniteNumber(place.longitude)) {
      return null;
    }

    return { latitude: place.latitude, longitude: place.longitude, label: place.name_1 ?? input, source: "manual" };
  } catch {
    return null;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
