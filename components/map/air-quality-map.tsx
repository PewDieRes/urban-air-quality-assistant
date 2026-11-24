"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bounds, RegionalCell, getCellValueAtInstant } from "@/lib/map/regional-cells";
import { Forecast, AirSample, getAqiCategory } from "@/lib/forecast/types";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import { SmokePathSet } from "@/lib/smoke/types";
import {
  Layers,
  Box,
  Play,
  Pause,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  Flame,
  Wind,
  Info,
  X,
} from "lucide-react";

interface AirQualityMapProps {
  center: { lat: number; lon: number };
  forecast: Forecast | null;
  onOpenPlan?: () => void;
  onSelectCoordinate?: (coords: { lat: number; lon: number }) => void;
  selectedInstant?: string | null;
  onSelectInstant?: (instant: string) => void;
  hideTimeline?: boolean;
}

export function AirQualityMap({
  center,
  forecast,
  onOpenPlan,
  onSelectCoordinate,
  selectedInstant,
  onSelectInstant,
  hideTimeline = false,
}: AirQualityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [is3D, setIs3D] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Layer toggles
  const [showFires, setShowFires] = useState(true);
  const [showHistoricalSmoke, setShowHistoricalSmoke] = useState(false);
  const [activeSmokeData, setActiveSmokeData] = useState<SmokePathSet | null>(null);
  const [firesGeoJson, setFiresGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);

  // Grid cells and their pre-fetched forecasts
  const [gridData, setGridData] = useState<
    { cell: RegionalCell; forecast: Forecast }[]
  >([]);

  const hourlySlots = useMemo(() => forecast?.hourly || [], [forecast?.hourly]);
  const activeInstant =
    selectedInstant || (hourlySlots[sliderIndex] ? hourlySlots[sliderIndex].at : null);

  // Fetch 3x3 regional grid on significant center change
  useEffect(() => {
    let isCancelled = false;
    async function loadGrid() {
      try {
        const delta = 0.5;
        const bounds: Bounds = {
          west: center.lon - delta,
          south: center.lat - delta,
          east: center.lon + delta,
          north: center.lat + delta,
        };
        const res = await fetch(
          `/api/forecast/grid?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}&lat=${center.lat}&lon=${center.lon}`
        );
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setGridData(data.grid || []);
        }
      } catch (err) {
        // Fallback: keep existing grid or focal forecast
      }
    }
    loadGrid();
    return () => {
      isCancelled = true;
    };
  }, [center.lat, center.lon]);

  // Fetch recent fire detections from /api/fires
  useEffect(() => {
    let isCancelled = false;
    async function loadFires() {
      try {
        const delta = 2.0; // broader bbox for regional fires upwind
        const bounds: Bounds = {
          west: center.lon - delta,
          south: center.lat - delta,
          east: center.lon + delta,
          north: center.lat + delta,
        };
        const res = await fetch(
          `/api/fires?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
        );
        if (res.ok && !isCancelled) {
          const data = await res.json();
          const fires = data.fires || [];
          const features: GeoJSON.Feature<GeoJSON.Point>[] = fires.map((f: any) => ({
            type: "Feature",
            properties: {
              id: f.id,
              observedAt: f.observedAt,
              frp: f.frp,
              source: f.source,
            },
            geometry: {
              type: "Point",
              coordinates: [f.lon, f.lat],
            },
          }));
          setFiresGeoJson({ type: "FeatureCollection", features });
        }
      } catch (e) {
        // Gracefully ignore fire fetch failures
      }
    }
    if (showFires) {
      loadFires();
    } else {
      setFiresGeoJson(null);
    }
    return () => {
      isCancelled = true;
    };
  }, [center.lat, center.lon, showFires]);

  // Fetch or clear historical smoke case
  useEffect(() => {
    let isCancelled = false;
    async function loadHistoricalSmoke() {
      try {
        const res = await fetch("/smoke/historical.geojson");
        if (res.ok && !isCancelled) {
          const data = await res.json();
          const smokeSet: SmokePathSet = {
            metadata: data.metadata,
            paths: {
              type: "FeatureCollection",
              features: data.features,
            },
          };
          setActiveSmokeData(smokeSet);
        }
      } catch (e) {
        console.error("Failed to load historical smoke case:", e);
      }
    }
    if (showHistoricalSmoke) {
      loadHistoricalSmoke();
    } else {
      setActiveSmokeData(null);
    }
    return () => {
      isCancelled = true;
    };
  }, [showHistoricalSmoke]);

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: "https://tiles.openfreemap.org/styles/bright",
        center: [center.lon, center.lat],
        zoom: 9,
        pitch: is3D ? 55 : 0,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("error", (e) => {
        if (e.error?.message?.includes("WebGL")) {
          setMapError("WebGL context unavailable. Please use the forecast list.");
        }
      });

      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        if (onSelectCoordinate) {
          onSelectCoordinate({ lat, lon: lng });
        }
      });

      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Map initialization failed";
      setMapError(`Map preview unavailable (${msg}). Regional list remains functional.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Fly to center when coordinate changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [center.lon, center.lat],
        zoom: 9,
        essential: true,
      });
    }
  }, [center.lat, center.lon]);

  // Toggle 3D pitch and building extrusion
  const toggle3D = useCallback(() => {
    if (!mapRef.current) return;
    const next3D = !is3D;
    setIs3D(next3D);

    const map = mapRef.current;
    map.easeTo({
      pitch: next3D ? 55 : 0,
      bearing: next3D ? 20 : 0,
      duration: 1000,
    });

    if (map.isStyleLoaded()) {
      const buildingLayerId = "3d-buildings-extrusion";
      if (!map.getLayer(buildingLayerId) && map.getSource("openmaptiles")) {
        try {
          map.addLayer({
            id: buildingLayerId,
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
        } catch {
          // Graceful fallback if style doesn't have building vector layer
        }
      } else if (map.getLayer(buildingLayerId)) {
        map.setLayoutProperty(buildingLayerId, "visibility", next3D ? "visible" : "none");
      }
    }
  }, [is3D]);

  // Update GeoJSON layer for regional forecast cells
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "regional-aqi-cells";
    const layerId = "regional-aqi-fill";
    const borderLayerId = "regional-aqi-borders";

    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = gridData.map((item) => {
      const { cell, forecast: cellForecast } = item;
      const sample = activeInstant
        ? getCellValueAtInstant(cellForecast, activeInstant)
        : cellForecast.current;

      const aqi = sample?.usAqi ?? null;
      const pm25 = sample?.pm25 ?? null;

      let color = "rgba(100, 116, 139, 0.25)";
      if (aqi !== null) {
        if (aqi <= 50) color = "rgba(16, 185, 129, 0.4)";
        else if (aqi <= 100) color = "rgba(234, 179, 8, 0.4)";
        else if (aqi <= 150) color = "rgba(249, 115, 22, 0.45)";
        else if (aqi <= 200) color = "rgba(244, 63, 94, 0.5)";
        else if (aqi <= 300) color = "rgba(168, 85, 247, 0.55)";
        else color = "rgba(136, 19, 55, 0.65)";
      }

      return {
        type: "Feature",
        properties: {
          id: cell.id,
          aqi: aqi !== null ? aqi : "No estimate",
          pm25: pm25 !== null ? pm25.toFixed(1) : "—",
          color,
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

    const geojsonData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: geojsonData,
      });

      map.addLayer({
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.8,
        },
      });

      map.addLayer({
        id: borderLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#334155",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });
    }
  }, [gridData, activeInstant]);

  // Render NASA FIRMS Active Fires Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "fires-source";
    const layerId = "fires-layer";

    if (!firesGeoJson || !showFires) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(firesGeoJson);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: firesGeoJson,
      });

      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 7,
          "circle-color": "#ea580c",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", layerId, (e) => {
        const props = e.features?.[0]?.properties;
        if (props) {
          const coords = (e.features?.[0]?.geometry as any).coordinates;
          const localObsTime = props.observedAt
            ? formatHourlyTime(props.observedAt, forecast?.timeZone || "UTC")
            : "Recent";
          const utcObsTime = props.observedAt
            ? new Date(props.observedAt).toISOString().slice(11, 16) + " UTC"
            : "UTC";
          new maplibregl.Popup()
            .setLngLat(coords)
            .setHTML(
              `<div style="font-family:sans-serif;font-size:12px;line-height:1.4">
                <strong>NASA FIRMS Active Fire</strong><br/>
                Observed: ${localObsTime} (${utcObsTime})<br/>
                Source: Satellite Detection (VIIRS)<br/>
                <span style="color:#94a3b8;font-size:10px">Thermal anomaly detected; biomass material unverified</span>
              </div>`
            )
            .addTo(map);
        }
      });
    }
  }, [firesGeoJson, showFires, forecast?.timeZone]);

  // Render Smoke Trajectory Path Lines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "smoke-source";
    const layerId = "smoke-layer";

    if (!activeSmokeData || !showHistoricalSmoke) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeSmokeData.paths);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: activeSmokeData.paths,
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
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
  }, [activeSmokeData, showHistoricalSmoke]);

  // Animation player for 24h scrubber
  useEffect(() => {
    if (!isPlaying || hourlySlots.length === 0) return;
    const interval = setInterval(() => {
      setSliderIndex((prev) => {
        const next = (prev + 1) % hourlySlots.length;
        if (onSelectInstant && hourlySlots[next]) {
          onSelectInstant(hourlySlots[next].at);
        }
        return next;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isPlaying, hourlySlots, onSelectInstant]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    setSliderIndex(idx);
    if (hourlySlots[idx] && onSelectInstant) {
      onSelectInstant(hourlySlots[idx].at);
    }
  };

  const currentDisplayTime =
    activeInstant && forecast?.timeZone
      ? formatHourlyTime(activeInstant, forecast.timeZone)
      : "Current conditions";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Top Map Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-700 shadow-md">
          <span className="text-xs font-semibold text-slate-200">
            Regional PM₂.₅ Overlay
          </span>
          <span className="text-[11px] font-mono text-emerald-400">
            {currentDisplayTime}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto pr-12 md:pr-0">
          {/* Active Fires Toggle */}
          <button
            type="button"
            onClick={() => setShowFires(!showFires)}
            aria-label="Toggle NASA FIRMS active fire detections"
            className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border backdrop-blur transition shadow-sm ${
              showFires
                ? "bg-amber-600/90 text-white border-amber-500 shadow-amber-950"
                : "bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800"
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-300" />
            <span>Fires</span>
          </button>

          {/* Historical Smoke Case Toggle */}
          <button
            type="button"
            onClick={() => setShowHistoricalSmoke(!showHistoricalSmoke)}
            aria-label="Toggle historical smoke case"
            className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border backdrop-blur transition shadow-sm ${
              showHistoricalSmoke
                ? "bg-sky-600/90 text-white border-sky-400 shadow-sky-950"
                : "bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800"
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-sky-300" />
            <span>Historical Smoke</span>
          </button>

          <button
            type="button"
            onClick={toggle3D}
            aria-label={is3D ? "Switch to 2D flat view" : "Switch to 3D perspective with extruded buildings"}
            className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border backdrop-blur transition shadow-sm ${
              is3D
                ? "bg-emerald-600 text-white border-emerald-500 shadow-emerald-950"
                : "bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800"
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>{is3D ? "2D Flat View" : "3D Buildings"}</span>
          </button>

          {onOpenPlan && (
            <button
              type="button"
              onClick={onOpenPlan}
              className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30 backdrop-blur shadow-sm transition"
            >
              <span>Build my smog plan</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Historical Smoke Case Metadata Drawer */}
      {showHistoricalSmoke && activeSmokeData && (
        <div className="absolute bottom-28 left-4 right-4 md:left-auto md:right-4 md:w-96 z-20 bg-slate-900/95 border border-sky-500/40 rounded-xl p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
              <Wind className="w-4 h-4" />
              <span>Possible smoke paths</span>
            </div>
            <button
              type="button"
              onClick={() => setShowHistoricalSmoke(false)}
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 space-y-1.5 text-xs text-slate-300">
            <div>
              <span className="text-slate-400">Date & Case:</span>{" "}
              <strong>November 3, 2024 (08:00 UTC)</strong>
            </div>
            <div>
              <span className="text-slate-400">Model:</span> NOAA HYSPLIT (Forward Trajectory)
            </div>
            <div>
              <span className="text-slate-400">Starting Heights:</span>{" "}
              <span className="font-mono text-sky-300">100m, 500m, 1000m AGL</span>
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <span>
                Path estimates where air may travel. It does not establish smoke concentrations or source contribution. Citywide PM₂.₅ is displayed separately in the forecast.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Map canvas container */}
      <div
        ref={mapContainerRef}
        className="w-full h-[450px] bg-slate-950"
        style={{ minHeight: "450px" }}
      />

      {mapError && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur flex flex-col items-center justify-center p-6 text-center z-20">
          <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
          <h3 className="text-base font-bold text-slate-100">Interactive Map Notice</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1">{mapError}</p>
        </div>
      )}

      {/* Bottom Controls Bar: 24-Hour Slider + Consistent Legend */}
      {!hideTimeline && (
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex flex-col gap-3">
          {/* Scrubber slider */}
          {hourlySlots.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? "Pause forecast animation" : "Play forecast animation"}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <div className="flex-1 flex flex-col gap-1">
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>
                    Now ({hourlySlots[0] ? formatHourlyTime(hourlySlots[0].at, forecast?.timeZone || "UTC") : ""})
                  </span>
                  <span className="font-semibold text-emerald-400">{currentDisplayTime}</span>
                  <span>+24h</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={hourlySlots.length - 1}
                  value={sliderIndex}
                  onChange={handleSliderChange}
                  aria-label="24-hour forecast time scrubber"
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          )}

          {/* PM2.5 and AQI Legends */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/80 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-300 font-medium">PM₂.₅ Pollution Overlay Scale (µg/m³):</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                  0–12 (Good)
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-yellow-500 inline-block" />
                  12–35 (Moderate)
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-orange-500 inline-block" />
                  35–55 (Sensitive)
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
                  55–150 (Unhealthy)
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-purple-500 inline-block" />
                  150–250 (Very Unhealthy)
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded bg-red-950 border border-red-500 inline-block" />
                  250+ (Hazardous)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 border-t border-slate-800/50 pt-1">
              <span className="text-slate-500 font-medium">US AQI Reference Scale:</span>
              <div className="flex flex-wrap items-center gap-3">
                <span>0-50</span>
                <span>51-100</span>
                <span>101-150</span>
                <span>151-200</span>
                <span>201-300</span>
                <span>301+</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
