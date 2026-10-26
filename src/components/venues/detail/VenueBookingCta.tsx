import { AlertCircle, ExternalLink, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetClose, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useVenueBookingGate } from "@/hooks/useVenueBookingGate";
import { explainEmptyTimeOptions, FALLBACK_TIME_OPTIONS, getBookingTimeOptions } from "@/lib/bookingTimeOptions";
import { trackEvent, trackVenueAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { getVenueBookingAvailability } from "@/services/bookingAvailabilityService";
import type { VenueBookingAvailability } from "@/types/bookingAvailability";
import type { Venue } from "@/types/venue";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getVenueAnalyticsProperties } from "./venueDetailAnalytics";

/**
 * Every venue takes booking requests, claimed or not. `isClaimed` changes only the
 * explanatory line and the claim nudge — never the presence of the form. A venue that has
 * explicitly turned requests off still gets the enquiry route without date/time/party.
 */
export function BookingSidebarCard({ venue, className, compact = false }: { venue: Venue; className?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const [date, setDate] = useState(getTodayDateValue());
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [availability, setAvailability] = useState<VenueBookingAvailability | null>(null);
  const { gate } = useVenueBookingGate(venue);
  const hasPublishedHours = availability ? availability.windows.some((window) => window.isEnabled) : false;
  const availableTimeOptions = useMemo(() => (availability && date ? getBookingTimeOptions({ availability, selectedDate: date }) : []), [availability, date]);
  /**
   * The generic evening list only covers a venue that has published nothing —
   * no settings row, hours never set — or the moment before it loads. A venue
   * with hours never lies: a full or closed date shows no times and says why.
   */
  const usingFallback = !availability || !hasPublishedHours;
  const timeOptions = availableTimeOptions.length ? availableTimeOptions : usingFallback ? FALLBACK_TIME_OPTIONS : [];
  const emptyTimeReason = useMemo(
    () => (availability && date && hasPublishedHours && !availableTimeOptions.length ? explainEmptyTimeOptions({ availability, selectedDate: date }) : null),
    [availability, date, hasPublishedHours, availableTimeOptions],
  );
  const partySizeOptions = useMemo(
    () => buildPartySizeOptions(availability?.settings.minPartySize ?? 1, availability?.settings.maxPartySize ?? 20),
    [availability?.settings.minPartySize, availability?.settings.maxPartySize],
  );
  // Only an explicit opt-out removes the date/time/party fields; unclaimed venues keep them.
  const requestsDisabled = gate?.isClaimed === true && gate.bookingRequestsEnabled === false;
  const hasDirectContact = Boolean(venue.phone || venue.website);

  useEffect(() => {
    let cancelled = false;
    getVenueBookingAvailability(venue.id)
      .then((nextAvailability) => {
        if (!cancelled) setAvailability(nextAvailability);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });

    return () => {
      cancelled = true;
    };
  }, [venue.id]);

  // Keep the party inside the venue's own bounds once they are known.
  useEffect(() => {
    if (!availability) return;
    const min = availability.settings.minPartySize;
    const max = Math.max(Math.min(availability.settings.maxPartySize, 100), min);
    setPartySize((current) => Math.min(Math.max(current, min), max));
  }, [availability?.settings.minPartySize, availability?.settings.maxPartySize]);

  // A time picked from the loading fallback may not exist in the venue's real
  // hours — drop it rather than carrying it to the form for a submit-time error.
  useEffect(() => {
    if (!usingFallback && time && availableTimeOptions.length && !availableTimeOptions.includes(time)) setTime("");
  }, [usingFallback, time, availableTimeOptions]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!time) return;
    trackBookingCta(venue);
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    if (partySize) params.set("partySize", String(partySize));
    const query = params.toString();
    navigate(`/venues/${venue.slug}/request-booking${query ? `?${query}` : ""}`);
  }

  return (
    <form className={cn("rounded-2xl border border-nokta-border bg-nokta-surface p-[17px] shadow-[0_1px_3px_rgba(28,25,23,0.05)]", compact && "border-0 p-0 shadow-none", className)} onSubmit={handleSubmit}>
      {!compact ? <h2 className="text-[15px] font-semibold text-nokta-ink">Request a booking</h2> : null}
      <p className={cn("text-[13px] leading-[1.55] text-nokta-ink-muted", compact ? "mt-0" : "mt-2")}>{getBookingNote(venue, requestsDisabled)}</p>

      <div className="mt-3.5 grid gap-2.5">
        {requestsDisabled ? null : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={date}
                aria-label="Booking date"
                className="h-11 rounded-lg border-nokta-border-input bg-nokta-surface px-[11px] text-base text-nokta-ink sm:text-sm"
                onChange={(event) => {
                  setDate(event.target.value);
                  setTime("");
                }}
              />
              <Select value={time} aria-label="Booking time" className="h-11 rounded-lg border-nokta-border-input bg-nokta-surface px-[11px] text-base text-nokta-ink sm:text-sm" placeholder={timeOptions.length ? "Time" : "No times"} options={timeOptions.map((option) => ({ label: option, value: option }))} disabled={!date || !timeOptions.length} onValueChange={setTime} />
            </div>
            {emptyTimeReason ? <p className="text-[12.5px] leading-[1.5] text-nokta-ink-muted">{emptyTimeReason}</p> : null}
            <Select value={String(partySize)} aria-label="Party size" className="h-11 rounded-lg border-nokta-border-input bg-nokta-surface px-[11px] text-base text-nokta-ink sm:text-sm" options={partySizeOptions.map((size) => ({ label: `${size} ${size === 1 ? "person" : "people"}`, value: String(size) }))} onValueChange={(value) => setPartySize(Number(value))} />
            <Button type="submit" className="h-[46px] rounded-lg bg-clay-accent text-[14.5px] font-semibold text-white hover:bg-clay-accent-hover" disabled={!date || !time}>
              Request booking
            </Button>
          </>
        )}
        <Button asChild variant="outline" className="h-11 rounded-lg border-nokta-border bg-nokta-surface text-sm font-medium text-nokta-ink hover:bg-nokta-hover" onClick={() => trackEnquiryCta(venue)}>
          <Link to={`/venues/${venue.slug}/enquire`}>Send enquiry</Link>
        </Button>
      </div>

      {hasDirectContact ? (
        <div className="mt-3.5 flex flex-wrap gap-2 border-t border-nokta-row-border pt-[13px]">
          {venue.phone ? (
            <a href={`tel:${venue.phone}`} className="inline-flex min-h-9 items-center gap-[7px] rounded-lg border border-nokta-border px-3 py-1.5 text-[13px] font-medium text-nokta-ink transition-colors hover:bg-nokta-hover">
              <Phone className="h-3.5 w-3.5" />
              {venue.phone}
            </a>
          ) : null}
          {venue.website ? (
            <a href={venue.website} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-9 items-center gap-[7px] rounded-lg border border-nokta-border px-3 py-1.5 text-[13px] font-medium text-nokta-ink transition-colors hover:bg-nokta-hover">
              <ExternalLink className="h-3.5 w-3.5" />
              Book on their site
            </a>
          ) : null}
        </div>
      ) : null}

      {!venue.isClaimed ? (
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-nokta-row-border pt-[13px]">
          <p className="max-w-[172px] text-[12.5px] leading-[1.45] text-nokta-ink-subtle">Work here? Take bookings through nokta.</p>
          <Button asChild className="h-9 shrink-0 rounded-lg bg-nokta-solid-ink px-[13px] text-[12.5px] font-medium text-white hover:bg-nokta-solid-ink/90">
            <Link to={`/venues/${venue.slug}/claim`}>Claim venue</Link>
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function MobileBookingCta({ venue }: { venue: Venue }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] border-t border-nokta-border bg-nokta-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_28px_rgba(28,25,23,0.08)] lg:hidden">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-nokta-ink">{venue.name}</p>
          <p className="truncate text-xs text-nokta-ink-muted">Request a booking</p>
        </div>
        <Button type="button" className="h-11 shrink-0 rounded-lg bg-clay-accent px-5 text-white hover:bg-clay-accent-hover" onClick={() => setOpen(true)}>
          Request booking
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} side="bottom">
        <SheetHeader>
          <div>
            <SheetTitle>Request a booking</SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">{venue.name}</p>
          </div>
          <SheetClose onClick={() => setOpen(false)} />
        </SheetHeader>
        <BookingSidebarCard venue={venue} compact />
      </Sheet>
    </div>
  );
}

