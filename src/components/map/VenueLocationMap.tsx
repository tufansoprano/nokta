import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { applyMapTheme, noktaMapStyle } from "@/lib/noktaMapStyle";

/**
 * One venue's pin on the nokta street sketch, for the venue page's location card.
 * Static on purpose: it sits inside a scrolling page, so it must not steal scroll
 * or drag gestures, and directions are a link beside it.
 */
export function VenueLocationMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: noktaMapStyle,
      center: [longitude, latitude],
      zoom: 15,
      interactive: false,
      attributionControl: false,
    });
    // The tile source already credits OpenFreeMap, OpenMapTiles and OpenStreetMap.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const pin = document.createElement("div");
    pin.className = "nokta-map-pin";
    new maplibregl.Marker({ element: pin }).setLngLat([longitude, latitude]).addTo(map);
    map.on("load", () => {
      containerRef.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => applyMapTheme(map, theme === "dark");
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [theme]);

  return (
    <div className="nokta-map relative h-full w-full bg-nokta-map-bg" role="img" aria-label={`Map showing ${label}`}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
