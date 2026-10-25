import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { WorkspacePageHeader, workspaceSecondaryActionClass } from "@/components/workspace/WorkspacePageHeader";
import { FoodHygienePanel } from "@/components/admin/venues/FoodHygienePanel";
import { VenueForm } from "@/components/admin/venues/VenueForm";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { createEmptyVenueFormValues, createVenueFormValuesFromSuggestion, mapVenueToFormValues } from "@/lib/venueFormMappers";
import { createVenue, getVenueById, updateVenue } from "@/services/adminVenueService";
import { getAdminVenueSuggestionById } from "@/services/adminVenueSuggestionService";
import type { VenueFormValues } from "@/types/venueForm";
import type { VenueSuggestion } from "@/types/venueSuggestions";

export function VenueFormPage({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const suggestionId = mode === "new" ? searchParams.get("suggestion") : null;
  const [initialValues, setInitialValues] = useState<VenueFormValues | null>(
    mode === "new" && !suggestionId ? createEmptyVenueFormValues() : null,
  );
  const [sourceSuggestion, setSourceSuggestion] = useState<VenueSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(mode === "edit" || Boolean(suggestionId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const allowNavigation = useRef(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const focusTarget = searchParams.get("focus");
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && !allowNavigation.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("You have unsaved venue changes. Leave this page?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    let cancelled = false;

    if (mode === "new") {
      setLoadError(null);
      setSourceSuggestion(null);

      if (!suggestionId) {
        setInitialValues(createEmptyVenueFormValues());
        setIsLoading(false);
        return;
      }

      setInitialValues(null);
      setIsLoading(true);

      void getAdminVenueSuggestionById(suggestionId)
        .then((suggestion) => {
          if (cancelled) {
            return;
          }

          if (!suggestion) {
            setLoadError("Suggestion not found.");
            return;
          }

          setSourceSuggestion(suggestion);
          setInitialValues(createVenueFormValuesFromSuggestion(suggestion));
        })
        .catch((caughtError) => {
          if (!cancelled) {
            setInitialValues(null);
            setLoadError(caughtError instanceof Error ? caughtError.message : "Could not load venue suggestion.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    setSourceSuggestion(null);

    if (!id) {
      setInitialValues(null);
      setLoadError("Venue ID is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    void getVenueById(id)
      .then((venue) => {
        if (cancelled) {
          return;
        }

        if (!venue) {
          setInitialValues(null);
          setLoadError("Venue not found.");
          return;
        }

        setInitialValues(mapVenueToFormValues(venue));
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setInitialValues(null);
          setLoadError(caughtError instanceof Error ? caughtError.message : "Could not load venue.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, mode, suggestionId]);

  useEffect(() => {
    if (isLoading || focusTarget !== "monetisationNotes") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const field = document.getElementById("monetisationNotes");
      field?.scrollIntoView({ block: "center" });
      field?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [focusTarget, isLoading]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  async function handleSubmit(values: VenueFormValues) {
    setIsSaving(true);
    setSaveError(null);

    try {
      if (mode === "new") {
        const createdVenue = await createVenue(values);
        setToast({ type: "success", message: "Venue created." });
        allowNavigation.current = true;
        navigate(`/admin/venues/${createdVenue.id}/edit`, { replace: true });
        return;
      }

      if (!id) {
        throw new Error("Venue ID is missing.");
      }

      const updatedVenue = await updateVenue(id, values);
      setInitialValues(mapVenueToFormValues(updatedVenue));
      setToast({ type: "success", message: "Venue saved." });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not save venue.";
      setSaveError(message);
      setToast({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <AdminPageShell activePath="/admin/venues">
        <div className="py-20">
          <LoadingState message="Loading venue form..." />
        </div>
      </AdminPageShell>
    );
  }

  if (loadError || !initialValues) {
    return (
      <AdminPageShell activePath="/admin/venues">
        <div className="py-20">
          <ErrorState message={loadError ?? "Could not load venue form."} />
          <Button asChild className="mt-6">
            <Link to="/admin/venues">Back to venues</Link>
          </Button>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell activePath="/admin/venues" fullWidth>
      <div className="mx-auto w-full max-w-[1120px] space-y-6 px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
        <WorkspacePageHeader
          back={{ to: "/admin/venues", label: "Venues" }}
          title={mode === "edit" ? initialValues.name : "New venue"}
          description={mode === "edit" ? "Edit venue details, opening hours and verification." : "Add the details and sources needed to publish a venue."}
          actions={mode === "edit" ? <Link className={workspaceSecondaryActionClass} to={`/venues/${initialValues.slug}`}>View public page <ExternalLink aria-hidden="true" className="size-4" /></Link> : undefined}
        />
        {sourceSuggestion ? (
          <Alert className="border-nokta-ok-line bg-nokta-ok-tint text-nokta-ok-ink">
            Prefilled from suggestion: {sourceSuggestion.venueName}. Review the details, add coordinates and any missing verification before saving.
          </Alert>
        ) : null}
        <VenueForm
          key={`${mode}-${suggestionId ?? (initialValues.id || "new")}`}
          initialValues={initialValues}
          mode={mode}
          isSaving={isSaving}
          saveError={saveError}
          onDirtyChange={setIsDirty}
          onSubmit={handleSubmit}
          foodHygienePanel={mode === "edit" && id ? <FoodHygienePanel venueId={id} /> : undefined}
          onInvalidSubmit={(errors) => setToast({ type: "error", message: `Please fix ${formatValidationFields(errors)} before saving.` })}
        />
        {toast ? <Toast type={toast.type} title={toast.type === "success" ? "Saved" : "Save failed"} message={toast.message} offsetBottom onClose={() => setToast(null)} /> : null}
      </div>
    </AdminPageShell>
  );
}

function formatValidationFields(errors: Record<string, string>) {
  const labels = Object.keys(errors).slice(0, 3).map(formatValidationField);
  const remainingCount = Math.max(0, Object.keys(errors).length - labels.length);
  const fieldList = labels.join(", ");

  return remainingCount ? `${fieldList} and ${remainingCount} more field${remainingCount === 1 ? "" : "s"}` : fieldList || "the highlighted fields";
}

function formatValidationField(field: string) {
  return field
    .replace(/^dataSources\./, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .toLowerCase();
}
