import { Suspense, createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Outlet, useParams } from "react-router-dom";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { OwnerVenueTabShell } from "@/components/owner/OwnerVenueTabShell";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { useAuth } from "@/context/AuthContext";
import { getOwnerVenueSubscription } from "@/services/ownerSubscriptionService";
import { getMyClaimedVenue } from "@/services/ownerVenueService";
import type { VenueSubscription } from "@/types/subscriptions";
import type { Venue } from "@/types/venue";

interface OwnerVenueContextValue {
  venue: Venue;
  setVenue: Dispatch<SetStateAction<Venue | null>>;
  subscription: VenueSubscription | null;
  /** A nokta admin viewing a venue they don't own: plan gates are lifted so nothing is hidden from them. */
  isAdminView: boolean;
}

interface TabHeaderSlots {
  title: HTMLHeadingElement | null;
  actions: HTMLDivElement | null;
  guardRef: RefObject<(() => boolean) | null>;
}

const OwnerVenueContext = createContext<OwnerVenueContextValue | null>(null);
const TabHeaderSlotsContext = createContext<TabHeaderSlots | null>(null);

/**
 * Layout route for `/owner/venues/:venueId/*` tabs. Loads the venue and its
 * subscription once and keeps the sidebar, venue header and tab bar mounted,
 * so switching tabs only swaps the content below the tab bar.
 */
export function OwnerVenueRouteLayout() {
  const { user } = useAuth();
  const userId = user?.id;
  const { venueId = "" } = useParams();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [subscription, setSubscription] = useState<VenueSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLHeadingElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const guardRef = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    if (!userId || !venueId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    Promise.all([
      getMyClaimedVenue({ userId, venueId }),
      getOwnerVenueSubscription({ userId, venueId }).catch(() => null),
    ])
      .then(([nextVenue, nextSubscription]) => {
        if (!nextVenue) throw new Error("We could not find that venue.");
        if (cancelled) return;
        setVenue(nextVenue);
        setSubscription(nextSubscription);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : "Could not load that venue.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, venueId]);

  const isAdminView = Boolean(venue && userId && venue.claimedBy !== userId);

  return (
    <OwnerLayout fullWidth>
      {isLoading || error || !venue ? (
        <div className="mx-auto w-full max-w-[1504px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {isLoading ? <LoadingState message="Loading venue..." /> : <ErrorState message={error ?? "Could not load that venue."} />}
        </div>
      ) : (
        <OwnerVenueContext.Provider value={{ venue, setVenue, subscription, isAdminView }}>
          <TabHeaderSlotsContext.Provider value={{ title: titleSlot, actions: actionsSlot, guardRef }}>
            <OwnerVenueTabShell
              venue={venue}
              plan={subscription?.plan ?? "free"}
              titleSlotRef={setTitleSlot}
              actionsSlotRef={setActionsSlot}
              canNavigate={() => guardRef.current?.() ?? true}
              isAdminView={isAdminView}
            >
              <Suspense fallback={<LoadingState message="Loading..." />}>
                <Outlet />
              </Suspense>
            </OwnerVenueTabShell>
          </TabHeaderSlotsContext.Provider>
        </OwnerVenueContext.Provider>
      )}
    </OwnerLayout>
  );
}

/** The venue loaded by `OwnerVenueRouteLayout`. Only valid inside its tabs. */
export function useOwnerVenue() {
  const value = useContext(OwnerVenueContext);
  if (!value) throw new Error("useOwnerVenue must be used inside OwnerVenueRouteLayout.");
  return value;
}

/**
 * Lets the active tab fill the shell's title and actions, and veto leaving
 * the tab (e.g. unsaved edits) through `canNavigate`.
 */
export function OwnerVenueTabHeader({ title, actions, canNavigate }: { title: ReactNode; actions?: ReactNode; canNavigate?: () => boolean }) {
  const slots = useContext(TabHeaderSlotsContext);
  if (!slots) throw new Error("OwnerVenueTabHeader must be used inside OwnerVenueRouteLayout.");
  const { guardRef } = slots;

  useEffect(() => {
    guardRef.current = canNavigate ?? null;
    return () => {
      guardRef.current = null;
    };
  }, [guardRef, canNavigate]);

  return (
    <>
      {slots.title ? createPortal(title, slots.title) : null}
      {slots.actions && actions ? createPortal(actions, slots.actions) : null}
    </>
  );
}
