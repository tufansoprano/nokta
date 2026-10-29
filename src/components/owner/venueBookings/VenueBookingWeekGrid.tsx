import { cn } from "@/lib/utils";
import {
  CALENDAR_BODY_HEIGHT_PX,
  CALENDAR_HOURS,
  formatDurationMinutes,
  getClosedBandGeometry,
  getClosureForDate,
  getEventGeometry,
  HOUR_HEIGHT_PX,
  isEventAwaitingReply,
} from "@/lib/bookingCalendarGeometry";
import { getDatesBetween } from "@/lib/bookingCalendarDates";
import { VenueBookingLegend } from "./VenueBookingToolbar";
import type { VenueBookingBlackoutDate } from "@/types/bookingAvailability";
import type { BookingCalendarEvent } from "@/types/bookingCalendar";
import type { OpeningHours } from "@/types/venue";

export function VenueBookingWeekGrid({
  dateFrom,
  dateTo,
  events,
  openingHours,
  closures,
  durationMinutes = 120,
  showVenue = false,
  onEventClick,
}: {
  dateFrom: string;
  dateTo: string;
  events: BookingCalendarEvent[];
  /** Omit when the grid spans several venues: there are no single opening hours to shade. */
  openingHours?: OpeningHours[];
  closures: VenueBookingBlackoutDate[];
  durationMinutes?: number;
  /** Name the venue on each block, for calendars that span several venues. */
  showVenue?: boolean;
  onEventClick: (event: BookingCalendarEvent) => void;
}) {
  const dates = getDatesBetween(dateFrom, dateTo);
  const todayValue = new Date().toISOString().slice(0, 10);
  const columnTemplate = `52px repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl border bg-nokta-surface border-nokta-border">
      <div className="overflow-x-auto">
        <div className={dates.length > 1 ? "min-w-[680px]" : ""}>
          <div className="grid border-b bg-nokta-hover border-nokta-border" style={{ gridTemplateColumns: columnTemplate }}>
            <span />
            {dates.map((date) => {
              const day = new Date(`${date}T00:00:00`);
              return (
                <span key={date} className="py-[9px] text-center text-[11.5px] text-nokta-ink-muted">
                  {day.toLocaleDateString("en-GB", { weekday: "short" })}{" "}
                  <span className={cn("font-bold text-nokta-ink", date === todayValue && "rounded-full bg-nokta-accent-solid px-1.5 text-white")}>
                    {day.getDate()}
                  </span>
                </span>
              );
            })}
          </div>

          <div className="grid" style={{ gridTemplateColumns: columnTemplate }}>
            <div>
              {CALENDAR_HOURS.map((hour) => (
                <div key={hour} className="px-[7px] pt-1 text-right text-[10.5px] text-nokta-ink-muted" style={{ height: HOUR_HEIGHT_PX }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {dates.map((date) => (
              <DayColumn
                key={date}
                date={date}
                events={events.filter((event) => event.date === date)}
                openingHours={openingHours}
                closure={getClosureForDate({ closures, date })}
                durationHours={durationMinutes / 60}
                showVenue={showVenue}
                onEventClick={onEventClick}
              />
            ))}
          </div>
        </div>
      </div>

      <VenueBookingLegend
        showOpeningHours={Boolean(openingHours)}
        pendingLabel={showVenue ? "Pending reply" : undefined}
        note={showVenue ? `Blocks show a ${formatDurationMinutes(durationMinutes)} default` : `Blocks show your ${formatDurationMinutes(durationMinutes)} default`}
      />
    </div>
  );
}

function DayColumn({
  date,
  events,
  openingHours,
  closure,
  durationHours,
  showVenue,
  onEventClick,
}: {
  date: string;
  events: BookingCalendarEvent[];
  openingHours?: OpeningHours[];
  closure: VenueBookingBlackoutDate | null;
  durationHours: number;
  showVenue: boolean;
  onEventClick: (event: BookingCalendarEvent) => void;
}) {
  const closedBand = openingHours ? getClosedBandGeometry({ openingHours, date }) : null;

  return (
    <div
      className="relative border-l border-nokta-border"
      style={{
        height: CALENDAR_BODY_HEIGHT_PX,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_HEIGHT_PX - 1}px, var(--color-nokta-divider) ${HOUR_HEIGHT_PX - 1}px ${HOUR_HEIGHT_PX}px)`,
      }}
    >
      {closure ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(45deg,var(--color-nokta-track)_0_6px,var(--color-nokta-hover)_6px_12px)] text-center text-[11px] font-semibold leading-tight text-nokta-ink-muted">
          Closed
          <br />
          {closure.reason ?? "all day"}
        </div>
      ) : (
        <>
          {closedBand ? <div aria-hidden="true" className="absolute inset-x-0 bg-nokta-track" style={{ top: closedBand.top, height: closedBand.height }} /> : null}
          {events.map((event) => {
            const geometry = getEventGeometry({ time: event.time, durationHours });
            if (!geometry) return null;
            const pending = isEventAwaitingReply(event);
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onEventClick(event)}
                style={{ top: geometry.top + 2, height: geometry.height - 4 }}
                className={cn(
                  "absolute left-[3px] right-[3px] overflow-hidden rounded-lg border border-l-[3px] px-[7px] py-[6px] text-left transition-shadow hover:shadow-sm border-nokta-border",
                  pending
                    ? "border-dashed border-nokta-warn-line border-l-nokta-warn-line bg-nokta-warn-tint"
                    : "border-nokta-ok-line border-l-nokta-ok-line bg-nokta-ok-tint",
                )}
              >
                <span className="block text-[11px] font-semibold text-nokta-ink">{event.time.slice(0, 5)} · {event.partySize}</span>
                {showVenue ? <span className="block truncate text-[11px] font-medium text-nokta-ink">{event.venueName}</span> : null}
                <span className="block truncate text-[11px] text-nokta-ink-muted">{event.customerName} · {pending ? "pending" : "confirmed"}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
