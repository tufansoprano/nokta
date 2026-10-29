import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { ClaimedVenueBadge } from "@/components/admin/monetisation/ClaimedVenueBadge";
import { MonetisationStatusBadge } from "@/components/admin/monetisation/MonetisationStatusBadge";
import { PartnerTierBadge } from "@/components/admin/monetisation/PartnerTierBadge";
import { VenueVerificationBadge } from "@/components/venues/VenueVerificationBadge";
import { getVenueQuality } from "@/lib/venueQuality";
import { cn } from "@/lib/utils";
import type { Venue } from "@/types/venue";

const QUALITY_LABELS = {
  good: "Good",
  "needs-work": "Needs work",
  poor: "Poor",
};

const ROW_COLUMNS = "xl:grid-cols-[minmax(190px,1.8fr)_minmax(115px,1fr)_100px_minmax(125px,1fr)_minmax(120px,1fr)_110px]";

export function AdminVenueTable({ venues }: { venues: Venue[] }) {
  return (
    <section aria-label="Venues" className="overflow-hidden rounded-xl border border-nokta-border bg-nokta-surface">
      <div className={cn("hidden gap-3 border-b border-nokta-border bg-nokta-hover px-4 py-[9px] text-[11px] font-semibold uppercase tracking-[0.04em] text-nokta-ink-muted xl:grid", ROW_COLUMNS)}>
        <span>Venue</span><span>Verification</span><span>Quality</span><span>Owner &amp; plan</span><span>Commercial</span><span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-nokta-divider-row">
        {venues.map((venue) => {
          const quality = getVenueQuality(venue);
          return (
            <article key={venue.id} className={cn("grid grid-cols-2 items-start gap-x-4 gap-y-4 px-4 py-4 transition-colors hover:bg-nokta-hover-row xl:items-center xl:gap-3", ROW_COLUMNS)}>
              <div className="col-span-2 min-w-0 xl:col-span-1">
                <Link to={`/admin/venues/${venue.id}/edit`} className="block truncate text-sm font-semibold text-nokta-ink hover:text-nokta-accent-dark hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{venue.name}</Link>
                <p className="mt-0.5 truncate text-xs text-nokta-ink-muted">{[venue.area, venue.city, venue.postcode].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="min-w-0"><MobileLabel>Verification</MobileLabel><VenueVerificationBadge status={venue.verificationStatus} /></div>
              <div className="min-w-0"><MobileLabel>Quality</MobileLabel><span className="block text-sm font-semibold tabular-nums text-nokta-ink">{quality.score}<span className="font-normal text-nokta-ink-muted">/100</span></span><span className="block text-xs text-nokta-ink-muted">{QUALITY_LABELS[quality.level]}</span></div>
              <div className="min-w-0"><MobileLabel>Owner &amp; plan</MobileLabel><div className="flex flex-wrap items-center gap-1.5"><ClaimedVenueBadge claimed={venue.isClaimed} /><PartnerTierBadge tier={venue.partnerTier} /></div></div>
              <div className="min-w-0"><MobileLabel>Commercial</MobileLabel><MonetisationStatusBadge status={venue.monetisationStatus} /></div>
              <div className="col-span-2 flex items-center gap-3 border-t border-nokta-divider-row pt-3 text-[13px] font-semibold xl:col-span-1 xl:justify-end xl:border-0 xl:pt-0">
                <Link className="text-nokta-accent-dark hover:underline" to={`/admin/venues/${venue.id}/edit`}>Edit</Link>
                <Link className="text-nokta-accent-dark hover:underline" to={`/owner/venues/${venue.slug}/bookings`}>Workspace</Link>
                <Link className="inline-flex items-center gap-1 text-nokta-ink-muted hover:text-nokta-ink hover:underline" to={`/venues/${venue.slug}`}>
                  View <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MobileLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-nokta-ink-muted xl:hidden">{children}</span>;
}
