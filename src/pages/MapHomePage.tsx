import { ChevronDown, LocateFixed, Search, X } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { NoktaMapFocus, NoktaMapPoint } from "@/components/map/NoktaMap";
import { PageMeta } from "@/components/seo/PageMeta";
import { Skeleton } from "@/components/ui/skeleton";
import { VenueImage } from "@/components/venues/VenueImage";
import { brandConfig } from "@/config/brand";
import { useAppLocation } from "@/context/AppLocationContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useStableViewportHeight } from "@/hooks/useStableViewportHeight";
import { useVenues } from "@/hooks/useVenues";
import { trackEvent } from "@/lib/analytics";
import { DEFAULT_CITY, getActiveCities, getCityByName } from "@/lib/cities";
import { readHomeSeed } from "@/lib/homeSeed";
import { looksLikeUkPostcode, resolveManualLocation } from "@/lib/manualLocation";
import { calculateDistanceMiles, formatDistanceMiles, getNearestVenueCity, getVenueDistanceMiles } from "@/lib/location";
import { getVenueOpeningBoundary } from "@/lib/openingHours";
import { cn } from "@/lib/utils";
import type { Venue } from "@/types/venue";

// MapLibre is most of this page's weight; the venue sheet renders while it streams in.
const NoktaMap = lazy(async () => ({ default: (await import("@/components/map/NoktaMap")).NoktaMap }));

type FilterKey = "openNow" | "under25" | "groups" | "outdoor" | "late";

const FILTERS: { key: FilterKey; label: string; test: (venue: Venue, isOpen: boolean) => boolean }[] = [
  { key: "openNow", label: "Open now", test: (_venue, isOpen) => isOpen },
  { key: "under25", label: "Under £25", test: (venue) => venue.priceFrom != null && venue.priceFrom <= 25 },
  { key: "groups", label: "Groups", test: (venue) => venue.vibes.includes("groups") },
  { key: "outdoor", label: "Outdoor", test: (venue) => venue.outdoor || venue.vibes.includes("outdoor") },
  { key: "late", label: "Late", test: (venue) => venue.openLate || venue.vibes.includes("late-night") },
];

/** Cards in the swipe row; the expanded list shows the rest. */
const PEEK_CARD_LIMIT = 24;
const LIST_PAGE = 60;
/** Collapsed sheet sized to its content (handle, heading, chips, card row, Discover link). */
const PEEK_HEIGHT = 296;

interface MapVenue {
  venue: Venue;
  isOpen: boolean;
  /** "Open till 02:00" / "Opens 18:00" / null. */
  boundary: string | null;
  miles: number | null;
}

/**
 * Homepage as a map: every venue is a dot. A bottom sheet (a side panel on
 * desktop) carries the honest detail: price, closing time, distance.
 */