/**
 * Used by RequestBookingPage for a claimed venue that turned requests off after the
 * customer landed on the form. Unclaimed venues never see this: nokta forwards their requests.
 */
export function BookingUnavailableCard({ venue, className, compact = false }: { venue: Venue; className?: string; compact?: boolean }) {
  return (
    <aside className={cn("rounded-2xl border border-nokta-border bg-nokta-surface p-5 shadow-sm shadow-stone-950/5", compact && "border-0 p-0 shadow-none", className)}>
      <div className="flex items-start gap-3"><span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-nokta-page-bg"><AlertCircle className="h-4 w-4 text-nokta-accent" /></span><div><h2 className="text-[15px] font-semibold text-nokta-ink">Takes enquiries, not booking requests</h2><p className="mt-2 text-sm leading-6 text-nokta-ink-muted">{venue.name} hasn't switched on date-and-time booking. Send an enquiry or contact them directly.</p></div></div>
      <div className="mt-4 grid gap-2">
        {venue.website ? <Button asChild className="h-11 rounded-lg bg-nokta-accent-solid text-white hover:bg-clay-accent-hover"><a href={venue.website} target="_blank" rel="noreferrer">Book on their website <ExternalLink className="ml-2 h-4 w-4" /></a></Button> : null}
        {venue.phone ? <Button asChild variant="outline" className="h-11 rounded-lg border-nokta-border bg-nokta-surface text-nokta-ink"><a href={`tel:${venue.phone}`}><Phone className="mr-2 h-4 w-4" />{venue.phone}</a></Button> : null}
        <Button asChild variant="outline" className="h-11 rounded-lg border-nokta-border bg-nokta-surface text-nokta-ink" onClick={() => trackEnquiryCta(venue)}><Link to={`/venues/${venue.slug}/enquire`}>Send enquiry</Link></Button>
      </div>
    </aside>
  );
}

