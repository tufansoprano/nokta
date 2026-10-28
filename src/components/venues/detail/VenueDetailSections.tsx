import { ReviewSection } from "@/components/reviews/ReviewSection";
import { getFoodHygieneDisplay } from "@/lib/foodHygiene";
import { hasValidCoordinates } from "@/lib/map";
import { cn } from "@/lib/utils";
import { getVenueAddressLines, getVenueDirectionsUrl } from "@/lib/venueAddress";
import { getGroupedOpeningHours, getTodayOpeningLabel } from "@/lib/openingHours";
import { getVenueAmenities, type VenueAmenityIcon } from "@/lib/venueAmenities";
import { formatPenceAsPrice } from "@/lib/venueMenuValidation";
import { getPublicVenueFoodHygiene } from "@/services/venueFoodHygieneService";
import { getPublicVenueMenu } from "@/services/venueMenuService";
import type { Venue } from "@/types/venue";
import type { VenueMenu } from "@/types/venueMenu";
import { useQuery } from "@tanstack/react-query";
import { Armchair, Clock, ExternalLink, Martini, Navigation, Umbrella, Users, Utensils } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { VenueImage } from "@/components/venues/VenueImage";

const AMENITY_ICONS: Record<VenueAmenityIcon, typeof Clock> = {
  awning: Umbrella,
  utensils: Utensils,
  clock: Clock,
  users: Users,
  sofa: Armchair,
  glass: Martini,
};

const MENU_PREVIEW_LIMIT = 3;

// MapLibre is large; load it only when a venue page renders its location card.
const VenueLocationMap = lazy(async () => ({ default: (await import("@/components/map/VenueLocationMap")).VenueLocationMap }));

export function OverviewTab({ venue, similarVenues, onOpenMenu }: { venue: Venue; similarVenues: Venue[]; onOpenMenu: () => void }) {
  const amenities = getVenueAmenities(venue);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        {amenities.map((amenity) => {
          const Icon = amenity.icon ? AMENITY_ICONS[amenity.icon] : null;
          return (
            <span key={amenity.label} className={cn("inline-flex min-h-8 items-center gap-[7px] rounded-lg px-3 py-[5px] text-[13px] font-medium", amenity.isUnknown ? "text-nokta-ink-muted" : "border border-nokta-border bg-nokta-surface text-nokta-ink")}>
              {Icon ? <Icon className="h-3.5 w-3.5 text-clay-accent" strokeWidth={2} /> : null}
              {amenity.label}
            </span>
          );
        })}
      </div>

      <MenuPreviewCard venue={venue} onOpenMenu={onOpenMenu} />

      {similarVenues.length ? (
        <>
          <h2 className="mt-[26px] text-[17px] font-semibold text-nokta-ink">Similar in {venue.area}</h2>
          <SimilarVenueCarousel venues={similarVenues} />
        </>
      ) : null}
    </div>
  );
}

/** Three priced lines above the fold; the card disappears when the venue has no menu items. */
function MenuPreviewCard({ venue, onOpenMenu }: { venue: Venue; onOpenMenu: () => void }) {
  const menu = useVenueMenu(venue.id);
  const previewItems = menu?.items.slice(0, MENU_PREVIEW_LIMIT) ?? [];

  if (!previewItems.length) {
    return null;
  }

  return (
    <section className="mt-[22px] overflow-hidden rounded-[14px] border border-nokta-border bg-nokta-surface">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-3.5">
        <h2 className="text-[15px] font-semibold text-nokta-ink">Menu</h2>
        <button type="button" className="text-[12.5px] font-medium text-clay-accent hover:text-clay-accent-hover hover:underline" onClick={onOpenMenu}>
          See full menu
        </button>
      </div>
      {previewItems.map((item) => (
        <div key={item.id} className="flex items-baseline justify-between gap-4 border-t border-nokta-row-border px-4 py-[11px] text-[13.5px] font-medium text-nokta-ink">
          <span className="min-w-0">{item.name}</span>
          <span className="flex-none">{formatPenceAsPrice(item.pricePence)}</span>
        </div>
      ))}
    </section>
  );
}

