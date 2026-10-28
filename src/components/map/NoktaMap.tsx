import type { FeatureCollection } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { applyMapTheme, noktaMapStyle } from "@/lib/noktaMapStyle";
import { useTheme } from "@/context/ThemeContext";
import type { UserLocation } from "@/types/location";

export interface NoktaMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  isOpen: boolean;
  /** Shown in the pill above the selected dot: "Layali · £22 · till 02:00". */
  label: string;
}

/** Fly to a point, or frame a set of venues ([[west, south], [east, north]]). */
export type NoktaMapFocus = { longitude: number; latitude: number; zoom?: number } | { bounds: [[number, number], [number, number]] };

const INK = "#2a211b";
const MUTED = "#b3a596";
const CLAY = "#c45d3e";

/**
 * Venues as dots on the nokta street sketch. Open venues are ink, closed are
 * muted, and the selected venue becomes the one clay dot with its pill.
 */
export function NoktaMap({
  points,
  selectedId,
  onSelect,
  center,
  zoom,
  focus,
  userLocation,
  padding,
}: {
  points: NoktaMapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  center: [number, number];
  zoom: number;
  /** Changing this object flies the camera to it. */
  focus: NoktaMapFocus | null;
  userLocation: UserLocation | null;
  /** Space the map should keep clear for overlaid UI when centring. */
  padding: { top: number; bottom: number; left: number; right: number };
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const pillRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  // Work queued before the style loads (sources and layers do not exist yet).
  const readyQueueRef = useRef<Array<() => void>>([]);
  const whenReady = (fn: () => void) => {
    if (loadedRef.current) fn();
    else readyQueueRef.current.push(fn);
  };

  useEffect(() => {
    whenReady(() => {
      if (mapRef.current) applyMapTheme(mapRef.current, theme === "dark");
    });
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: noktaMapStyle,
      center,
      zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    // Top-right: the bottom of the map sits under the venue sheet on phones.
    map.addControl(
      // The tile source already credits OpenFreeMap, OpenMapTiles and OpenStreetMap.
      new maplibregl.AttributionControl({ compact: true }),
      "top-right",
    );
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("venues", { type: "geojson", data: toFeatureCollection(pointsRef.current) });
      map.addLayer({
        id: "venue-dots",
        type: "circle",
        source: "venues",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 12, 5, 16, 7],
          "circle-color": ["case", ["get", "isOpen"], INK, MUTED],
          "circle-stroke-color": "#f7f1e8",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "venue-selected-halo",
        type: "circle",
        source: "venues",
        filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 17, "circle-color": CLAY, "circle-opacity": 0.16 },
      });
      map.addLayer({
        id: "venue-selected",
        type: "circle",
        source: "venues",
        filter: ["==", ["get", "id"], ""],
        paint: { "circle-radius": 8, "circle-color": CLAY, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      // Fat invisible hit area so a dot is easy to tap with a thumb.
      map.addLayer({
        id: "venue-hit",
        type: "circle",
        source: "venues",
        paint: { "circle-radius": 16, "circle-opacity": 0 },
      });
      // Compact attribution opens on load; start it as the small (i) so it stays off the search bar.
      containerRef.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      loadedRef.current = true;
      for (const fn of readyQueueRef.current.splice(0)) fn();
    });

    map.on("click", "venue-hit", (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") onSelectRef.current(id);
    });
    map.on("mouseenter", "venue-hit", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "venue-hit", () => (map.getCanvas().style.cursor = ""));

    return () => {
      loadedRef.current = false;
      // Work queued against this map must not run on a later one (React re-mounts in dev).
      readyQueueRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the dot data in step with the filtered venues.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (mapRef.current?.getSource("venues") as GeoJSONSource | undefined)?.setData(toFeatureCollection(points));
    whenReady(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Selected dot + its pill.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const filter: maplibregl.FilterSpecification = ["==", ["get", "id"], selectedId ?? ""];
      map.setFilter("venue-selected", filter);
      map.setFilter("venue-selected-halo", filter);
      pillRef.current?.remove();
      pillRef.current = null;
      const point = points.find((item) => item.id === selectedId);
      if (!point) return;
      const element = document.createElement("div");
      element.className = "nokta-map-pill";
      element.textContent = point.label;
      pillRef.current = new maplibregl.Marker({ element, anchor: "bottom", offset: [0, -14] }).setLngLat([point.longitude, point.latitude]).addTo(map);
      // The same facts are on the venue card; keep the decorative pill out of the accessibility tree.
      element.setAttribute("aria-hidden", "true");
      element.removeAttribute("role");
      element.removeAttribute("tabindex");
      const pixel = map.project([point.longitude, point.latitude]);
      const { clientWidth, clientHeight } = map.getContainer();
      const outOfView = pixel.x < padding.left || pixel.x > clientWidth - padding.right || pixel.y < padding.top || pixel.y > clientHeight - padding.bottom;
      if (outOfView) map.easeTo({ center: [point.longitude, point.latitude], padding, duration: 450 });
    };
    whenReady(apply);
    // `padding` is read at selection time only; changing it alone should not re-pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focus || !map) return;
    if ("bounds" in focus) map.fitBounds(focus.bounds, { padding, maxZoom: 14, duration: 900, essential: true });
    else map.flyTo({ center: [focus.longitude, focus.latitude], zoom: focus.zoom ?? map.getZoom(), padding, duration: 900, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!userLocation) return;
    const element = document.createElement("div");
    element.className = "nokta-map-you";
    element.setAttribute("aria-label", "You are here");
    userMarkerRef.current = new maplibregl.Marker({ element }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map);
  }, [userLocation]);

  // MapLibre forces `position: relative` on its container, so the sizing lives on a wrapper.
  return (
    <div className="nokta-map absolute inset-0" role="region" aria-label="Map of venues">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function toFeatureCollection(points: NoktaMapPoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: { id: point.id, isOpen: point.isOpen },
    })),
  };
}