function getBookingNote(venue: Venue, requestsDisabled: boolean): string {
  if (requestsDisabled) return `${venue.name} isn't taking date-and-time requests. Send an enquiry and they'll reply directly.`;
  if (!venue.isClaimed) return `${venue.name} isn't managing bookings on nokta yet. Send a request and we'll pass it to them, or contact them directly below.`;
  return "Requests are confirmed once the venue accepts. Usually within an hour during opening times.";
}

function trackEnquiryCta(venue: Venue) {
  trackEvent("enquiry_cta_clicked", getVenueAnalyticsProperties(venue));
  trackVenueAnalyticsEvent({
    venueId: venue.id,
    eventName: "venue_enquiry_cta_clicked",
    city: venue.city,
    area: venue.area,
    sourceSurface: "venue_page",
  });
}

function trackBookingCta(venue: Venue) {
  trackEvent("booking_request_started", { ...getVenueAnalyticsProperties(venue), city: venue.city, sourceSurface: "venue_page" });
  trackVenueAnalyticsEvent({
    venueId: venue.id,
    eventName: "venue_booking_cta_clicked",
    city: venue.city,
    area: venue.area,
    sourceSurface: "venue_page",
  });
}

function getTodayDateValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/** Party sizes offered in the sidebar: the venue's own bounds, capped at 20. */
function buildPartySizeOptions(min: number, max: number) {
  const lower = Math.max(1, min);
  const upper = Math.max(Math.min(Math.max(max, lower), 20), lower);
  return Array.from({ length: upper - lower + 1 }, (_, index) => lower + index);
}
