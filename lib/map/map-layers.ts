import maplibregl from "maplibre-gl";
import { FireDetection } from "@/lib/fires/firms";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import { getAqiMapFillColor } from "@/lib/forecast/types";
import { getCellValueAtInstant } from "@/lib/map/regional-cells";
import { RegionalGridCellForecast } from "@/hooks/use-regional-grid";

const REGIONAL_SOURCE_ID = "regional-aqi-cells";
const REGIONAL_FILL_LAYER_ID = "regional-aqi-fill";
const REGIONAL_BORDER_LAYER_ID = "regional-aqi-borders";
const FIRES_SOURCE_ID = "fires-source";
const FIRES_LAYER_ID = "fires-layer";
const SMOKE_SOURCE_ID = "smoke-source";
const SMOKE_LAYER_ID = "smoke-layer";
const BUILDING_EXTRUSION_LAYER_ID = "3d-buildings-extrusion";

export function buildRegionalGridGeoJson(
  gridData: RegionalGridCellForecast[],
  activeInstant: string | null
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = gridData.map(({ cell, forecast }) => {
    const sample = activeInstant
      ? getCellValueAtInstant(forecast, activeInstant)
      : forecast.current;
    const usAqi = sample?.usAqi ?? null;
    const pm25 = sample?.pm25 ?? null;

    return {
      type: "Feature",
      properties: {
        id: cell.id,
        aqi: usAqi !== null ? usAqi : "No estimate",
        pm25: pm25 !== null ? pm25.toFixed(1) : "—",
        color: getAqiMapFillColor(usAqi),
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [cell.bounds.west, cell.bounds.south],
            [cell.bounds.east, cell.bounds.south],
            [cell.bounds.east, cell.bounds.north],
            [cell.bounds.west, cell.bounds.north],
            [cell.bounds.west, cell.bounds.south],
          ],
        ],
      },
    };
  });

  return { type: "FeatureCollection", features };
}

export function buildFiresGeoJson(fires: FireDetection[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = fires.map((detection) => ({
    type: "Feature",
    properties: {
      id: detection.id,
      observedAt: detection.observedAt,
      frp: detection.frp,
      source: detection.source,
    },
    geometry: {
      type: "Point",
      coordinates: [detection.lon, detection.lat],
    },
  }));

  return { type: "FeatureCollection", features };
}

export function upsertRegionalGridLayers(
  map: maplibregl.Map,
  geoJsonData: GeoJSON.FeatureCollection
): void {
  const existingSource = map.getSource(REGIONAL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(geoJsonData);
    return;
  }

  map.addSource(REGIONAL_SOURCE_ID, { type: "geojson", data: geoJsonData });
  map.addLayer({
    id: REGIONAL_FILL_LAYER_ID,
    type: "fill",
    source: REGIONAL_SOURCE_ID,
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.8,
    },
  });
  map.addLayer({
    id: REGIONAL_BORDER_LAYER_ID,
    type: "line",
    source: REGIONAL_SOURCE_ID,
    paint: {
      "line-color": "#334155",
      "line-width": 1.5,
      "line-dasharray": [2, 2],
    },
  });
}

function buildFirePopupHtml(observedAtRaw: unknown, timeZone: string): string {
  const observedAt = typeof observedAtRaw === "string" ? observedAtRaw : "";
  const localObsTime = observedAt ? formatHourlyTime(observedAt, timeZone) : "Recent";
  const utcObsTime = observedAt ? `${new Date(observedAt).toISOString().slice(11, 16)} UTC` : "UTC";

  return `<div style="font-family:sans-serif;font-size:12px;line-height:1.4">
    <strong>NASA FIRMS Active Fire</strong><br/>
    Observed: ${localObsTime} (${utcObsTime})<br/>
    Source: Satellite Detection (VIIRS)<br/>
    <span style="color:#94a3b8;font-size:10px">Thermal anomaly detected; biomass material unverified</span>
  </div>`;
}

export function syncFiresLayer(
  map: maplibregl.Map,
  firesGeoJson: GeoJSON.FeatureCollection | null,
  showFires: boolean,
  getTimeZone: () => string
): void {
  if (!firesGeoJson || !showFires) {
    if (map.getLayer(FIRES_LAYER_ID)) map.removeLayer(FIRES_LAYER_ID);
    if (map.getSource(FIRES_SOURCE_ID)) map.removeSource(FIRES_SOURCE_ID);
    return;
  }

  const existingSource = map.getSource(FIRES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(firesGeoJson);
    return;
  }

  map.addSource(FIRES_SOURCE_ID, { type: "geojson", data: firesGeoJson });
  map.addLayer({
    id: FIRES_LAYER_ID,
    type: "circle",
    source: FIRES_SOURCE_ID,
    paint: {
      "circle-radius": 7,
      "circle-color": "#ea580c",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.on("click", FIRES_LAYER_ID, (clickEvent) => {
    const firstFeature = clickEvent.features?.[0];
    if (!firstFeature?.properties || firstFeature.geometry.type !== "Point") {
      return;
    }
    const pointCoordinates = firstFeature.geometry.coordinates as [number, number];
    new maplibregl.Popup()
      .setLngLat(pointCoordinates)
      .setHTML(buildFirePopupHtml(firstFeature.properties.observedAt, getTimeZone()))
      .addTo(map);
  });
}

export function syncSmokeTrajectoryLayer(
  map: maplibregl.Map,
  smokePaths: GeoJSON.FeatureCollection | null,
  showHistoricalSmoke: boolean
): void {
  if (!smokePaths || !showHistoricalSmoke) {
    if (map.getLayer(SMOKE_LAYER_ID)) map.removeLayer(SMOKE_LAYER_ID);
    if (map.getSource(SMOKE_SOURCE_ID)) map.removeSource(SMOKE_SOURCE_ID);
    return;
  }

  const existingSource = map.getSource(SMOKE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(smokePaths);
    return;
  }

  map.addSource(SMOKE_SOURCE_ID, { type: "geojson", data: smokePaths });
  map.addLayer({
    id: SMOKE_LAYER_ID,
    type: "line",
    source: SMOKE_SOURCE_ID,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#38bdf8",
      "line-width": 3,
      "line-dasharray": [2, 2],
    },
  });
}

export function toggleExtrudedBuildingsLayer(map: maplibregl.Map, enable3D: boolean): void {
  if (!map.isStyleLoaded()) {
    return;
  }

  if (!map.getLayer(BUILDING_EXTRUSION_LAYER_ID) && map.getSource("openmaptiles")) {
    try {
      map.addLayer({
        id: BUILDING_EXTRUSION_LAYER_ID,
        source: "openmaptiles",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#1e293b",
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            0,
            14.5,
            ["coalesce", ["get", "render_height"], 12],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.7,
        },
      });
    } catch (layerError: unknown) {
      console.warn("3D building extrusion layer unavailable in current vector style:", layerError);
    }
    return;
  }

  if (map.getLayer(BUILDING_EXTRUSION_LAYER_ID)) {
    map.setLayoutProperty(BUILDING_EXTRUSION_LAYER_ID, "visibility", enable3D ? "visible" : "none");
  }
}
