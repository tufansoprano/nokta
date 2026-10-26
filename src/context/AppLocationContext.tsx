import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { resolveManualLocation } from "@/lib/manualLocation";
import { hasValidUserLocation } from "@/lib/map";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/storage";
import type { LocationStatus, SavedUserLocation, UserLocation } from "@/types/location";

interface AppLocationContextValue {
  savedLocation: SavedUserLocation | null;
  userLocation: UserLocation | null;
  locationStatus: LocationStatus;
  hasCoordinates: boolean;
  /** Centre on a searched place (postcode, area, town) instead of the visitor. */
  setPlaceLocation: (place: UserLocation & { label: string }) => void;
  useCurrentLocation: () => void;
  clearLocation: () => void;
}

const STORAGE_KEY = "sheesha:user-location";
const AppLocationContext = createContext<AppLocationContextValue | undefined>(undefined);

export function AppLocationProvider({ children }: { children: React.ReactNode }) {
  const [savedLocation, setSavedLocationState] = useState<SavedUserLocation | null>(() => readJsonFromStorage<SavedUserLocation | null>(STORAGE_KEY, null));
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(savedLocation ? "success" : "idle");

  const userLocation = hasValidUserLocation(savedLocation?.coordinates) ? savedLocation.coordinates : null;
  const hasCoordinates = Boolean(userLocation);

  useEffect(() => {
    if (!savedLocation || savedLocation.coordinates || savedLocation.source !== "manual") {
      return;
    }

    let active = true;
    const locationToUpgrade = savedLocation;

    async function upgradeManualLocation() {
      const coordinates = await resolveManualLocation(locationToUpgrade.label);
      if (!active || !coordinates) {
        return;
      }

      persistLocation({
        ...locationToUpgrade,
        label: coordinates.label ?? locationToUpgrade.label,
        coordinates,
        updatedAt: new Date().toISOString(),
      });
    }

    void upgradeManualLocation();

    return () => {
      active = false;
    };
  }, [savedLocation]);

  // A visitor who has already allowed location gets a fresh fix on every visit, with no prompt.
  // Anyone else is only asked when they tap the map's locate button.
  useEffect(() => {
    if (!navigator.permissions?.query || !navigator.geolocation) return;
    let active = true;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (active && permission.state === "granted") useCurrentLocation();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistLocation(location: SavedUserLocation | null) {
    setSavedLocationState(location);
    writeJsonToStorage(STORAGE_KEY, location);
  }

  function setPlaceLocation(place: UserLocation & { label: string }) {
    persistLocation({
      label: place.label,
      coordinates: { ...place, source: "manual" },
      source: "manual",
      updatedAt: new Date().toISOString(),
    });
    trackEvent("location_enabled", { source: "manual", hasCoordinates: true });
    setLocationStatus("success");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      return;
    }

    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        persistLocation({
          label: "Current location",
          coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            label: "Current location",
            source: "browser",
          },
          source: "browser",
          updatedAt: new Date().toISOString(),
        });
        trackEvent("location_enabled", {
          source: "browser",
          hasCoordinates: true,
        });
        setLocationStatus("success");
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  }

  function clearLocation() {
    persistLocation(null);
    setLocationStatus("idle");
  }

  const value = useMemo(
    () => ({
      savedLocation,
      userLocation,
      locationStatus,
      hasCoordinates,
      setPlaceLocation,
      useCurrentLocation,
      clearLocation,
    }),
    [savedLocation, userLocation, locationStatus, hasCoordinates],
  );

  return <AppLocationContext.Provider value={value}>{children}</AppLocationContext.Provider>;
}

export function useAppLocation() {
  const context = useContext(AppLocationContext);
  if (!context) {
    throw new Error("useAppLocation must be used within AppLocationProvider");
  }

  return context;
}