export function MapHomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { venues, isLoading } = useVenues();
  const { savedLocation, userLocation, locationStatus, useCurrentLocation, setPlaceLocation, clearLocation } = useAppLocation();
  const placeLabel = savedLocation?.source === "manual" && userLocation ? savedLocation.label : null;
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [firstCardReady, setFirstCardReady] = useState(false);
  const [loadMap, setLoadMap] = useState(isDesktop);
  const markFirstCardReady = useCallback(() => setFirstCardReady(true), []);
  // Held while typing so the keyboard covers the sheet rather than pushing it up the screen.
  const viewportHeight = useStableViewportHeight();
  // City and search live in the URL so a link (or an old /discover link) lands on the same view.
  // Without one, a visitor we can place sees the city nearest them; London is only the fallback.
  const nearestCity = useMemo(() => getNearestVenueCity(venues, userLocation), [venues, userLocation]);
  const homeCity = nearestCity && getCityByName(nearestCity) ? getCityByName(nearestCity)!.name : DEFAULT_CITY;
  const requestedCity = searchParams.get("city");
  const city = requestedCity && getCityByName(requestedCity) ? getCityByName(requestedCity)!.name : homeCity;
  const query = (searchParams.get("q") ?? "").trim();
  // A searched place stays in the box so the visitor can see, and clear, what the list is centred on.
  const [draft, setDraft] = useState(query || placeLabel || "");
  const lastPlaceRef = useRef(placeLabel);
  useEffect(() => {
    const lastPlace = lastPlaceRef.current;
    lastPlaceRef.current = placeLabel;
    if (lastPlace && !placeLabel) setDraft((current) => (current === lastPlace ? "" : current));
  }, [placeLabel]);
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  // A searched-for venue is usually wanted whether or not it is open right now.
  const [active, setActive] = useState<Set<FilterKey>>(() => new Set(query ? [] : ["openNow"]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [focus, setFocus] = useState<NoktaMapFocus | null>(null);
  const [wantsLocation, setWantsLocation] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);
  const scrollingFromMapRef = useRef(false);

  useEffect(() => {
    trackEvent("map_home_viewed");
  }, []);

  const cityConfig = getCityByName(city) ?? getActiveCities()[0];

  // Until the full list arrives, the default view draws its cards from the seed baked
  // into index.html. Open-now and distance are still worked out against the real clock.
  const isSeeded = isLoading && !requestedCity && !query && !userLocation;
  const sourceVenues = useMemo(() => (isSeeded ? readHomeSeed() : venues), [isSeeded, venues]);

  // A search spans every city (an owner looking for their venue, a name someone was
  // sent); otherwise the map shows the chosen city.
  const cityVenues: MapVenue[] = useMemo(() => {
    const now = new Date();
    const terms = normalise(query).split(/\s+/).filter(Boolean);
    return sourceVenues
      .filter((venue) => Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude))
      .filter((venue) => (terms.length ? matchesSearch(venue, terms) : venue.city === city))
      .map((venue) => {
        const boundary = getVenueOpeningBoundary(venue, now);
        return {
          venue,
          isOpen: boundary.status === "open",
          boundary: boundary.label,
          miles: userLocation ? getVenueDistanceMiles(venue, userLocation) : null,
        };
      });
  }, [sourceVenues, city, query, userLocation]);

  // Every filter except "Open now" shapes the map, so closed venues stay as muted dots;
  // "Open now" narrows only the list and the count.
  const mapVenues = useMemo(() => {
    const centre = userLocation ?? { latitude: cityConfig.latitude, longitude: cityConfig.longitude };
    const filtered = cityVenues.filter((item) => FILTERS.every((filter) => filter.key === "openNow" || !active.has(filter.key) || filter.test(item.venue, item.isOpen)));
    // Nearest first, from the visitor or else the city centre, so the first card sits in the opening view.
    // Within each half-mile band, venues with real photos lead.
    return filtered
      .map((item) => ({ item, distance: calculateDistanceMiles(centre, item.venue), hasPhoto: item.venue.images.length > 0 }))
      .sort((a, b) => Math.floor(a.distance * 2) - Math.floor(b.distance * 2) || Number(b.hasPhoto) - Number(a.hasPhoto) || a.distance - b.distance)
      .map(({ item }) => item);
  }, [cityVenues, active, userLocation, cityConfig.latitude, cityConfig.longitude]);

  const results = useMemo(() => (active.has("openNow") ? mapVenues.filter((item) => item.isOpen) : mapVenues), [mapVenues, active]);

  // MapLibre is expensive on phones. Let the first card photo paint before importing it.
  useEffect(() => {
    if (loadMap) return;
    if (isDesktop) {
      setLoadMap(true);
      return;
    }
    // Seeded cards can be ready before the live list; wait for it so the two downloads don't compete.
    if (isLoading || (!firstCardReady && results.length > 0)) return;

    let secondFrame = 0;
    let idleCallback = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if ("requestIdleCallback" in window) {
          idleCallback = window.requestIdleCallback(() => setLoadMap(true), { timeout: 1500 });
        } else {
          setLoadMap(true);
        }
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      if (idleCallback) window.cancelIdleCallback(idleCallback);
    };
  }, [firstCardReady, isDesktop, isLoading, loadMap, results.length]);

  // A stalled photo must not leave the map unavailable for the whole visit.
  useEffect(() => {
    if (loadMap || isDesktop || isLoading || !results.length || firstCardReady) return;
    const timer = window.setTimeout(() => setLoadMap(true), 8000);
    return () => window.clearTimeout(timer);
  }, [firstCardReady, isDesktop, isLoading, loadMap, results.length]);

  const points: NoktaMapPoint[] = useMemo(
    () => mapVenues.map(({ venue, isOpen, boundary }) => ({
      id: venue.id,
      latitude: venue.latitude,
      longitude: venue.longitude,
      isOpen,
      label: [venue.name, venue.priceFrom ? `£${venue.priceFrom}` : "£".repeat(venue.priceLevel), boundary?.replace("Open till", "till")].filter(Boolean).join(" · "),
    })),
    [mapVenues],
  );

  // Keep a selection on phones so the clay dot always marks the card in view;
  // drop one the filters have removed.
  useEffect(() => {
    if (selectedId && mapVenues.some((item) => item.venue.id === selectedId)) return;
    setSelectedId(!isDesktop && results.length ? results[0].venue.id : null);
  }, [results, mapVenues, selectedId, isDesktop]);

  // A new city or filter set starts the card row from its first card. Keyed on the
  // choices, not the results array, so a re-render never yanks the row back.
  const filterKey = `${city}|${query}|${[...active].sort().join(",")}`;
  useEffect(() => {
    cardsRef.current?.scrollTo({ left: 0 });
    setListLimit(LIST_PAGE);
  }, [filterKey]);

  // A new search frames its matches.
  useEffect(() => {
    if (!query || !mapVenues.length) return;
    if (mapVenues.length === 1) {
      const [{ venue }] = mapVenues;
      setFocus({ latitude: venue.latitude, longitude: venue.longitude, zoom: 15 });
      return;
    }
    const lngs = mapVenues.map((item) => item.venue.longitude);
    const lats = mapVenues.map((item) => item.venue.latitude);
    setFocus({ bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] });
    // Re-frame per search, not on every filter toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mapVenues.length > 0]);

  // Once the browser hands over a fresh position, fly there.
  useEffect(() => {
    if (!wantsLocation || locationStatus === "loading") return;
    setWantsLocation(false);
    if (locationStatus !== "success" || !userLocation) return;
    // Drop any picked city so the list follows the visitor to their nearest one.
    if (searchParams.has("city")) updateParams({ city: null });
    setFocus({ latitude: userLocation.latitude, longitude: userLocation.longitude, zoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsLocation, locationStatus, userLocation]);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  }

  function toggleFilter(key: FilterKey) {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      trackEvent("map_home_filter_toggled", { filter: key, enabled: next.has(key) });
      return next;
    });
  }

  function locate() {
    trackEvent("map_home_locate_clicked");
    // Always ask for a fresh fix: a saved postcode or an old position is not where the visitor is now.
    setWantsLocation(true);
    useCurrentLocation();
  }

  function selectFromMap(id: string) {
    setSelectedId(id);
    trackEvent("map_home_venue_selected", { venueId: id, source: "map" });
    const card = cardsRef.current?.querySelector<HTMLElement>(`[data-venue="${id}"]`);
    if (card) {
      scrollingFromMapRef.current = true;
      card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      window.setTimeout(() => (scrollingFromMapRef.current = false), 600);
    }
  }

  // Swiping the card row moves the clay dot to whichever card is centred.
  function handleCardScroll() {
    const row = cardsRef.current;
    if (!row || isDesktop || scrollingFromMapRef.current) return;
    const middle = row.scrollLeft + row.clientWidth / 2;
    let closest: string | null = null;
    let closestDistance = Infinity;
    for (const card of row.querySelectorAll<HTMLElement>("[data-venue]")) {
      const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = card.dataset.venue ?? null;
      }
    }
    if (closest && closest !== selectedId) setSelectedId(closest);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    // A postcode, or words no venue matches, is a place: centre the map and the list on it.
    if (next && (looksLikeUkPostcode(next) || !venues.some((venue) => matchesSearch(venue, normalise(next).split(/\s+/))))) {
      const place = await resolveManualLocation(next);
      if (place) {
        const label = place.label ?? next;
        setPlaceLocation({ ...place, label });
        setDraft(label);
        updateParams({ q: null, city: null });
        setSelectedId(null);
        setFocus({ latitude: place.latitude, longitude: place.longitude, zoom: 14 });
        (document.activeElement as HTMLElement | null)?.blur();
        trackEvent("map_home_searched", { hasQuery: true, place: true });
        return;
      }
    }
    updateParams({ q: next || null });
    // A searched-for venue is usually wanted whether or not it is open right now.
    if (next) setActive((current) => {
      const without = new Set(current);
      without.delete("openNow");
      return without;
    });
    setSelectedId(null);
    // Dismiss the keyboard so the results come into view.
    (document.activeElement as HTMLElement | null)?.blur();
    trackEvent("map_home_searched", { hasQuery: Boolean(next) });
  }

  function clearSearch() {
    setDraft("");
    updateParams({ q: null });
    if (placeLabel) clearLocation();
    setSelectedId(null);
    const config = getCityByName(city);
    if (config) setFocus({ latitude: config.latitude, longitude: config.longitude, zoom: config.defaultZoom + 1 });
  }

  const openCount = cityVenues.filter((item) => item.isOpen).length;
  const where = placeLabel ? `near ${placeLabel}` : userLocation ? "near you" : `in ${city}`;
  const heading = query
    ? `${results.length} ${results.length === 1 ? "match" : "matches"} for “${query}”`
    : active.has("openNow")
      ? `${results.length} open ${where}`
      : `${results.length} ${results.length === 1 ? "place" : "places"} ${where}`;
  const sheetPadding = isDesktop
    ? { top: 96, bottom: 40, left: 40, right: 40 }
    : { top: 130, bottom: isExpanded ? 80 : PEEK_HEIGHT, left: 30, right: 30 };

  return (
    <main data-full-viewport className="relative h-[calc(100dvh-65px)] overflow-hidden bg-nokta-map-bg lg:grid lg:grid-cols-[440px_1fr] lg:grid-rows-[minmax(0,1fr)]" style={!isDesktop && viewportHeight ? { height: viewportHeight - 65 } : undefined}>
      <PageMeta
        title={`${brandConfig.appName} - Discover Social Venues Across the UK`}
        description="See what's open near you on one map: shisha lounges and social venues with real prices, opening hours and photos. Request bookings direct."
        canonicalPath="/"
      />

      <div className="absolute inset-0 lg:relative lg:col-start-2 lg:row-start-1">
        {loadMap ? <Suspense fallback={null}>
          <NoktaMap
            points={points}
            selectedId={selectedId}
            onSelect={selectFromMap}
            center={[cityConfig.longitude, cityConfig.latitude]}
            zoom={cityConfig.defaultZoom + 1}
            focus={focus}
            userLocation={userLocation}
            padding={sheetPadding}
          />
        </Suspense> : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 grid gap-2.5 p-3.5 sm:p-5">
          <form onSubmit={handleSearch} className="pointer-events-auto flex h-[50px] items-center gap-2.5 rounded-[14px] border border-nokta-border bg-nokta-surface/95 px-3.5 shadow-[0_6px_18px_-10px_rgba(42,33,27,0.35)] backdrop-blur lg:max-w-[460px]">
            <Search className="h-[18px] w-[18px] shrink-0 text-nokta-ink-muted" aria-hidden="true" />
            <input
              type="search"
              enterKeyHint="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search a venue, area or postcode"
              aria-label="Search a venue, area or postcode"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-nokta-ink outline-none placeholder:text-nokta-ink-muted"
            />
            {draft || query ? (
              <button type="button" onClick={clearSearch} aria-label="Clear search" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-nokta-ink-muted hover:text-nokta-ink">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </form>
        </div>

        <button
          type="button"
          onClick={locate}
          aria-label="Show venues near me"
          className={cn(
            "absolute right-3.5 z-10 grid h-11 w-11 place-items-center rounded-full border border-nokta-border bg-nokta-surface text-nokta-ink shadow-[0_6px_14px_-8px_rgba(42,33,27,0.45)] transition-[bottom] duration-300 ease-out sm:right-5",
            isDesktop ? "bottom-8" : isExpanded ? "hidden" : "bottom-[310px]",
          )}
        >
          <LocateFixed className={cn("h-[18px] w-[18px]", locationStatus === "loading" && "animate-pulse text-clay-accent")} />
        </button>
        {locationStatus === "denied" ? (
          <p role="status" className="absolute inset-x-3.5 top-[76px] rounded-xl bg-nokta-solid-ink px-3.5 py-2.5 text-[13px] text-white sm:inset-x-5 lg:max-w-[460px]">
            Location is blocked in your browser settings. Search a city or area instead.
          </p>
        ) : null}
      </div>

      <section
        aria-label="Venues"
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[20px] bg-nokta-surface shadow-[0_-10px_30px_-14px_rgba(42,33,27,0.35)] transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "lg:relative lg:col-start-1 lg:row-start-1 lg:h-full lg:rounded-none lg:border-r lg:border-nokta-border lg:shadow-none",
          isExpanded ? "h-[88%]" : "h-[296px]",
        )}
      >
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          aria-label={isExpanded ? "Show the map" : "Show the full list"}
          aria-expanded={isExpanded}
          className="grid w-full shrink-0 place-items-center pb-1 pt-2.5 lg:hidden"
        >
          <span className="h-1 w-[38px] rounded-full bg-nokta-border" />
        </button>

        <div className="flex shrink-0 items-baseline justify-between gap-3 px-[18px] pb-2.5 pt-1 lg:pt-6">
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-nokta-ink lg:text-[22px]" aria-live="polite">
            {!isLoading ? heading : results.length ? `${active.has("openNow") ? "Open" : "Places"} ${where}` : "Finding places…"}
          </h1>
          <button type="button" onClick={() => setIsExpanded((value) => !value)} className="text-[13px] font-semibold text-nokta-ink lg:hidden">
            {isExpanded ? "Map" : "List"}
          </button>
        </div>

        <div className="flex shrink-0 snap-x gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [scroll-padding-inline:18px] lg:flex-wrap">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-pressed={active.has(filter.key)}
              onClick={() => toggleFilter(filter.key)}
              className={cn(
                "shrink-0 snap-start whitespace-nowrap rounded-full border px-[13px] py-2 text-[13.5px] font-medium transition-colors lg:px-3 lg:text-[13px]",
                active.has(filter.key) ? "border-nokta-ink bg-nokta-solid-ink text-white" : "border-nokta-border bg-nokta-surface text-nokta-ink hover:border-nokta-ink/40",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {isLoading && !results.length ? (
          <div className="flex gap-3 overflow-hidden px-[18px] pb-2 pt-3 lg:flex-col lg:gap-0 lg:pt-2">
            {[0, 1, 2].map((key) => <Skeleton key={key} className="h-[106px] w-[78%] max-w-[330px] shrink-0 rounded-[14px] lg:mb-3 lg:h-[92px] lg:w-full lg:max-w-none lg:rounded-[10px]" />)}
          </div>
        ) : !results.length ? (
          <div className="px-[18px] py-4">
            <p className="text-[14px] text-nokta-ink">
              {query ? `No places match “${query}”.` : active.has("openNow") && openCount === 0 ? `Nothing in ${city} is open right now.` : "Nothing matches those filters."}
            </p>
            <button type="button" onClick={query ? clearSearch : () => setActive(new Set())} className="mt-2 text-[13.5px] font-semibold text-clay-accent hover:underline">
              {query ? "Clear the search" : "Show every place"}
            </button>
          </div>
        ) : isExpanded || isDesktop ? (
          <ul className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-8 pt-2">
            {results.slice(0, listLimit).map((item, index) => (
              <li key={item.venue.id}>
                <VenueRow item={item} showCity={Boolean(query)} isSelected={item.venue.id === selectedId} onHover={() => isDesktop && setSelectedId(item.venue.id)} priority={index === 0} onReady={index === 0 ? markFirstCardReady : undefined} />
              </li>
            ))}
            {results.length > listLimit ? (
              <li className="pt-4">
                <button type="button" onClick={() => setListLimit((count) => count + LIST_PAGE)} className="h-10 rounded-xl border border-nokta-border px-4 text-[14px] font-semibold text-nokta-ink hover:border-nokta-ink/40">
                  Show more ({results.length - listLimit} left)
                </button>
              </li>
            ) : null}
          </ul>
        ) : (
          <>
            <div ref={cardsRef} onScroll={handleCardScroll} className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 pt-3 [scrollbar-width:none]">
              {results.slice(0, PEEK_CARD_LIMIT).map((item, index) => (
                <VenueCard key={item.venue.id} item={item} showCity={Boolean(query)} isSelected={item.venue.id === selectedId} priority={index === 0} onReady={index === 0 ? markFirstCardReady : undefined} />
              ))}
            </div>
{results.length > 1 && !isLoading ? (
            <button type="button" onClick={() => setIsExpanded(true)} className="mx-[18px] flex h-11 items-center justify-between border-t border-nokta-divider text-left text-[14px] font-semibold text-nokta-ink">
              See all {results.length} as a list
              <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
            </button>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function facts(venue: Venue) {
  return [venue.priceFrom ? `From £${venue.priceFrom}` : "£".repeat(venue.priceLevel), venue.food ? "Food" : null, venue.halal ? "Halal" : null].filter(Boolean).join(" · ");
}

function where(item: MapVenue, showCity: boolean) {
  const place = showCity && item.venue.city !== item.venue.area ? `${item.venue.area}, ${item.venue.city}` : item.venue.area;
  return [place, item.miles !== null ? formatDistanceMiles(item.miles) : null].filter(Boolean).join(" · ");
}

function normalise(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Every search word must appear in the venue's name, place, postcode or vibes. */
function matchesSearch(venue: Venue, terms: string[]) {
  const haystack = normalise([venue.name, venue.area, venue.city, venue.address, venue.postcode, venue.postcode?.replace(/\s+/g, ""), venue.vibes.join(" ")].filter(Boolean).join(" "));
  return terms.every((term) => haystack.includes(term));
}

function StatusLine({ item }: { item: MapVenue }) {
  if (!item.boundary) return null;
  return (
    <p className={cn("mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium", item.isOpen ? "text-forest-400" : "text-nokta-ink-muted")}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {item.boundary}
    </p>
  );
}

function VenueCard({ item, isSelected, showCity, priority, onReady }: { item: MapVenue; isSelected: boolean; showCity: boolean; priority: boolean; onReady?: () => void }) {
  return (
    <Link
      to={`/venues/${item.venue.slug}`}
      data-venue={item.venue.id}
      className={cn(
        "grid w-[78%] max-w-[330px] shrink-0 snap-center grid-cols-[84px_1fr] gap-[11px] rounded-[14px] border bg-nokta-surface p-2.5 transition-colors",
        isSelected ? "border-nokta-ink" : "border-nokta-border",
      )}
    >
      <VenueImage venue={item.venue} alt="" className="h-[84px] w-[84px] rounded-[10px] object-cover" monogramClassName="rounded-[10px]" thumbnailSize={192} priority={priority} onReady={onReady} />
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-nokta-ink">{item.venue.name}</h3>
        <p className="truncate text-[12.5px] text-nokta-ink-muted">{where(item, showCity)}</p>
        <p className="mt-1 truncate text-[12.5px] text-nokta-ink-subtle">{facts(item.venue)}</p>
        <StatusLine item={item} />
      </div>
    </Link>
  );
}

function VenueRow({ item, isSelected, onHover, showCity, priority, onReady }: { item: MapVenue; isSelected: boolean; onHover: () => void; showCity: boolean; priority: boolean; onReady?: () => void }) {
  return (
    <Link
      to={`/venues/${item.venue.slug}`}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cn(
        "relative isolate grid grid-cols-[92px_1fr] gap-3 border-t border-nokta-divider py-3.5 first:border-t-0",
        "before:absolute before:-inset-x-2.5 before:inset-y-1 before:-z-10 before:rounded-[14px] before:bg-nokta-hover before:opacity-0 before:transition-opacity",
        isSelected && "lg:before:opacity-100",
      )}
    >
      <VenueImage venue={item.venue} alt="" className="h-[92px] w-[92px] rounded-[10px] object-cover" monogramClassName="rounded-[10px]" thumbnailSize={192} priority={priority} onReady={onReady} />
      <div className="min-w-0">
        <h3 className="truncate text-[15.5px] font-semibold text-nokta-ink">{item.venue.name}</h3>
        <p className="truncate text-[12.5px] text-nokta-ink-muted">{where(item, showCity)}</p>
        <p className="mt-1.5 text-[12.5px] text-nokta-ink-subtle">{facts(item.venue)}</p>
        <StatusLine item={item} />
      </div>
    </Link>
  );
}
