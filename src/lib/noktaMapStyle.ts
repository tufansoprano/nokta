import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/**
 * The nokta map: a quiet street sketch on cream so venue dots carry the page.
 * No POIs, no shields, no transit; only water, parks, streets and the
 * neighbourhood names people actually say. Tiles from OpenFreeMap (OSM data,
 * OpenMapTiles schema, no key).
 */
const INK_LABEL = "#8a7a6a";
const HALO = "#f7f1e8";
const FONT_REGULAR = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

export const noktaMapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f7f1e8" } },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": "#ebe8d4", "fill-opacity": 0.8 },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["grass", "wood"]]],
      paint: { "fill-color": "#ebe8d4", "fill-opacity": 0.6 },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#dde4e2" },
    },
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 15,
      paint: { "fill-color": "#efe6d9" },
    },
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary"]]],
      minzoom: 12,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#e8ddce",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 0.5, 16, 4, 18, 10],
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "trunk"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#dfd0bc",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 9, 0.6, 14, 3, 18, 14],
      },
    },
    {
      id: "road-motorway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "motorway"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#d8c6af",
        "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 6, 0.6, 14, 4, 18, 16],
      },
    },
    {
      id: "road-name",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 15,
      filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "trunk"]]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_REGULAR,
        "text-size": 11,
      },
      paint: { "text-color": "#a3937f", "text-halo-color": HALO, "text-halo-width": 1.5 },
    },
    {
      id: "place-neighbourhood",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 12,
      filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter"]]],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9.5, 16, 12],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 8,
      },
      paint: { "text-color": INK_LABEL, "text-halo-color": HALO, "text-halo-width": 1.5 },
    },
    {
      id: "place-town",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      maxzoom: 13,
      filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 12, 15],
        "text-letter-spacing": 0.04,
      },
      paint: { "text-color": "#6f6152", "text-halo-color": HALO, "text-halo-width": 2 },
    },
  ],
};

const darkMapColors: Record<string, string> = {
  "#f7f1e8": "#171513",
  "#ebe8d4": "#293129",
  "#dde4e2": "#23343b",
  "#efe6d9": "#28231f",
  "#e8ddce": "#3b322b",
  "#dfd0bc": "#514336",
  "#d8c6af": "#65513e",
  "#a3937f": "#a89987",
  "#8a7a6a": "#b9a995",
  "#6f6152": "#cdbca7",
};

export function applyMapTheme(map: MapLibreMap, dark: boolean) {
  for (const layer of noktaMapStyle.layers) {
    if (!("paint" in layer) || !layer.paint) continue;
    for (const [property, value] of Object.entries(layer.paint)) {
      if (typeof value === "string" && value in darkMapColors) {
        map.setPaintProperty(layer.id, property, dark ? darkMapColors[value] : value);
      }
    }
  }
  // The venue page's single-pin map has no dot layer.
  if (!map.getLayer("venue-dots")) return;
  map.setPaintProperty("venue-dots", "circle-color", ["case", ["get", "isOpen"], dark ? "#f1e8de" : "#2a211b", dark ? "#8a7a6a" : "#b3a596"]);
  map.setPaintProperty("venue-dots", "circle-stroke-color", dark ? "#171513" : "#f7f1e8");
}
