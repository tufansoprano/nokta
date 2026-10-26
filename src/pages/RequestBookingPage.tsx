import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { BookingRequestForm } from "@/components/bookings/BookingRequestForm";
import { BookingUnavailableCard } from "@/components/venues/detail/VenueBookingCta";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageMeta } from "@/components/seo/PageMeta";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useVenues } from "@/hooks/useVenues";
import { useVenueBookingGate } from "@/hooks/useVenueBookingGate";
import { trackEvent } from "@/lib/analytics";
import { getVenueBookingAvailability } from "@/services/bookingAvailabilityService";
import { createBookingRequest } from "@/services/bookingRequestService";
import type { VenueBookingAvailability } from "@/types/bookingAvailability";
import type { BookingRequest, CreateBookingRequestInput } from "@/types/bookingRequests";

export function RequestBookingPage() {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { venues, isLoading, error } = useVenues();
  const venue = venues.find((item) => item.slug === slug);
  const { gate, isLoading: isLoadingGate, error: gateError } = useVenueBookingGate(venue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<BookingRequest | null>(null);
  const [availability, setAvailability] = useState<VenueBookingAvailability | null>(null);

  useEffect(() => {
    if (!venue) return;
    trackEvent("booking_request_page_viewed", { venueId: venue.id, city: venue.city, area: venue.area, sourceSurface: "venue_page" });
    getVenueBookingAvailability(venue.id).then(setAvailability).catch(() => setAvailability(null));
  }, [venue]);

  async function handleSubmit(request: CreateBookingRequestInput) {
    if (!venue) return;
    setIsSubmitting(true);
    setMutationError(null);
    try {
      const bookingRequest = await createBookingRequest({ userId: user?.id ?? null, request, venue });
      setCreatedRequest(bookingRequest);
      setSuccess(true);
    } catch (caughtError) {
      setMutationError(caughtError instanceof Error ? caughtError.message : "We could not send your booking request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || isLoadingGate) return <main><PageContainer className="py-20"><LoadingState message="Loading venue..." /></PageContainer></main>;
  if (error) return <main><PageContainer className="py-20"><ErrorState message={error} /></PageContainer></main>;
  if (gateError) return <main><PageContainer className="py-20"><ErrorState message={gateError} /></PageContainer></main>;
  if (!venue) return <main><PageMeta title="Venue not found | nokta" description="This venue is not available." /><PageContainer className="py-20"><ErrorState title="Venue not found" message="This venue is not available." /></PageContainer></main>;

  if (gate?.state === "disabled") return <main className="bg-nokta-page-bg"><PageMeta title={`${venue.name} takes enquiries | nokta`} description={`Send ${venue.name} an enquiry or contact them directly.`} canonicalPath={`/venues/${venue.slug}/request-booking`} /><PageContainer className="py-10"><Link to={`/venues/${venue.slug}`} className="mb-5 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground">Back to {venue.name}</Link><div className="mx-auto max-w-xl"><BookingUnavailableCard venue={venue} /><Button asChild variant="outline" className="mt-3 w-full"><Link to="/">Venues nearby that do take bookings</Link></Button></div></PageContainer></main>;

  return (
    <main>
      <PageMeta title={`Request booking at ${venue.name} | nokta`} description={`Request a booking at ${venue.name}.`} canonicalPath={`/venues/${venue.slug}/request-booking`} />
      <PageContainer className="py-10">
        <Link to={`/venues/${venue.slug}`} className="mb-5 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground">Back to {venue.name}</Link>
        <Card className="mx-auto max-w-3xl">
          <CardContent className="space-y-6 p-6">
            <div>
              <p className="text-sm text-muted-foreground">{venue.city} • {venue.area}</p>
              <h1 className="mt-2 font-brand text-4xl font-bold tracking-[-0.5px]">Request booking at {venue.name}</h1>
              {!venue.isClaimed ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{venue.name} isn't on nokta yet. Send your request and we'll pass it on to them, then let you know their answer.</p> : null}
            </div>
            {success ? (
              <div className="space-y-4">
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
                  <strong>Your booking request has been sent.</strong>
                  <span className="mt-1 block">{venue.isClaimed ? "This is not a confirmed booking yet. The venue will review your request and follow up." : `This is not a confirmed booking yet. We'll pass it on to ${venue.name} and let you know their answer.`}</span>
                </Alert>
                {createdRequest?.confirmationReference ? <div className="rounded-xl border bg-muted/40 p-4 text-sm"><span className="block text-xs uppercase text-muted-foreground">Booking reference</span><strong className="mt-1 block">{createdRequest.confirmationReference}</strong></div> : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {createdRequest?.customerAccessToken ? <Button asChild onClick={() => trackEvent("customer_booking_status_cta_clicked", { venueId: createdRequest.venueId, status: createdRequest.status })}><Link to={`/booking-status/${createdRequest.customerAccessToken}`}>View booking status</Link></Button> : null}
                  <Button asChild variant="outline"><Link to={`/venues/${venue.slug}`}>Back to venue</Link></Button>
                </div>
              </div>
            ) : (
              <BookingRequestForm venueId={venue.id} defaultEmail={user?.email} availability={availability} initialValues={getBookingInitialValues(searchParams)} isSubmitting={isSubmitting} onSubmit={handleSubmit} />
            )}
            {mutationError ? <Alert className="border-destructive/30 text-destructive">{mutationError}</Alert> : null}
          </CardContent>
        </Card>
      </PageContainer>
    </main>
  );
}

function getBookingInitialValues(searchParams: URLSearchParams) {
  const date = searchParams.get("date") ?? "";
  const time = searchParams.get("time") ?? "";
  const partySize = Number(searchParams.get("partySize") ?? "");

  return {
    requestedDate: date,
    requestedTime: time,
    partySize: Number.isFinite(partySize) && partySize > 0 ? partySize : undefined,
  };
}
