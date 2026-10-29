import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { VenueBookingListView, type VenueBookingListFilter } from "@/components/owner/venueBookings/VenueBookingListView";
import { VenueBookingMonthGrid } from "@/components/owner/venueBookings/VenueBookingMonthGrid";
import { VenueBookingToolbar } from "@/components/owner/venueBookings/VenueBookingToolbar";
import { VenueBookingWeekGrid } from "@/components/owner/venueBookings/VenueBookingWeekGrid";
import { CitySelector } from "@/components/search/CitySelector";
import { PageMeta } from "@/components/seo/PageMeta";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { Select } from "@/components/ui/select";
import { WorkspacePageHeader, workspaceSecondaryActionClass } from "@/components/workspace/WorkspacePageHeader";
import { useVenues } from "@/hooks/useVenues";
import { addCalendarPeriod, formatCalendarHeading, getBookingCalendarDateRange, toDateInputValue } from "@/lib/bookingCalendarDates";
import { mapBookingRequestToCalendarEvent } from "@/lib/bookingCalendarMappers";
import { isEventAwaitingReply } from "@/lib/bookingCalendarGeometry";
import { getEffectiveBookingSlot, OCCUPYING_BOOKING_STATUSES } from "@/lib/bookingSlot";
import { DEFAULT_CITY } from "@/lib/cities";
import { getAdminBookingRequests } from "@/services/adminBookingRequestService";
import type { BookingCalendarEvent, BookingCalendarView } from "@/types/bookingCalendar";
import type { BookingRequest } from "@/types/bookingRequests";
import type { Venue } from "@/types/venue";

const VIEWS: BookingCalendarView[] = ["today", "week", "month", "list"];

/**
 * Every booking request on nokta, on one calendar. Read-only: answering stays in
 * Demand, so clicking a booking opens it there (forward, accept, decline, notes).
 */
