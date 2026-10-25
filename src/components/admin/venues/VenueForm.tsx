import { Map } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataSourcesEditor } from "@/components/admin/venues/DataSourcesEditor";
import { OpeningHoursEditor } from "@/components/admin/venues/OpeningHoursEditor";
import { VenueFormSection } from "@/components/admin/venues/VenueFormSection";
import { VenueFormWarnings } from "@/components/admin/venues/VenueFormWarnings";
import { VibeSelector } from "@/components/admin/venues/VibeSelector";
import { CitySelector } from "@/components/search/CitySelector";
import { activeVenueCategories } from "@/data/venueCategories";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateVenueSlug } from "@/lib/venueFormMappers";
import { validateVenueForm } from "@/lib/venueFormValidation";
import { cn } from "@/lib/utils";
import type { MonetisationStatus, PartnerTier } from "@/types/monetisation";
import type { BusinessStatus, PriceLevel, VerificationStatus } from "@/types/venue";
import type { VenueFormValues } from "@/types/venueForm";
import type { VenuePrimaryCategory } from "@/types/venueCategories";

const FEATURE_FIELDS = [
  ["indoor", "Indoor"],
  ["outdoor", "Outdoor"],
  ["food", "Food"],
  ["alcohol", "Alcohol"],
  ["halal", "Halal"],
  ["openLate", "Open late"],
] as const;

const PARTNER_TIER_OPTIONS: { label: string; value: PartnerTier }[] = [
  { label: "None", value: "none" },
  { label: "Starter", value: "starter" },
  { label: "Growth", value: "growth" },
  { label: "Pro", value: "pro" },
];

const MONETISATION_STATUS_OPTIONS: { label: string; value: MonetisationStatus }[] = [
  { label: "Not contacted", value: "not-contacted" },
  { label: "Contacted", value: "contacted" },
  { label: "Interested", value: "interested" },
  { label: "Trial", value: "trial" },
  { label: "Paying", value: "paying" },
  { label: "Churned", value: "churned" },
  { label: "Not a fit", value: "not-fit" },
];

const CATEGORY_OPTIONS = activeVenueCategories.map((category) => ({ label: category.label, value: category.id }));

