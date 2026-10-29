import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingCalendarView } from "@/types/bookingCalendar";

const VIEWS: { value: BookingCalendarView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "list", label: "List" },
];

export function VenueBookingToolbar({
  view,
  heading,
  subheading,
  onChangeView,
  onStep,
}: {
  view: BookingCalendarView;
  heading: string;
  subheading?: string;
  onChangeView: (view: BookingCalendarView) => void;
  onStep: (amount: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label="Previous period"
          className="flex h-8 w-[30px] items-center justify-center rounded-lg border bg-nokta-surface text-nokta-ink-muted transition-colors hover:text-nokta-ink border-nokta-border"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-nokta-ink">{heading}</span>
        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label="Next period"
          className="flex h-8 w-[30px] items-center justify-center rounded-lg border bg-nokta-surface text-nokta-ink-muted transition-colors hover:text-nokta-ink border-nokta-border"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {subheading ? <span className="ml-1.5 text-xs text-nokta-ink-muted">{subheading}</span> : null}
      </div>

      <div className="flex gap-1 rounded-lg bg-nokta-track p-[3px]" role="tablist" aria-label="Calendar view">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => onChangeView(option.value)}
            className={cn(
              "rounded-md px-[11px] py-[5px] text-[13px] text-nokta-ink-muted transition-colors",
              view === option.value && "bg-nokta-surface font-semibold text-nokta-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VenueBookingLegend({ showOpeningHours = true, pendingLabel = "Pending your reply", note }: { showOpeningHours?: boolean; pendingLabel?: string; note: string }) {
  return (
    <div className="flex flex-wrap items-center gap-[14px] border-t bg-nokta-hover px-[14px] py-[11px] text-xs text-nokta-ink-muted border-nokta-border">
      <LegendSwatch className="border-nokta-ok-line bg-nokta-ok-tint" label="Confirmed" />
      <LegendSwatch className="border-dashed border-nokta-warn-line bg-nokta-warn-tint" label={pendingLabel} />
      {showOpeningHours ? <LegendSwatch className="border-transparent bg-nokta-track" label="Outside opening hours" /> : null}
      <LegendSwatch className="border-transparent bg-[repeating-linear-gradient(45deg,var(--color-nokta-track)_0_6px,var(--color-nokta-hover)_6px_12px)]" label="Closure" />
      <span className="ml-auto">{note}</span>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("h-[11px] w-[11px] rounded-[3px] border border-nokta-border", className)} />
      {label}
    </span>
  );
}
