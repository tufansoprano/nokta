import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BarChart3, Bell, BookOpenCheck, Building2, ChevronRight, CircleCheck, CreditCard, Heart, Inbox, KeyRound, LayoutDashboard, LogOut, PenLine, ShieldCheck } from "lucide-react";
import { AuthError } from "@/components/auth/AuthError";
import { MyClaimRequests } from "@/components/claims/MyClaimRequests";
import { MyVenueEnquiries } from "@/components/enquiries/MyVenueEnquiries";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageMeta } from "@/components/seo/PageMeta";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { useVenuePreferences } from "@/context/VenuePreferencesContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useVenues } from "@/hooks/useVenues";
import { cn } from "@/lib/utils";
import { getMyCustomerBookings } from "@/services/customerBookingsService";
import { getMyUnreadNotificationCount } from "@/services/notificationService";
import { getMyVenueClaimRequests } from "@/services/venueClaimService";
import { getMyVenueEnquiries } from "@/services/venueEnquiryService";
import { getMyClaimedVenues } from "@/services/ownerVenueService";
import type { BookingRequest } from "@/types/bookingRequests";
import type { Venue } from "@/types/venue";
import type { VenueClaimRequest } from "@/types/venueClaims";
import type { VenueEnquiry } from "@/types/venueEnquiries";
import { reportError } from "@/lib/errorReporting";

type IconType = ComponentType<{ className?: string }>;

/** Loads one list for the signed-in user; errors stay local to that section. */
function useUserList<T>(userId: string | undefined, load: (userId: string) => Promise<T[]>, errorMessage: string) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    load(userId)
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : errorMessage);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is a module-level service call; re-run only when the user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { items, isLoading, error };
}

const loadBookings = (userId: string) => getMyCustomerBookings({ userId });

