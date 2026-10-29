import { useEffect, useState } from "react";
import { AnalyticsUpgradePrompt } from "@/components/owner/analytics/AnalyticsUpgradePrompt";
import { OwnerAnalyticsDateRangeFilter } from "@/components/owner/analytics/OwnerAnalyticsDateRangeFilter";
import { OwnerAnalyticsEmptyState } from "@/components/owner/analytics/OwnerAnalyticsEmptyState";
import { OwnerAnalyticsSummaryCards } from "@/components/owner/analytics/OwnerAnalyticsSummaryCards";
import { OwnerAnalyticsTrendChart } from "@/components/owner/analytics/OwnerAnalyticsTrendChart";
import { OwnerFeaturedPlacementPerformance } from "@/components/owner/analytics/OwnerFeaturedPlacementPerformance";
import { OwnerMonthlyValueSummary } from "@/components/owner/analytics/OwnerMonthlyValueSummary";
import { OwnerPromotedOfferPerformance } from "@/components/owner/analytics/OwnerPromotedOfferPerformance";
import { OwnerValueInsightsPanel } from "@/components/owner/analytics/OwnerValueInsightsPanel";
import { OwnerVenueFunnel } from "@/components/owner/analytics/OwnerVenueFunnel";
import { ProfileCompletenessCard } from "@/components/owner/analytics/ProfileCompletenessCard";
import { OwnerVenueTabHeader, useOwnerVenue } from "@/components/owner/OwnerVenueRouteLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { subscriptionHasPlanAccess } from "@/lib/planFeatureAccess";
import { getOwnerVenueAnalyticsSummary, type OwnerAnalyticsDateRange, type OwnerVenueAnalyticsSummary } from "@/services/ownerVenueAnalyticsService";

export function OwnerVenueAnalyticsPage() {
  const { user } = useAuth();
  const { venue, subscription, isAdminView } = useOwnerVenue();
  const [dateRange, setDateRange] = useState<OwnerAnalyticsDateRange>("last_30_days");
  const [summary, setSummary] = useState<OwnerVenueAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getOwnerVenueAnalyticsSummary({ userId: user.id, venueId: venue.id, dateRange })
      .then((nextSummary) => {
        if (cancelled) return;
        setSummary(nextSummary);
        trackEvent("owner_venue_analytics_viewed", { venueId: venue.id, dateRange });
      })
      .catch((caughtError) => {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : "Could not load venue analytics.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateRange, user, venue.id]);

  const canSeeTrend = isAdminView || (subscriptionHasPlanAccess(subscription, "basic_analytics") && (subscription?.plan ?? "free") !== "free");
  const canSeeFunnel = isAdminView || subscriptionHasPlanAccess(subscription, "improved_analytics");
  const canSeeAdvanced = isAdminView || subscriptionHasPlanAccess(subscription, "advanced_analytics");
  const hasActivity = Boolean(summary?.totalEvents);

  return (
    <>
      <PageMeta title={`${venue.name} performance | nokta`} description="See how Nokta is helping your venue get discovered and receive customer interest." canonicalPath={`/owner/venues/${venue.slug}/performance`} />
      <OwnerVenueTabHeader title="Performance" actions={<OwnerAnalyticsDateRangeFilter value={dateRange} onChange={setDateRange} />} />
      {isLoading ? <LoadingState message="Loading venue analytics..." /> : error || !summary ? <ErrorState title="Could not load analytics" message={error ?? "You do not have access to this venue analytics page."} /> : (
        <div className="space-y-5">
          <p className="max-w-2xl text-sm leading-6 text-nokta-ink-muted">See how Nokta is helping your venue get discovered, trusted and booked.</p>

          <OwnerAnalyticsSummaryCards summary={summary} />
          {!hasActivity ? <OwnerAnalyticsEmptyState venue={venue} /> : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              {canSeeTrend ? (
                <OwnerAnalyticsTrendChart daily={summary.daily} />
              ) : (
                <AnalyticsUpgradePrompt title="Unlock trend insights" description="See how customer interest changes over time with daily profile views, booking requests and enquiries." />
              )}
              {canSeeFunnel ? (
                <OwnerVenueFunnel summary={summary} />
              ) : (
                <AnalyticsUpgradePrompt title="Unlock conversion insights" description="See how profile views turn into booking clicks and completed booking requests." />
              )}
              {canSeeAdvanced ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <OwnerPromotedOfferPerformance summary={summary} />
                  <OwnerFeaturedPlacementPerformance summary={summary} />
                </div>
              ) : (
                <AnalyticsUpgradePrompt title="Unlock promotion reporting" description="Track promoted offer and featured placement performance when your venue is ready to grow visibility." />
              )}
            </div>
            <aside className="space-y-6">
              <ProfileCompletenessCard venue={venue} subscription={subscription} />
              <OwnerValueInsightsPanel summary={summary} />
              <OwnerMonthlyValueSummary summary={summary} isPro={canSeeAdvanced} />
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
