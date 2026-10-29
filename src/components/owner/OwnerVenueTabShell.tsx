import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { WorkspaceBackLink } from "@/components/workspace/WorkspacePageHeader";
import { cn } from "@/lib/utils";
import type { VenuePlan } from "@/types/subscriptions";
import type { Venue } from "@/types/venue";

const VENUE_TABS = [
  { label: "Profile", path: "profile" },
  { label: "Bookings", path: "bookings" },
  { label: "Menu & pricing", path: "menu" },
  { label: "Photos", path: "photos" },
  { label: "Performance", path: "performance" },
] as const;

/**
 * Matches the default OwnerLayout content box (1440px + its lg:px-8 gutters)
 * so venue pages line up with the rest of the owner area.
 */
const CONTENT_WIDTH = "mx-auto w-full max-w-[1504px] px-4 sm:px-6 lg:px-8";

/**
 * Venue header + tab bar. The white band spans the full page width; its
 * contents stay centred. Rendered once by `OwnerVenueRouteLayout`, so it
 * stays mounted across tab switches; the active tab fills the title and
 * actions slots through `OwnerVenueTabHeader`.
 */
export function OwnerVenueTabShell({
  venue,
  plan,
  titleSlotRef,
  actionsSlotRef,
  children,
  canNavigate,
  isAdminView = false,
}: {
  venue: Venue;
  plan: VenuePlan;
  /** A nokta admin is looking at a venue they don't own. */
  isAdminView?: boolean;
  titleSlotRef: (node: HTMLHeadingElement | null) => void;
  actionsSlotRef: (node: HTMLDivElement | null) => void;
  children: ReactNode;
  canNavigate: () => boolean;
}) {
  return (
    <div>
      {isAdminView ? (
        <div role="note" className="border-b border-nokta-warn-line bg-nokta-warn-tint">
          <div className={cn(CONTENT_WIDTH, "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 text-[13px]")}>
            <p className="text-nokta-ink">
              <span className="font-semibold">Admin view.</span>{" "}
              {venue.isClaimed
                ? `You're acting as ${venue.name}. Anything you answer or change here reaches customers as if the owner did it.`
                : `${venue.name} is unclaimed. Answers you send here reach customers as if from the venue.`}
            </p>
            <div className="flex gap-3 font-medium">
              <Link to={`/admin/venues/${venue.id}/edit`} className="text-nokta-accent-dark hover:underline">Edit venue</Link>
              <Link to={`/admin/bookings?venue=${venue.id}`} className="text-nokta-accent-dark hover:underline">All bookings</Link>
            </div>
          </div>
        </div>
      ) : null}
      <header className="border-b border-nokta-border bg-nokta-surface">
        <div className={cn(CONTENT_WIDTH, "pt-6 sm:pt-8")}>
          {isAdminView ? <WorkspaceBackLink to="/admin/venues" label="Admin venues" /> : <WorkspaceBackLink to="/owner/venues" label="My venues" />}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 ref={titleSlotRef} className="min-h-[1lh] text-balance font-brand text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] text-nokta-ink sm:text-[2.125rem]" />
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-nokta-ink-muted">
                <span>{venue.name}</span>
                <span aria-hidden="true" className="opacity-45">·</span>
                <span>{venue.area}, {venue.city}</span>
                <span aria-hidden="true" className="opacity-45">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("size-1.5 rounded-full", venue.isClaimed ? "bg-nokta-ok-solid" : "bg-nokta-warn-solid")} />
                  {venue.isClaimed ? "Claim confirmed" : isAdminView ? "Unclaimed" : "Claim pending"}
                </span>
                <span className="rounded-full bg-nokta-chip-tint px-2 py-0.5 text-xs font-semibold capitalize text-nokta-accent-dark">{plan} plan</span>
              </div>
            </div>
            <div ref={actionsSlotRef} className="flex flex-wrap gap-2 empty:hidden" />
          </div>
          <nav aria-label={`${venue.name} management`} className="-mx-1 mt-6 flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-none">
            {VENUE_TABS.map((tab) => (
              <NavLink
                key={tab.path}
                to={`/owner/venues/${venue.slug}/${tab.path}`}
                onClick={(event) => {
                  if (!canNavigate()) event.preventDefault();
                }}
                className={({ isActive }) => cn(
                  "relative shrink-0 rounded-t-md px-3 pb-3 pt-1 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-nokta-accent after:transition-opacity",
                  isActive ? "font-semibold text-nokta-ink after:opacity-100" : "text-nokta-ink-muted after:opacity-0 hover:text-nokta-ink",
                )}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className={cn(CONTENT_WIDTH, "py-6 sm:py-8")}>{children}</div>
    </div>
  );
}
