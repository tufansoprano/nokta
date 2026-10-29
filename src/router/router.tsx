import { Suspense, lazy, type ComponentType, type ReactElement } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireAdmin } from "@/components/auth/RequireAdmin";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoadingState } from "@/components/state/PageLoadingState";
import { AppErrorPage } from "@/pages/AppErrorPage";
import { Navigate, createBrowserRouter, useLocation, useParams, useSearchParams, type RouteObject } from "react-router-dom";

const AccountConfirmationPage = lazyPage(() => import("@/pages/AccountConfirmationPage"), "AccountConfirmationPage");
const AccountPage = lazyPage(() => import("@/pages/AccountPage"), "AccountPage");
const MyBookingsPage = lazyPage(() => import("@/pages/account/MyBookingsPage"), "MyBookingsPage");
const NotificationsPage = lazyPage(() => import("@/pages/account/NotificationsPage"), "NotificationsPage");
const AdminInsightsPage = lazyPage(() => import("@/pages/admin/AdminInsightsPage"), "AdminInsightsPage");
const AdminCommercialPage = lazyPage(() => import("@/pages/admin/AdminCommercialPage"), "AdminCommercialPage");
const AdminDemandPage = lazyPage(() => import("@/pages/admin/AdminDemandPage"), "AdminDemandPage");
const AdminBookingsPage = lazyPage(() => import("@/pages/admin/AdminBookingsPage"), "AdminBookingsPage");
const AdminVenuesPage = lazyPage(() => import("@/pages/admin/AdminVenuesPage"), "AdminVenuesPage");
const AdminReviewQueuePage = lazyPage(() => import("@/pages/admin/AdminReviewQueuePage"), "AdminReviewQueuePage");
const VenueFormPage = lazyPage<{ mode: "edit" | "new" }>(() => import("@/pages/admin/VenueFormPage"), "VenueFormPage");
const AppErrorPreviewPage = lazyPage(() => import("@/pages/AppErrorPreviewPage"), "AppErrorPreviewPage");
const ClaimVenuePage = lazyPage(() => import("@/pages/ClaimVenuePage"), "ClaimVenuePage");
const CityPage = lazyPage(() => import("@/pages/CityPage"), "CityPage");
const CustomerBookingStatusPage = lazyPage(() => import("@/pages/CustomerBookingStatusPage"), "CustomerBookingStatusPage");
const ForVenuesPage = lazyPage(() => import("@/pages/ForVenuesPage"), "ForVenuesPage");
const MapHomePage = lazyPage(() => import("@/pages/MapHomePage"), "MapHomePage");
const PlanNightPage = lazyPage(() => import("@/pages/PlanNightPage"), "PlanNightPage");
const NotFoundPage = lazyPage(() => import("@/pages/NotFoundPage"), "NotFoundPage");
const OwnerDashboardPage = lazyPage(() => import("@/pages/owner/OwnerDashboardPage"), "OwnerDashboardPage");
const OwnerAnalyticsPage = lazyPage(() => import("@/pages/owner/OwnerAnalyticsPage"), "OwnerAnalyticsPage");
const OwnerBillingPage = lazyPage(() => import("@/pages/owner/OwnerBillingPage"), "OwnerBillingPage");
const OwnerBillingSuccessPage = lazyPage(() => import("@/pages/owner/OwnerBillingSuccessPage"), "OwnerBillingSuccessPage");
const OwnerBookingsPage = lazyPage(() => import("@/pages/owner/OwnerBookingsPage"), "OwnerBookingsPage");