export function AdminBookingsPage() {
  const navigate = useNavigate();
  const { venues, isLoading: venuesLoading, error: venuesError } = useVenues();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const defaultView: BookingCalendarView = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches ? "list" : "week";
  const view = readView(searchParams.get("view")) ?? defaultView;
  const anchorDate = useMemo(() => readDate(searchParams.get("date")), [searchParams]);
  const listFilter = (searchParams.get("filter") as VenueBookingListFilter | null) ?? "all";
  const isPast = searchParams.get("past") === "1";
  const city = searchParams.get("city") ?? DEFAULT_CITY;
  const venueFilter = searchParams.get("venue") ?? "all";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getAdminBookingRequests()
      .then((nextRequests) => {
        if (!cancelled) setRequests(nextRequests);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : "Could not load bookings.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) value === null ? params.delete(key) : params.set(key, value);
    setSearchParams(params, { replace: true });
  }

  const range = useMemo(() => {
    if (view !== "list") return getBookingCalendarDateRange({ view, anchorDate });
    const start = new Date(anchorDate);
    if (isPast) start.setDate(start.getDate() - 30);
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return { dateFrom: toDateInputValue(start), dateTo: toDateInputValue(end) };
  }, [view, anchorDate, isPast]);

  const venuesById = useMemo<Record<string, Venue>>(() => Object.fromEntries(venues.map((venue) => [venue.id, venue])), [venues]);

  // Spam never belongs on a calendar; everything else in the chosen city does.
  const cityRequests = useMemo(
    () => requests.filter((request) => request.status !== "spam" && venuesById[request.venueId]?.city === city),
    [requests, venuesById, city],
  );

  // Only venues that have had a request — the full venue list is far too long to pick from.
  const venueOptions = useMemo(() => {
    const ids = [...new Set(cityRequests.map((request) => request.venueId))];
    const options = ids
      .map((id) => ({ label: venuesById[id]?.name ?? id, value: id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ label: "All venues", value: "all" }, ...options];
  }, [cityRequests, venuesById]);

  const events = useMemo(() => cityRequests
    .filter((request) => venueFilter === "all" || request.venueId === venueFilter)
    .map((request) => ({ request, slot: getEffectiveBookingSlot(request) }))
    .filter(({ slot }) => slot.date >= range.dateFrom && slot.date <= range.dateTo)
    .map(({ request }) => mapBookingRequestToCalendarEvent({ bookingRequest: request, venueName: venuesById[request.venueId]?.name ?? request.venueId }))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
  [cityRequests, venueFilter, range.dateFrom, range.dateTo, venuesById]);

  const waitingEvents = events.filter(isEventAwaitingReply);
  const confirmedEvents = events.filter((event) => OCCUPYING_BOOKING_STATUSES.includes(event.status));
  const listEvents = events.filter((event) => (listFilter === "waiting" ? isEventAwaitingReply(event) : listFilter === "confirmed" ? OCCUPYING_BOOKING_STATUSES.includes(event.status) : true));
  const selectedVenue = venueFilter === "all" ? null : venuesById[venueFilter] ?? null;
  const showVenue = !selectedVenue;

  function openInDemand(event: BookingCalendarEvent) {
    navigate(`/admin/demand?item=${encodeURIComponent(event.bookingRequestId)}`);
  }

  return (
    <AdminPageShell activePath="/admin/bookings">
      <PageMeta title="Bookings | nokta admin" description="Every booking request across every venue, on one calendar." canonicalPath="/admin/bookings" />
      <div className="space-y-6">
        <WorkspacePageHeader
          title="Bookings"
          description="Every booking request across every venue. Open one to answer it in Demand."
          actions={<>
            <div className="w-[150px]"><CitySelector value={city} onChange={(value) => updateParams({ city: value, venue: null })} /></div>
            <Select value={venueFilter} aria-label="Filter by venue" options={venueOptions} onValueChange={(value) => updateParams({ venue: value === "all" ? null : value })} className="h-10 w-[220px]" />
            <Link to="/admin/demand?kind=booking" className={workspaceSecondaryActionClass}>Open Demand</Link>
          </>}
        />

        {error || venuesError ? <ErrorState message={error ?? venuesError ?? "Could not load bookings."} /> : null}

        {isLoading || venuesLoading ? <LoadingState message="Loading bookings..." /> : (
          <div className="flex min-w-0 flex-col gap-[13px]">
            <VenueBookingToolbar
              view={view}
              heading={view === "list" ? (isPast ? "Past 30 days" : "Next 30 days") : formatCalendarHeading({ view, anchorDate })}
              subheading={view === "list" ? `${range.dateFrom} – ${range.dateTo}` : `${confirmedEvents.length} confirmed · ${waitingEvents.length} waiting`}
              onChangeView={(nextView) => updateParams({ view: nextView })}
              onStep={(amount) => updateParams({ date: toDateInputValue(addCalendarPeriod({ view, anchorDate, amount })) })}
            />

            {view === "list" ? (
              <VenueBookingListView
                events={listEvents}
                closures={[]}
                filter={listFilter}
                counts={{ waiting: waitingEvents.length, confirmed: confirmedEvents.length, all: events.length }}
                isPast={isPast}
                confirmingId={null}
                showVenue={showVenue}
                onChangeFilter={(filter) => updateParams({ filter })}
                onTogglePast={() => updateParams({ past: isPast ? null : "1" })}
                onOpen={openInDemand}
              />
            ) : view === "month" ? (
              <VenueBookingMonthGrid
                anchorDate={anchorDate}
                events={events}
                closures={[]}
                showVenue={showVenue}
                onEventClick={openInDemand}
                onOpenDayInWeek={(date) => updateParams({ view: "week", date })}
              />
            ) : (
              <>
                <VenueBookingWeekGrid
                  dateFrom={range.dateFrom}
                  dateTo={range.dateTo}
                  events={events}
                  openingHours={selectedVenue?.openingHours}
                  closures={[]}
                  showVenue={showVenue}
                  onEventClick={openInDemand}
                />
                {!events.length ? (
                  <div className="rounded-2xl border bg-nokta-surface px-4 py-5 text-center border-nokta-border">
                    <p className="text-sm text-nokta-ink-muted">No requests {view === "today" ? "today" : "this week"}.</p>
                    <p className="mt-1 text-[13px] text-nokta-ink-muted/80">
                      <button type="button" className="font-medium text-nokta-accent-dark hover:underline" onClick={() => updateParams({ view: "list", filter: "all", date: null, past: null })}>
                        See the next 30 days
                      </button>
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}

function readView(value: string | null): BookingCalendarView | null {
  return value && (VIEWS as string[]).includes(value) ? (value as BookingCalendarView) : null;
}

function readDate(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