export function MenuTab({ venue }: { venue: Venue }) {
  const menu = useVenueMenu(venue.id);
  const menuLink = venue.dataSources.shishaMenuUrl ?? venue.dataSources.menuUrl;

  if (menu?.items.length) {
    return (
      <section className="max-w-3xl space-y-5">
        {menu.sections.map((section) => {
          const sectionItems = menu.items.filter((item) => item.sectionId === section.id);
          if (!sectionItems.length) return null;
          return (
            <div key={section.id}>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.5px] text-nokta-ink">{section.name}</h3>
              <div className="mt-3 overflow-hidden rounded-[14px] border border-nokta-border bg-nokta-surface">
                {sectionItems.map((item, index) => (
                  <div key={item.id} className={cn("flex items-baseline justify-between gap-4 px-4 py-[11px] text-[13.5px]", index > 0 && "border-t border-nokta-row-border")}>
                    <div className="min-w-0">
                      <span className="font-medium text-nokta-ink">{item.name}</span>
                      {item.note ? <p className="mt-0.5 text-[13px] text-nokta-ink-muted">{item.note}</p> : null}
                    </div>
                    <span className="flex-none font-medium text-nokta-ink">{formatPenceAsPrice(item.pricePence)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    );
  }

  if (menuLink) {
    return (
      <a href={menuLink} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-clay-accent hover:text-clay-accent-hover hover:underline">
        View the full menu →
      </a>
    );
  }

  return <p className="text-sm text-nokta-ink-muted">{venue.name} hasn't published a menu on nokta yet.</p>;
}

export function ReviewsTab({ venue }: { venue: Venue }) {
  return <ReviewSection venue={venue} />;
}

/**
 * The rail's second card: today's hours, the grouped week, the map, the address, the
 * food hygiene rating and the provenance line. It replaces the old "Key details" and "Plan your visit" blocks, and
 * stays put as the main column's tab changes.
 */
export function VenueHoursLocationCard({ venue, className }: { venue: Venue; className?: string }) {
  const todayLabel = getTodayOpeningLabel(venue);
  const groupedHours = getGroupedOpeningHours(venue.openingHours);

  return (
    <section className={cn("rounded-2xl border border-nokta-border bg-nokta-surface p-[17px]", className)}>
      {groupedHours.length ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-nokta-ink-muted">Today</p>
            {todayLabel ? <span className="text-[13px] font-medium text-nokta-ink">{todayLabel}</span> : null}
          </div>
          <div className="mt-[11px] grid gap-1.5 text-[13px]">
            {groupedHours.map((row) => (
              <div key={row.days} className="grid grid-cols-[1fr_auto]">
                <span className="text-nokta-ink-muted">{row.days}</span>
                <span className="text-nokta-ink-subtle">{row.hours}</span>
              </div>
            ))}
          </div>
          <div className="my-[15px] h-px bg-nokta-border" />
        </>
      ) : null}

      <VenueLocation venue={venue} />

      <FoodHygieneRow venueId={venue.id} />

      <div className="mt-[13px] flex flex-wrap items-center gap-2 text-[12.5px] text-nokta-ink-muted">
        {venue.verificationStatus === "verified" ? <span className="inline-flex h-[22px] items-center rounded-full bg-[oklch(0.95_0.05_150)] px-[9px] text-[11px] font-semibold text-[oklch(0.4_0.1_150)]">Verified</span> : null}
        {venue.lastVerifiedAt ? `Checked ${formatVerifiedDate(venue.lastVerifiedAt)} · details can change` : "Details can change"}
      </div>
    </section>
  );
}

/** Map pin, then the address with a directions link; the map is left out when the venue has no coordinates. */
function VenueLocation({ venue }: { venue: Venue }) {
  const { street, locality } = getVenueAddressLines(venue);

  return (
    <div>
      {hasValidCoordinates(venue) ? (
        <div className="mb-3 h-[180px] overflow-hidden rounded-xl border border-nokta-border bg-nokta-map-bg">
          <Suspense fallback={null}>
            <VenueLocationMap latitude={venue.latitude} longitude={venue.longitude} label={venue.name} />
          </Suspense>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <address className="min-w-0 text-[13.5px] not-italic leading-[1.5]">
          {street ? <span className="block font-medium text-nokta-ink">{street}</span> : null}
          <span className={cn("block", street ? "text-nokta-ink-muted" : "font-medium text-nokta-ink")}>{locality}</span>
        </address>
        <a href={getVenueDirectionsUrl(venue)} target="_blank" rel="noreferrer noopener" aria-label={`Directions to ${venue.name} in Google Maps`} className="inline-flex min-h-8 flex-none items-center gap-1.5 text-[12.5px] font-medium text-clay-accent hover:text-clay-accent-hover hover:underline">
          <Navigation className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Directions
        </a>
      </div>
    </div>
  );
}

/** The official rating with its inspection date and source; absent when the venue has no rating or the read fails. */
function FoodHygieneRow({ venueId }: { venueId: string }) {
  const { data } = useQuery({ queryKey: ["venue-food-hygiene", venueId], queryFn: () => getPublicVenueFoodHygiene(venueId) });
  const display = getFoodHygieneDisplay(data ?? null);
  if (!display) return null;

  return (
    <div data-testid="venue-food-hygiene" className="mt-[15px] border-t border-nokta-border pt-[15px]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-nokta-ink-muted">{display.heading}</p>
        <span className="text-[13px] font-semibold text-nokta-ink">{display.result}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]">
        {display.inspectedLabel ? <span className="text-nokta-ink-muted">{display.inspectedLabel}</span> : null}
        <a href={display.officialUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-8 items-center gap-1 font-medium text-clay-accent hover:text-clay-accent-hover hover:underline">
          {display.officialLinkLabel}
          <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Public menu for a venue, or null while loading or when the read fails. */
function useVenueMenu(venueId: string): VenueMenu | null {
  const [menu, setMenu] = useState<VenueMenu | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicVenueMenu(venueId)
      .then((nextMenu) => {
        if (!cancelled) setMenu(nextMenu);
      })
      .catch(() => {
        if (!cancelled) setMenu(null);
      });
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return menu;
}

function SimilarVenueCarousel({ venues }: { venues: Venue[] }) {
  return (
    <div className="-mx-4 mt-3 flex max-w-[calc(100%+2rem)] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:max-w-full sm:px-0">
      {venues.map((venue) => (
        <Link key={venue.id} to={`/venues/${venue.slug}`} className="w-[186px] shrink-0 rounded-[14px] border border-nokta-border bg-nokta-surface p-2 transition-colors hover:border-[oklch(0.8_0.03_50)]">
          <VenueImage venue={venue} alt={`${venue.name} interior`} className="h-[94px] w-full rounded-[10px] object-cover" />
          <span className="mt-[9px] block truncate px-0.5 text-[13.5px] font-semibold text-nokta-ink">{venue.name}</span>
          <span className="mb-1 mt-0.5 block truncate px-0.5 text-[12px] text-nokta-ink-muted">{[venue.area, venue.isClaimed ? "takes bookings" : null].filter(Boolean).join(" · ")}</span>
        </Link>
      ))}
    </div>
  );
}

function formatVerifiedDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value));
}