const OwnerEnquiriesPage = lazyPage(() => import("@/pages/owner/OwnerEnquiriesPage"), "OwnerEnquiriesPage");
const OwnerVenueRouteLayout = lazyPage(() => import("@/components/owner/OwnerVenueRouteLayout"), "OwnerVenueRouteLayout");
const OwnerVenueBookingsPage = lazyPage(() => import("@/pages/owner/OwnerVenueBookingsPage"), "OwnerVenueBookingsPage");
const OwnerVenueBookingRulesPage = lazyPage(() => import("@/pages/owner/OwnerVenueBookingRulesPage"), "OwnerVenueBookingRulesPage");
const OwnerVenueAnalyticsPage = lazyPage(() => import("@/pages/owner/OwnerVenueAnalyticsPage"), "OwnerVenueAnalyticsPage");
const OwnerVenueMediaPage = lazyPage(() => import("@/pages/owner/OwnerVenueMediaPage"), "OwnerVenueMediaPage");
const OwnerVenueMenuPage = lazyPage(() => import("@/pages/owner/OwnerVenueMenuPage"), "OwnerVenueMenuPage");
const OwnerVenueUpdateRequestPage = lazyPage(() => import("@/pages/owner/OwnerVenueUpdateRequestPage"), "OwnerVenueUpdateRequestPage");
const OwnerVenuesPage = lazyPage(() => import("@/pages/owner/OwnerVenuesPage"), "OwnerVenuesPage");
const OwnerPromotionsPage = lazyPage(() => import("@/pages/owner/OwnerPromotionsPage"), "OwnerPromotionsPage");
const OwnerRequestFeaturedPlacementPage = lazyPage(() => import("@/pages/owner/OwnerRequestFeaturedPlacementPage"), "OwnerRequestFeaturedPlacementPage");
const OwnerRequestPromotedOfferPage = lazyPage(() => import("@/pages/owner/OwnerRequestPromotedOfferPage"), "OwnerRequestPromotedOfferPage");
const PrivacyPage = lazyPage(() => import("@/pages/PrivacyPage"), "PrivacyPage");
const PromotedOfferPreviewPage = lazyPage(() => import("@/pages/PromotedOfferPreviewPage"), "PromotedOfferPreviewPage");
const RecommendPage = lazyPage(() => import("@/pages/RecommendPage"), "RecommendPage");
const SharedShortlistPage = lazyPage(() => import("@/pages/SharedShortlistPage"), "SharedShortlistPage");
const RequestBookingPage = lazyPage(() => import("@/pages/RequestBookingPage"), "RequestBookingPage");
const SavedPage = lazyPage(() => import("@/pages/SavedPage"), "SavedPage");
const SignInPage = lazyPage(() => import("@/pages/SignInPage"), "SignInPage");
const SignUpPage = lazyPage(() => import("@/pages/SignUpPage"), "SignUpPage");
const ForgotPasswordPage = lazyPage(() => import("@/pages/ForgotPasswordPage"), "ForgotPasswordPage");
const ResetPasswordPage = lazyPage(() => import("@/pages/ResetPasswordPage"), "ResetPasswordPage");
const SuggestVenuePage = lazyPage(() => import("@/pages/SuggestVenuePage"), "SuggestVenuePage");
const TermsPage = lazyPage(() => import("@/pages/TermsPage"), "TermsPage");
const VenueEnquiryPage = lazyPage(() => import("@/pages/VenueEnquiryPage"), "VenueEnquiryPage");
const VenuePage = lazyPage(() => import("@/pages/VenuePage"), "VenuePage");

function lazyPage<TProps = Record<string, never>>(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async () => {
    const mod = (await loader()) as Record<string, ComponentType<TProps>>;
    return { default: mod[exportName] };
  });
}

function routeElement(element: ReactElement) {
  return <Suspense fallback={<PageLoadingState />}>{element}</Suspense>;
}

