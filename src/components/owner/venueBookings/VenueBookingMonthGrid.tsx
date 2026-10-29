import { cn } from "@/lib/utils";
import { getEndOfMonth, getEndOfWeek, getStartOfMonth, getStartOfWeek, getDatesBetween, toDateInputValue } from "@/lib/bookingCalendarDates";
import { getClosureForDate, isEventAwaitingReply } from "@/lib/bookingCalendarGeometry";
import { VenueBookingLegend } from "./VenueBookingToolbar";
import type { VenueBookingBlackoutDate } from "@/types/bookingAvailability";
import type { BookingCalendarEvent } from "@/types/bookingCalendar";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS_PER_DAY = 2;

export function VenueBookingMonthGrid({
  anchorDate,
  events,
  closures,
  showVenue = false,
  onEventClick,
  onOpenDayInWeek,
}: {
  anchorDate: Date;
  events: BookingCalendarEvent[];
  closures: VenueBookingBlackoutDate[];
  /** Name the venue on each chip, for calendars that span several venues. */
  showVenue?: boolean;
  onEventClick: (event: BookingCalendarEvent) => void;
  onOpenDayInWeek: (date: string) => void;
}) {
  // Pad to whole weeks so the grid is always 7 columns of complete rows.
  const gridStart = getStartOfWeek(getStartOfMonth(anchorDate));
  const gridEnd = getEndOfWeek(getEndOfMonth(anchorDate));
  const dates = getDatesBetween(toDateInputValue(gridStart), toDateInputValue(gridEnd));
  const todayValue = toDateInputValue(new Date());
  const month = anchorDate.getMonth();

  return (
    <div className="overflow-hidden rounded-xl border bg-nokta-surface border-nokta-border">
      <div className="grid grid-cols-7 border-b bg-nokta-hover border-nokta-border">
        {DAY_NAMES.map((day) => (
          <span key={day} className="py-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.5px] text-nokta-ink-muted">{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dates.map((date) => {
          const dayEvents = events.filter((event) => event.date === date);
          const closure = getClosureForDate({ closures, date });
          const cellDate = new Date(`${date}T00:00:00`);
          const isOutsideMonth = cellDate.getMonth() !== month;
          const isToday = date === todayValue;
          const visible = dayEvents.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={date}
              className={cn(
                "min-h-24 border-b border-r border-nokta-divider px-[7px] pb-2 pt-[6px]",
                isOutsideMonth && "bg-nokta-hover",
                isToday && "bg-nokta-surface-alt shadow-[inset_0_2px_0_var(--color-nokta-accent)]",
                closure && "bg-[repeating-linear-gradient(45deg,var(--color-nokta-track)_0_6px,var(--color-nokta-hover)_6px_12px)]",
              )}
            >
              {isToday ? (
                <div className="flex items-center gap-1.5">
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-nokta-accent-solid px-1 text-[11px] font-semibold text-white">{cellDate.getDate()}</span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.4px] text-nokta-accent-dark">Today</span>
                </div>
              ) : (
                <div className={cn("text-[11.5px] font-semibold text-nokta-ink", isOutsideMonth && "font-normal text-nokta-ink-muted", closure && "text-nokta-ink-muted")}>
                  {cellDate.getDate()}
                </div>
              )}

              {closure ? (
                <p className="mt-1 text-[10.5px] font-semibold leading-tight text-nokta-ink-muted">Closed<br />{closure.reason ?? "all day"}</p>
              ) : (
                <div className="mt-[5px] flex flex-col gap-[3px]">
                  {visible.map((event) => {
                    const pending = isEventAwaitingReply(event);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onEventClick(event)}
                        className={cn(
                          "flex items-center gap-[5px] overflow-hidden rounded-lg border-l-2 px-[5px] py-[3px] text-left text-[11px]",
                          pending ? "border-l-nokta-warn-line bg-nokta-warn-tint text-nokta-warn-ink" : "border-l-nokta-ok-line bg-nokta-ok-tint text-nokta-ok-ink",
                        )}
                      >
                        <b className="font-semibold">{event.time.slice(0, 5)}</b>
                        <span className="truncate">· {event.partySize} {showVenue ? event.venueName : event.customerName}</span>
                      </button>
                    );
                  })}
                  {overflow > 0 ? (
                    <button type="button" onClick={() => onOpenDayInWeek(date)} className="text-left text-[10.5px] font-medium text-nokta-accent-dark hover:underline">
                      +{overflow} more
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <VenueBookingLegend showOpeningHours={false} pendingLabel={showVenue ? "Pending reply" : undefined} note="Two per day, then +n more opens that day in Week" />
    </div>
  );
}
