import { cn } from "@/lib/utils";
import { formatDurationMinutes, getClosureForDate, getWaitingDays, isEventAwaitingReply } from "@/lib/bookingCalendarGeometry";
import type { VenueBookingBlackoutDate } from "@/types/bookingAvailability";
import type { BookingCalendarEvent } from "@/types/bookingCalendar";

export type VenueBookingListFilter = "waiting" | "confirmed" | "all";

export function VenueBookingListView({
  events,
  closures,
  filter,
  counts,
  isPast,
  confirmingId,
  durationMinutes = 120,
  showVenue = false,
  onChangeFilter,
  onTogglePast,
  onConfirm,
  onOpen,
}: {
  events: BookingCalendarEvent[];
  closures: VenueBookingBlackoutDate[];
  filter: VenueBookingListFilter;
  counts: Record<VenueBookingListFilter, number>;
  isPast: boolean;
  confirmingId: string | null;
  durationMinutes?: number;
  /** Name the venue on each row, for lists that span several venues. */
  showVenue?: boolean;
  onChangeFilter: (filter: VenueBookingListFilter) => void;
  onTogglePast: () => void;
  /** Omit to hide the one-click Confirm; pending rows then only offer Reply. */
  onConfirm?: (event: BookingCalendarEvent) => void;
  onOpen: (event: BookingCalendarEvent) => void;
}) {
  const grouped = groupByDate(events);

  return (
    <div className="overflow-hidden rounded-xl border bg-nokta-surface border-nokta-border">
      <div className="flex flex-wrap items-center gap-[7px] p-[14px]">
        <FilterPill label="Waiting" count={counts.waiting} isActive={filter === "waiting"} onClick={() => onChangeFilter("waiting")} />
        <FilterPill label="Confirmed" count={counts.confirmed} isActive={filter === "confirmed"} onClick={() => onChangeFilter("confirmed")} />
        <FilterPill label="All" count={counts.all} isActive={filter === "all"} onClick={() => onChangeFilter("all")} />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <FilterPill label="Past requests" isActive={isPast} onClick={onTogglePast} />
      </div>

      {grouped.length ? (
        grouped.map(([date, dayEvents]) => {
          const closure = getClosureForDate({ closures, date });
          const waiting = dayEvents.filter(isEventAwaitingReply).length;
          return (
            <div key={date}>
              <div className="flex items-center justify-between gap-3 border-y bg-nokta-hover px-4 py-2 border-nokta-border">
                <span className="text-xs font-semibold uppercase tracking-[0.04em] text-nokta-ink">{formatGroupHeading(date)}</span>
                <span className="text-xs text-nokta-ink-muted">
                  {waiting ? `${waiting} waiting · ` : ""}{dayEvents.length - waiting} answered
                </span>
              </div>

              {closure ? (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[repeating-linear-gradient(45deg,var(--color-nokta-track)_0_6px,var(--color-nokta-hover)_6px_12px)] px-4 py-[10px]">
                  <span className="text-[13px] font-semibold text-nokta-ink">Closed · {closure.reason ?? "all day"}</span>
                  <span className="text-xs text-nokta-ink-muted">Requests off · no form on your page</span>
                </div>
              ) : null}

              {dayEvents.map((event) => {
                const pending = isEventAwaitingReply(event);
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "grid grid-cols-[66px_1fr] items-center gap-[14px] border-b px-4 py-[13px] sm:grid-cols-[66px_1fr_auto] border-nokta-border",
                      pending && "bg-nokta-warn-tint",
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold text-nokta-ink">{event.time.slice(0, 5)}</div>
                      <div className="text-xs text-nokta-ink-muted">{formatDurationMinutes(durationMinutes)} slot</div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-nokta-ink">{event.customerName} · {event.partySize} people</span>
                        <StatusPill event={event} />
                      </div>
                      {showVenue ? <p className="mt-0.5 truncate text-[13px] font-medium text-nokta-ink">{event.venueName}</p> : null}
                      {event.occasion ? <p className="mt-0.5 truncate text-[13px] text-nokta-ink-muted">{event.occasion}</p> : null}
                    </div>

                    <div className="col-span-full flex gap-2 sm:col-span-1">
                      {pending ? (
                        <>
                          {onConfirm ? <button
                            type="button"
                            onClick={() => onConfirm(event)}
                            disabled={confirmingId === event.id}
                            className="h-8 rounded-lg bg-nokta-accent-solid px-3 text-[13px] font-medium text-white transition-colors hover:bg-nokta-accent-solid/90 disabled:opacity-60"
                          >
                            {confirmingId === event.id ? "Confirming..." : "Confirm"}
                          </button> : null}
                          <button type="button" onClick={() => onOpen(event)} className="flex h-8 items-center rounded-lg border bg-nokta-surface px-3 text-[13px] font-medium text-nokta-ink transition-colors hover:bg-nokta-hover border-nokta-border">
                            Reply
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => onOpen(event)} className="flex h-8 items-center rounded-lg border bg-nokta-surface px-3 text-[13px] font-medium text-nokta-ink transition-colors hover:bg-nokta-hover border-nokta-border">
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      ) : (
        <div className="p-6 text-center">
          <p className="text-sm text-nokta-ink-muted">
            {filter === "waiting"
              ? isPast
                ? "No requests were waiting in those 30 days."
                : "Nothing waiting in the next 30 days."
              : filter === "confirmed"
                ? "No confirmed bookings in this range."
                : "No requests in this range."}
          </p>
          <p className="mt-1 text-[13px] text-nokta-ink-muted/80">
            {filter === "waiting" ? "New requests land here the moment a customer sends one." : "Try another filter or step to a different period."}
          </p>
          {filter === "waiting" ? (
            <button type="button" onClick={() => onChangeFilter("all")} className="mt-2 text-[13px] font-medium text-nokta-accent-dark hover:underline">See all requests</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StatusPill({ event }: { event: BookingCalendarEvent }) {
  const pending = isEventAwaitingReply(event);
  if (pending) {
    const days = getWaitingDays(event.createdAt);
    return (
      <span className="rounded-full bg-nokta-warn-tint px-2 py-[2px] text-xs font-semibold text-nokta-warn-ink">
        {days >= 1 ? `Waiting ${days}d` : "Waiting"}
      </span>
    );
  }
  if (event.status === "accepted") {
    return <span className="rounded-full bg-nokta-ok-tint px-2 py-[2px] text-xs font-semibold text-nokta-ok-ink">Confirmed</span>;
  }
  return <span className="rounded-full bg-nokta-track px-2 py-[2px] text-xs font-semibold capitalize text-nokta-ink-muted">{event.status.replace(/_/g, " ")}</span>;
}

function FilterPill({ label, count, isActive, onClick }: { label: string; count?: number; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
        isActive ? "bg-nokta-ink font-medium text-nokta-surface" : "border bg-nokta-surface text-nokta-ink-muted hover:text-nokta-ink border-nokta-border",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className={cn("rounded-full px-1.5 text-xs", isActive ? "bg-white/20" : "bg-nokta-track")}>{count}</span>
      ) : null}
    </button>
  );
}

function groupByDate(events: BookingCalendarEvent[]): [string, BookingCalendarEvent[]][] {
  const groups = new Map<string, BookingCalendarEvent[]>();
  for (const event of [...events].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))) {
    groups.set(event.date, [...(groups.get(event.date) ?? []), event]);
  }
  return [...groups.entries()];
}

function formatGroupHeading(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  const today = new Date().toISOString().slice(0, 10);
  const label = value.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return date === today ? `Today · ${label}` : label;
}
