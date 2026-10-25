import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOOD_HYGIENE_LINK_STATUS_LABELS, formatFoodHygieneRating } from "@/lib/foodHygiene";
import { getAdminVenueFoodHygiene, refreshAdminVenueFoodHygiene, rematchAdminVenueFoodHygiene, unlinkAdminVenueFoodHygiene } from "@/services/adminFoodHygieneService";
import type { VenueFoodHygiene } from "@/types/foodHygiene";

/**
 * Shows which official food hygiene record a venue is linked to and lets the team
 * correct it: set "Food hygiene source" to the right ratings.food.gov.uk page and
 * save, or mark the venue as having no record.
 */
export function FoodHygienePanel({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-venue-food-hygiene", venueId];
  const { data: hygiene, error: loadError, isLoading } = useQuery({ queryKey, queryFn: () => getAdminVenueFoodHygiene(venueId) });
  const action = useMutation({
    mutationFn: (kind: "refresh" | "unlink" | "rematch") =>
      kind === "refresh" ? refreshAdminVenueFoodHygiene(venueId) : kind === "unlink" ? unlinkAdminVenueFoodHygiene(venueId) : rematchAdminVenueFoodHygiene(venueId),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
  });
  const error = action.error ?? loadError;

  return (
    <div className="grid gap-3 rounded-lg border border-nokta-border p-4 text-sm">
      <div className="font-medium text-nokta-ink">Food hygiene rating</div>
      {isLoading ? <p className="text-nokta-ink-muted">Loading…</p> : <FoodHygieneSummary hygiene={hygiene ?? null} />}
      <p className="text-xs text-nokta-ink-muted">
        Refreshed automatically twice a week. To link a different record, put its ratings.food.gov.uk page in Food hygiene source, save, then refresh.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate("refresh")}>
          Refresh now
        </Button>
        {hygiene?.linkStatus === "unlinked" ? (
          <Button type="button" size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate("rematch")}>
            Match automatically again
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate("unlink")}>
            No official record
          </Button>
        )}
      </div>
      {error ? <p className="text-xs text-nokta-bad-ink">{error.message}</p> : null}
    </div>
  );
}

function FoodHygieneSummary({ hygiene }: { hygiene: VenueFoodHygiene | null }) {
  if (!hygiene) return <p className="text-nokta-ink-muted">Not checked yet.</p>;

  return (
    <dl className="grid gap-1">
      <div>{FOOD_HYGIENE_LINK_STATUS_LABELS[hygiene.linkStatus]}</div>
      {hygiene.officialUrl ? (
        <a className="inline-flex items-center gap-1 underline" href={hygiene.officialUrl} target="_blank" rel="noreferrer">
          {hygiene.businessName}, {hygiene.businessAddress} <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      ) : null}
      <div>
        Rating: {hygiene.rating ? formatFoodHygieneRating(hygiene.rating) : "none shown"}
        {hygiene.ratingDate ? `, inspected ${hygiene.ratingDate}` : ""}
      </div>
      <div className="text-xs text-nokta-ink-muted">Last checked {new Date(hygiene.checkedAt).toLocaleString("en-GB")}</div>
    </dl>
  );
}