export function AccountPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { favouriteVenueIds, isLoading: preferencesLoading } = useVenuePreferences();
  const { venues } = useVenues();
  const userId = user?.id;
  const claims = useUserList<VenueClaimRequest>(userId, getMyVenueClaimRequests, "Could not load venue claim requests.");
  const enquiries = useUserList<VenueEnquiry>(userId, getMyVenueEnquiries, "Could not load enquiries.");
  const bookings = useUserList<BookingRequest>(userId, loadBookings, "Could not load bookings.");
  const claimedVenues = useUserList<Venue>(userId, getMyClaimedVenues, "Could not load your venues.");
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const passwordUpdated = searchParams.get("passwordUpdated") === "1";

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMyUnreadNotificationCount({ userId })
      .then((count) => {
        if (!cancelled) setUnreadCount(count);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const venuesById = useMemo<Record<string, Venue | undefined>>(
    () => Object.fromEntries(venues.map((venue) => [venue.id, venue])),
    [venues],
  );

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);

    try {
      await signOut();
      navigate("/");
    } catch (caughtError) {
      reportError(caughtError, { source: "sign_out" });
      setError("Couldn't sign you out. Check your connection and try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  const awaitingReply = bookings.items.filter((booking) => booking.status === "alternative_proposed").length;
  const upcoming = bookings.items.filter((booking) => booking.status === "pending" || booking.status === "accepted" || booking.status === "customer_accepted_alternative").length;
  const bookingsMeta = bookings.isLoading
    ? null
    : bookings.error
      ? "Couldn't load right now"
      : awaitingReply
        ? `${awaitingReply} new time${awaitingReply === 1 ? "" : "s"} to answer`
        : upcoming
          ? `${upcoming} open request${upcoming === 1 ? "" : "s"}`
          : bookings.items.length
            ? "No open requests"
            : "No requests yet";
  const savedCount = favouriteVenueIds.length;
  const hasVenues = claimedVenues.items.length > 0;

  return (
    <main>
      <PageMeta title="Account | nokta" description="Your nokta bookings, saved venues, notifications and owner tools." canonicalPath="/account" />
      <PageContainer className="py-8 sm:py-14">
        <div className="mx-auto max-w-5xl">
          <header className="flex items-center gap-4">
            <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-nokta-solid-ink font-brand text-lg font-bold text-clay-50 sm:size-16 sm:text-xl">
              {getInitials(user?.email)}
            </span>
            <div className="min-w-0">
              <h1 className="font-brand text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-nokta-ink sm:text-[2.5rem]">Your account</h1>
              <p className="mt-1 truncate text-base text-nokta-ink-muted">{user?.email}</p>
            </div>
          </header>

          {passwordUpdated ? (
            <p role="status" className="mt-6 flex items-start gap-3 rounded-xl bg-forest-50 px-4 py-3 text-sm text-nokta-ink">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-forest-400" />
              Password updated. Use the new one next time you sign in.
            </p>
          ) : null}

          <nav aria-label="Your nokta" className="mt-8 overflow-hidden rounded-2xl border border-nokta-border bg-nokta-surface sm:mt-10">
            <ul className="divide-y divide-nokta-divider-row sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <HubLink
                to="/account/bookings"
                icon={BookOpenCheck}
                label="Bookings"
                meta={bookingsMeta}
                highlight={awaitingReply > 0}
              />
              <HubLink
                to="/saved"
                icon={Heart}
                label="Saved venues"
                meta={preferencesLoading ? null : savedCount ? `${savedCount} saved` : "Nothing saved yet"}
              />
              <HubLink
                to="/account/notifications"
                icon={Bell}
                label="Notifications"
                meta={unreadCount === null ? null : unreadCount ? `${unreadCount} unread` : "All caught up"}
                highlight={Boolean(unreadCount)}
              />
            </ul>
          </nav>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
            <div className="space-y-10">
              <Section title="Enquiries" description="Questions and group requests you've sent to venues.">
                {enquiries.error ? (
                  <AuthError message={enquiries.error} />
                ) : enquiries.isLoading ? (
                  <ListSkeleton />
                ) : (
                  <MyVenueEnquiries enquiries={enquiries.items} venuesById={venuesById} />
                )}
              </Section>

              {claims.isLoading || claims.error || claims.items.length ? (
                <Section title="Venue claims" description="Requests to manage a venue's listing.">
                  {claims.error ? (
                    <AuthError message={claims.error} />
                  ) : claims.isLoading ? (
                    <ListSkeleton />
                  ) : (
                    <MyClaimRequests claims={claims.items} venuesById={venuesById} />
                  )}
                </Section>
              ) : null}
            </div>

            <aside className="space-y-10">
              {hasVenues ? (
                <Section title="Your venues" description={`You manage ${claimedVenues.items.length} venue${claimedVenues.items.length === 1 ? "" : "s"} on nokta.`}>
                  <ul className="-mx-3">
                    <SideLink to="/owner" icon={LayoutDashboard} label="Owner dashboard" />
                    <SideLink to="/owner/bookings" icon={BookOpenCheck} label="Venue bookings" />
                    <SideLink to="/owner/inbox" icon={Inbox} label="Enquiry inbox" />
                    <SideLink to="/owner/billing" icon={CreditCard} label="Plan & billing" />
                  </ul>
                </Section>
              ) : claimedVenues.isLoading ? null : (
                <Section title="Run a venue?" description="Claim your listing to update details, answer enquiries and manage bookings.">
                  <Link to="/for-venues" className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-nokta-ink underline decoration-nokta-accent/50 decoration-2 underline-offset-4 hover:decoration-nokta-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    nokta for venues
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                </Section>
              )}

              {isAdmin ? (
                <Section title="Admin" icon={ShieldCheck}>
                  <ul className="-mx-3">
                    <SideLink to="/admin/venues" icon={Building2} label="Manage venues" />
                    <SideLink to="/admin/data-quality" icon={BarChart3} label="Data quality" />
                    <SideLink to="/admin/reviews" icon={PenLine} label="Reviews" />
                    <SideLink to="/admin/subscriptions" icon={CreditCard} label="Subscriptions" />
                  </ul>
                </Section>
              ) : null}

              <Section title="Sign-in & security">
                <ul className="-mx-3">
                  <SideLink to="/reset-password" icon={KeyRound} label="Change password" />
                  <li>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium text-nokta-ink transition-colors hover:bg-nokta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <LogOut aria-hidden="true" className="size-4 text-nokta-ink-muted" />
                      {isSigningOut ? "Signing out…" : "Sign out"}
                    </button>
                  </li>
                </ul>
                {error ? <div className="mt-3"><AuthError message={error} /></div> : null}
              </Section>
            </aside>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}

function HubLink({ to, icon: Icon, label, meta, highlight = false }: { to: string; icon: IconType; label: string; meta: string | null; highlight?: boolean }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex min-h-[4.5rem] items-center gap-4 px-5 py-4 transition-colors hover:bg-nokta-hover-row focus-visible:bg-nokta-hover-row focus-visible:outline-none sm:min-h-0 sm:flex-col sm:items-start sm:gap-6 sm:p-6"
      >
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", highlight ? "bg-nokta-accent-solid text-white" : "bg-nokta-chip-tint text-nokta-accent-dark")}>
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-nokta-ink">{label}</span>
          {meta === null ? (
            <Skeleton className="mt-1.5 h-4 w-24" />
          ) : (
            <span className={cn("mt-0.5 block text-sm", highlight ? "font-semibold text-nokta-accent-dark" : "text-nokta-ink-muted")}>{meta}</span>
          )}
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-nokta-ink-muted transition-transform group-hover:translate-x-0.5 sm:hidden" />
      </Link>
    </li>
  );
}

function Section({ title, description, icon: Icon, children }: { title: string; description?: string; icon?: IconType; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-brand text-xl font-bold tracking-[-0.01em] text-nokta-ink">
        {Icon ? <Icon className="size-[18px] text-nokta-accent" /> : null}
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm leading-relaxed text-nokta-ink-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SideLink({ to, icon: Icon, label }: { to: string; icon: IconType; label: string }) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-nokta-ink transition-colors hover:bg-nokta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon aria-hidden="true" className="size-4 text-nokta-ink-muted" />
        {label}
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

function getInitials(email?: string) {
  const name = email?.split("@")[0] ?? "";
  const initials = name
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "N";
}