export function VenueForm({
  initialValues,
  mode,
  isSaving,
  saveError,
  onDirtyChange,
  onSubmit,
  onInvalidSubmit,
  foodHygienePanel,
}: {
  initialValues: VenueFormValues;
  mode: "new" | "edit";
  isSaving: boolean;
  saveError: string | null;
  onDirtyChange: (isDirty: boolean) => void;
  onSubmit: (values: VenueFormValues) => Promise<void>;
  onInvalidSubmit?: (errors: Record<string, string>) => void;
  foodHygienePanel?: React.ReactNode;
}) {
  const [values, setValues] = useState(initialValues);
  const [slugWasEdited, setSlugWasEdited] = useState(mode === "edit");
  const [submitted, setSubmitted] = useState(false);
  const validation = useMemo(() => validateVenueForm(values), [values]);
  const hasChanges = useMemo(() => JSON.stringify(values) !== JSON.stringify(initialValues), [values, initialValues]);

  useEffect(() => {
    onDirtyChange(hasChanges);
  }, [hasChanges, onDirtyChange]);

  useEffect(() => {
    setValues(initialValues);
    setSlugWasEdited(mode === "edit");
  }, [initialValues, mode]);

  function update<K extends keyof VenueFormValues>(key: K, value: VenueFormValues[K]) {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  }

  function updateName(name: string) {
    setValues((currentValues) => {
      const nextValues = { ...currentValues, name };
      if (!slugWasEdited) {
        nextValues.slug = generateVenueSlug(name);
        nextValues.id = generateVenueSlug(name);
      }
      return nextValues;
    });
  }

  function updateClaimedStatus(isClaimed: boolean) {
    setValues((currentValues) => ({
      ...currentValues,
      isClaimed,
      claimedBy: isClaimed ? currentValues.claimedBy : null,
      claimedAt: isClaimed ? currentValues.claimedAt ?? new Date().toISOString().slice(0, 10) : null,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setSubmitted(true);

    if (!validation.isValid) {
      onInvalidSubmit?.(validation.errors);
      window.requestAnimationFrame(() => {
        document.querySelector("[data-field-error='true']")?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }

    await onSubmit(values);
  }

  const showErrors = submitted;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${values.address} ${values.postcode}`.trim())}`;

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      {saveError ? <Alert role="alert" className="border-nokta-bad-line bg-nokta-bad-tint text-nokta-bad-ink">{saveError}</Alert> : null}
      <VenueFormWarnings warnings={validation.warnings} />

      <fieldset disabled={isSaving} className="contents">
      <VenueFormSection title="Basic details">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" error={showErrors ? validation.errors.name : undefined}>
            <Input value={values.name} onChange={(event) => updateName(event.target.value)} />
          </Field>
          <Field label="ID" error={showErrors ? validation.errors.id : undefined}>
            <Input value={values.id} onChange={(event) => update("id", event.target.value)} disabled={mode === "edit"} />
          </Field>
          <Field label="Slug" error={showErrors ? validation.errors.slug : undefined}>
            <Input
              value={values.slug}
              onChange={(event) => {
                setSlugWasEdited(true);
                update("slug", event.target.value);
              }}
            />
          </Field>
        </div>
        <Field label="Description" error={showErrors ? validation.errors.description : undefined}>
          <Textarea value={values.description} onChange={(event) => update("description", event.target.value)} />
        </Field>
      </VenueFormSection>

      <VenueFormSection title="Location">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Country" error={showErrors ? validation.errors.country : undefined}>
            <Input value={values.country} onChange={(event) => update("country", event.target.value)} />
          </Field>
          <Field label="City" error={showErrors ? validation.errors.city : undefined}>
            <CitySelector id="admin-venue-city" value={values.city} onChange={(city) => update("city", city)} />
          </Field>
          <Field label="Area" error={showErrors ? validation.errors.area : undefined}>
            <Input value={values.area} onChange={(event) => update("area", event.target.value)} />
          </Field>
          <Field label="Address" error={showErrors ? validation.errors.address : undefined}>
            <Input value={values.address} onChange={(event) => update("address", event.target.value)} />
          </Field>
          <Field label="Postcode" error={showErrors ? validation.errors.postcode : undefined}>
            <Input value={values.postcode} onChange={(event) => update("postcode", event.target.value)} />
          </Field>
          <Field label="Latitude" error={showErrors ? validation.errors.latitude : undefined}>
            <Input value={values.latitude} onChange={(event) => update("latitude", parseNumberInput(event.target.value))} />
          </Field>
          <Field label="Longitude" error={showErrors ? validation.errors.longitude : undefined}>
            <Input value={values.longitude} onChange={(event) => update("longitude", parseNumberInput(event.target.value))} />
          </Field>
        </div>
        <Button asChild type="button" variant="outline" className="w-fit">
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            <Map className="mr-2 h-4 w-4" />
            Open in Google Maps
          </a>
        </Button>
      </VenueFormSection>

      <VenueFormSection title="Pricing & rating">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Price from" error={showErrors ? validation.errors.priceFrom : undefined}>
            <Input inputMode="decimal" value={values.priceFrom ?? ""} onChange={(event) => update("priceFrom", parseNullableNumberInput(event.target.value))} />
          </Field>
          <Field label="Price level" error={showErrors ? validation.errors.priceLevel : undefined}>
            <Select
              value={String(values.priceLevel)}
              onChange={(event) => update("priceLevel", Number(event.target.value) as PriceLevel)}
              options={[
                { label: "1", value: "1" },
                { label: "2", value: "2" },
                { label: "3", value: "3" },
                { label: "4", value: "4" },
              ]}
            />
          </Field>
          <Field label="Rating" error={showErrors ? validation.errors.rating : undefined}>
            <Input value={values.rating ?? ""} onChange={(event) => update("rating", parseNullableNumberInput(event.target.value))} />
          </Field>
        </div>
      </VenueFormSection>

      <VenueFormSection title="Category">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary category">
            <Select value={values.primaryCategory} onChange={(event) => update("primaryCategory", event.target.value as VenuePrimaryCategory)} options={CATEGORY_OPTIONS} />
          </Field>
          <Field label="Secondary categories">
            <Input
              value={values.secondaryCategories.join(", ")}
              onChange={(event) => update("secondaryCategories", event.target.value.split(",").map((item) => item.trim()).filter(Boolean) as VenueFormValues["secondaryCategories"])}
              placeholder="shisha, food, late_night"
            />
          </Field>
        </div>
      </VenueFormSection>

      <VenueFormSection title="Features">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURE_FIELDS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-md border bg-nokta-surface-alt px-3 py-2 text-sm font-medium border-nokta-border">
              <Checkbox checked={Boolean(values[key])} onChange={(event) => update(key, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </VenueFormSection>

      <VenueFormSection title="Vibes">
        <VibeSelector value={values.vibes} onChange={(vibes) => update("vibes", vibes)} />
      </VenueFormSection>

      <VenueFormSection title="Opening hours">
        <OpeningHoursEditor value={values.openingHours} onChange={(openingHours) => update("openingHours", openingHours)} />
      </VenueFormSection>

      <VenueFormSection title="Links & contact">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Website" error={showErrors ? validation.errors.website : undefined}>
            <Input value={values.website ?? ""} onChange={(event) => update("website", nullableString(event.target.value))} placeholder="https://" />
          </Field>
          <Field label="Instagram" error={showErrors ? validation.errors.instagram : undefined}>
            <Input value={values.instagram ?? ""} onChange={(event) => update("instagram", nullableString(event.target.value))} placeholder="https://" />
          </Field>
          <Field label="Phone">
            <Input value={values.phone ?? ""} onChange={(event) => update("phone", nullableString(event.target.value))} />
          </Field>
        </div>
        <Field label="Image URLs">
          <Textarea
            value={values.images.join("\n")}
            onChange={(event) => update("images", event.target.value.split("\n"))}
            placeholder="One image URL per line"
          />
        </Field>
      </VenueFormSection>

      <VenueFormSection title="Data provenance">
        <DataSourcesEditor value={values.dataSources} errors={showErrors ? validation.errors : {}} onChange={(dataSources) => update("dataSources", dataSources)} />
        <Field label="Source notes">
          <Textarea value={values.sourceNotes ?? ""} onChange={(event) => update("sourceNotes", nullableString(event.target.value))} />
        </Field>
        {foodHygienePanel}
      </VenueFormSection>

      <VenueFormSection title="Verification">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Business status">
            <Select
              value={values.businessStatus}
              onChange={(event) => update("businessStatus", event.target.value as BusinessStatus)}
              options={[
                { label: "Open", value: "open" },
                { label: "Temporarily closed", value: "temporarily-closed" },
                { label: "Permanently closed", value: "permanently-closed" },
                { label: "Unknown", value: "unknown" },
              ]}
            />
          </Field>
          <Field label="Verification status">
            <Select
              value={values.verificationStatus}
              onChange={(event) => update("verificationStatus", event.target.value as VerificationStatus)}
              options={[
                { label: "Unverified", value: "unverified" },
                { label: "Partially verified", value: "partially-verified" },
                { label: "Verified", value: "verified" },
              ]}
            />
          </Field>
          <Field label="Last verified at">
            <Input type="date" value={values.lastVerifiedAt ?? ""} onChange={(event) => update("lastVerifiedAt", nullableString(event.target.value))} />
          </Field>
        </div>
        <Button type="button" variant="outline" className="w-fit" onClick={() => update("lastVerifiedAt", new Date().toISOString().slice(0, 10))}>
          Set last verified to today
        </Button>
      </VenueFormSection>

      <VenueFormSection title="Commercial">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border bg-nokta-surface-alt px-3 py-2 text-sm font-medium border-nokta-border">
            <Checkbox checked={values.isClaimed} onChange={(event) => updateClaimedStatus(event.target.checked)} />
            Claimed profile
          </label>
          <label className="flex items-center gap-2 rounded-md border bg-nokta-surface-alt px-3 py-2 text-sm font-medium border-nokta-border">
            <Checkbox checked={values.featuredEligible} onChange={(event) => update("featuredEligible", event.target.checked)} />
            Featured eligible
          </label>
          <Field label="Claimed by">
            <Input
              value={values.claimedBy ?? ""}
              onChange={(event) => update("claimedBy", nullableString(event.target.value))}
              placeholder="Auth user ID"
              disabled={!values.isClaimed}
            />
          </Field>
          <Field label="Claimed at">
            <Input
              type="date"
              value={values.claimedAt ?? ""}
              onChange={(event) => update("claimedAt", nullableString(event.target.value))}
              disabled={!values.isClaimed}
            />
          </Field>
          <Field label="Partner tier">
            <Select
              value={values.partnerTier}
              onChange={(event) => update("partnerTier", event.target.value as PartnerTier)}
              options={PARTNER_TIER_OPTIONS}
            />
          </Field>
          <Field label="Monetisation status">
            <Select
              value={values.monetisationStatus}
              onChange={(event) => update("monetisationStatus", event.target.value as MonetisationStatus)}
              options={MONETISATION_STATUS_OPTIONS}
            />
          </Field>
        </div>
        <Field label="Featured blocked reason">
          <Input
            value={values.featuredBlockedReason ?? ""}
            onChange={(event) => update("featuredBlockedReason", nullableString(event.target.value))}
            placeholder="Why this venue should not be featured"
            disabled={values.featuredEligible}
          />
        </Field>
        <Field label="Monetisation notes">
          <Textarea
            id="monetisationNotes"
            name="monetisationNotes"
            value={values.monetisationNotes ?? ""}
            onChange={(event) => update("monetisationNotes", nullableString(event.target.value))}
            placeholder="2026-08-25 - Contacted via Instagram. Follow up with manager."
          />
        </Field>
      </VenueFormSection>
      </fieldset>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t border-nokta-border bg-nokta-surface px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8">
        <p aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-nokta-ink-muted">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", saveError ? "bg-nokta-bad-solid" : hasChanges ? "bg-nokta-warn-solid" : mode === "edit" ? "bg-nokta-ok-solid" : "bg-nokta-ink-muted")} />
          {saveError ? "Save failed" : isSaving ? "Saving changes" : mode === "edit" ? hasChanges ? "Unsaved changes" : "All changes saved" : "Ready to create"}
        </p>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" className="flex-1 rounded-full border-nokta-border bg-nokta-surface text-nokta-ink hover:bg-nokta-hover sm:flex-none">
            <Link to="/admin/venues">Back to venues</Link>
          </Button>
          <Button type="submit" disabled={isSaving} className="flex-1 rounded-full bg-nokta-ink px-5 text-nokta-surface hover:bg-nokta-ink/90 sm:flex-none">
            {isSaving ? "Saving..." : mode === "edit" ? "Save changes" : "Create venue"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium" data-field-error={error ? "true" : undefined}>
      {label}
      {children}
      {error ? <span className="text-xs text-nokta-bad-ink">{error}</span> : null}
    </label>
  );
}

function parseNumberInput(value: string): number | "" {
  return value.trim() === "" ? "" : Number(value);
}

function parseNullableNumberInput(value: string): number | null {
  const normalizedValue = value.replace(/[£,\s]/g, "");
  return normalizedValue.trim() === "" ? null : Number(normalizedValue);
}

function nullableString(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