export const routes: RouteObject[] = [
  {
    element: routeElement(<AppLayout />),
    errorElement: <AppErrorPage />,
    children: [
      { path: "/", element: routeElement(<MapHomePage />) },
      // The map homepage replaced Discover; keep old links (and their ?city / ?q) working.
      { path: "/discover", element: <DiscoverRedirect /> },
      { path: "/for-venues", element: routeElement(<ForVenuesPage />) },
      { path: "/cities/:citySlug", element: routeElement(<CityPage />) },
      { path: "/recommend", element: routeElement(<RecommendPage />) },
      { path: "/plan", element: routeElement(<PlanNightPage />) },
      { path: "/s/:code", element: routeElement(<SharedShortlistPage />) },
      { path: "/saved", element: routeElement(<SavedPage />) },
      { path: "/suggest", element: routeElement(<SuggestVenuePage />) },
      { path: "/privacy", element: routeElement(<PrivacyPage />) },
      { path: "/terms", element: routeElement(<TermsPage />) },
      {
        path: "/owner/bookings",
        element: routeElement(
          <RequireAuth>
            <OwnerBookingsRoute />
          </RequireAuth>,
        ),
      },
      {
        path: "/account",
        element: routeElement(<AccountRoute />),
      },
      {
        path: "/account/bookings",
        element: routeElement(
          <RequireAuth>
            <MyBookingsPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/account/notifications",
        element: routeElement(
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/analytics",
        element: routeElement(
          <RequireAuth>
            <OwnerAnalyticsPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner",
        element: routeElement(
          <RequireAuth>
            <OwnerDashboardPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/venues",
        element: routeElement(
          <RequireAuth>
            <OwnerVenuesPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/inbox",
        element: routeElement(
          <RequireAuth>
            <OwnerEnquiriesPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/promotions",
        element: routeElement(
          <RequireAuth>
            <OwnerPromotionsPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/venues/:venueId",
        children: [
          { index: true, element: <RequireAuth><VenueRouteRedirect destination="profile" /></RequireAuth> },
          {
            // Pathless layout: the sidebar, venue header and tab bar stay mounted
            // across tabs, and lazy tab chunks suspend inside the content area.
            element: routeElement(
              <RequireAuth>
                <OwnerVenueRouteLayout />
              </RequireAuth>,
            ),
            children: [
              { path: "profile", element: <OwnerVenueUpdateRequestPage /> },
              { path: "bookings", element: <OwnerVenueBookingsPage /> },
              { path: "bookings/rules", element: <OwnerVenueBookingRulesPage /> },
              { path: "menu", element: <OwnerVenueMenuPage /> },
              { path: "photos", element: <OwnerVenueMediaPage /> },
              { path: "performance", element: <OwnerVenueAnalyticsPage /> },
            ],
          },
        ],
      },
      {
        path: "/owner/venues/:venueId/analytics",
        element: routeElement(
          <RequireAuth>
            <VenueRouteRedirect destination="performance" />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/venues/:venueId/media",
        element: routeElement(
          <RequireAuth>
            <VenueRouteRedirect destination="photos" />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/venues/:venueId/availability",
        element: routeElement(<RequireAuth><VenueRouteRedirect destination="bookings" /></RequireAuth>),
      },
      {
        path: "/owner/venues/:venueId/update",
        element: routeElement(<RequireAuth><VenueRouteRedirect destination="profile" /></RequireAuth>),
      },
      {
        path: "/owner/venues/:venueId/enquiries",
        element: routeElement(<RequireAuth><VenueInboxRedirect /></RequireAuth>),
      },
      { path: "/owner/enquiries", element: routeElement(<OwnerInboxRedirect />) },
      {
        path: "/owner/venues/:venueId/promotions/offers/new",
        element: routeElement(
          <RequireAuth>
            <OwnerRequestPromotedOfferPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/venues/:venueId/promotions/featured/new",
        element: routeElement(
          <RequireAuth>
            <OwnerRequestFeaturedPlacementPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/pricing",
        element: <Navigate to="/owner/billing" replace />,
      },
      {
        path: "/owner/billing",
        element: routeElement(
          <RequireAuth>
            <OwnerBillingPage />
          </RequireAuth>,
        ),
      },
      {
        path: "/owner/billing/success",
        element: routeElement(
          <RequireAuth>
            <OwnerBillingSuccessPage />
          </RequireAuth>,
        ),
      },
      { path: "/sign-in", element: routeElement(<SignInPage />) },
      { path: "/sign-up", element: routeElement(<SignUpPage />) },
      { path: "/forgot-password", element: routeElement(<ForgotPasswordPage />) },
      { path: "/reset-password", element: routeElement(<ResetPasswordPage />) },
      { path: "/venues/:slug/claim", element: routeElement(<ClaimVenuePage />) },
      { path: "/venues/:slug/request-booking", element: routeElement(<RequestBookingPage />) },
      { path: "/booking-status/:token", element: routeElement(<CustomerBookingStatusPage />) },
      { path: "/venues/:slug/enquire", element: routeElement(<VenueEnquiryPage />) },
      { path: "/venues/:slug", element: routeElement(<VenuePage />) },
      ...(import.meta.env.DEV
        ? [
            { path: "/error-boundary-preview", element: routeElement(<AppErrorPreviewPage />) },
            { path: "/promoted-offer-preview", element: routeElement(<PromotedOfferPreviewPage />) },
          ]
        : []),
      {
        path: "/admin/bookings",
        element: routeElement(
          <RequireAdmin>
            <AdminBookingsPage />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/demand",
        element: routeElement(
          <RequireAdmin>
            <AdminDemandPage />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/commercial",
        element: routeElement(
          <RequireAdmin>
            <AdminCommercialPage />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/bookings",
        element: <Navigate to="/admin/demand?kind=booking" replace />,
      },
      {
        path: "/admin/insights",
        element: routeElement(
          <RequireAdmin>
            <AdminInsightsPage />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/data-quality",
        element: <Navigate to="/admin/insights?view=data-quality" replace />,
      },
      {
        path: "/admin/review",
        element: routeElement(
          <RequireAdmin>
            <AdminReviewQueuePage />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/venue-updates",
        element: <Navigate to="/admin/review?type=updates" replace />,
      },
      {
        path: "/admin/media-review",
        element: <Navigate to="/admin/review?type=media" replace />,
      },
      {
        path: "/admin/subscriptions",
        element: <Navigate to="/admin/commercial?view=subscriptions" replace />,
      },
      {
        path: "/admin/promotion-requests",
        element: <Navigate to="/admin/review?type=promos" replace />,
      },
      {
        path: "/admin/venues",
        element: routeElement(
          <RequireAdmin>
            <AdminVenuesPage />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/reviews",
        element: <Navigate to="/admin/review?type=reviews" replace />,
      },
      {
        path: "/admin/suggestions",
        element: <Navigate to="/admin/review?type=suggestions" replace />,
      },
      {
        path: "/admin/claims",
        element: <Navigate to="/admin/review?type=claims" replace />,
      },
      {
        path: "/admin/featured",
        element: <Navigate to="/admin/commercial?view=placements&kind=featured" replace />,
      },
      {
        path: "/admin/enquiries",
        element: <Navigate to="/admin/demand?kind=enquiry" replace />,
      },
      {
        path: "/admin/offers",
        element: <Navigate to="/admin/commercial?view=placements&kind=offers" replace />,
      },
      {
        path: "/admin/analytics",
        element: <Navigate to="/admin/insights" replace />,
      },
      {
        path: "/admin/monetisation",
        element: <Navigate to="/admin/commercial" replace />,
      },
      {
        path: "/admin/venues/new",
        element: routeElement(
          <RequireAdmin>
            <VenueFormPage mode="new" />
          </RequireAdmin>,
        ),
      },
      {
        path: "/admin/venues/:id/edit",
        element: routeElement(
          <RequireAdmin>
            <VenueFormPage mode="edit" />
          </RequireAdmin>,
        ),
      },
      { path: "*", element: routeElement(<NotFoundPage />) },
    ],
  },
];

export const router = createBrowserRouter(routes);

function AccountRoute() {
  const [searchParams] = useSearchParams();
  if (searchParams.has("checkEmail")) return <AccountConfirmationPage />;
  return (
    <RequireAuth>
      <AccountPage />
    </RequireAuth>
  );
}

function DiscoverRedirect() {
  const { search } = useLocation();
  return <Navigate replace to={`/${search}`} />;
}

function VenueRouteRedirect({ destination }: { destination: "profile" | "photos" | "bookings" | "performance" }) {
  const { venueId = "" } = useParams();
  const { search } = useLocation();
  return <Navigate replace to={`/owner/venues/${venueId}/${destination}${search}`} />;
}

function VenueInboxRedirect() {
  const { venueId = "" } = useParams();
  const { search } = useLocation();
  const nextSearch = new URLSearchParams(search);
  nextSearch.set("venue", venueId);
  return <Navigate replace to={`/owner/inbox?${nextSearch.toString()}`} />;
}

function OwnerInboxRedirect() {
  const { search } = useLocation();
  const nextSearch = new URLSearchParams(search);
  const legacyBookingId = nextSearch.get("booking");
  if (legacyBookingId) {
    nextSearch.set("item", legacyBookingId);
    nextSearch.delete("booking");
  }
  const query = nextSearch.toString();
  return <Navigate replace to={`/owner/inbox${query ? `?${query}` : ""}`} />;
}

/**
 * Booking emails deep-link to /owner/bookings?booking=<id>. Those still land on
 * the inbox detail for that request; everything else gets the bookings home.
 */
function OwnerBookingsRoute() {
  const { search } = useLocation();
  const nextSearch = new URLSearchParams(search);
  const legacyBookingId = nextSearch.get("booking");
  if (legacyBookingId) {
    nextSearch.set("item", legacyBookingId);
    nextSearch.delete("booking");
    nextSearch.set("type", "booking");
    return <Navigate replace to={`/owner/inbox?${nextSearch.toString()}`} />;
  }
  return <OwnerBookingsPage />;
}
