"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bounds, RegionalCell, getCellValueAtInstant } from "@/lib/map/regional-cells";
import { Forecast, AirSample, getAqiCategory } from "@/lib/forecast/types";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import { Layers, Box, Play, Pause, ChevronRight, AlertCircle, ArrowUpRight } from "lucide-react";

interface AirQualityMapProps {
  center: { lat: number; lon: number };
  forecast: Forecast | null;
  onOpenPlan?: () => void;
  onSelectCoordinate?: (coords: { lat: number; lon: number }) => void;
  selectedInstant?: string | null;
  onSelectInstant?: (instant: string) => void;
  // Optional layers for Milestone C
  fireGeoJson?: GeoJSON.FeatureCollection | null;
  smokeGeoJson?: GeoJSON.FeatureCollection | null;
}

export function AirQualityMap({
  center,
  forecast,
  onOpenPlan,
  onSelectCoordinate,
  selectedInstant,
  onSelectInstant,
  fireGeoJson,
  smokeGeoJson,
}: AirQualityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [is3D, setIs3D] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Grid cells and their pre-fetched forecasts
  const [gridData, setGridData] = useState<
    { cell: RegionalCell; forecast: Forecast }[]
  >([]);

  const hourlySlots = React.useMemo(() => forecast?.hourly || [], [forecast?.hourly]);
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

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: "https://tiles.openfreemap.org/styles/bright",
        center: [center.lon, center.lat],
        zoom: 10,
        pitch: is3D ? 55 : 0,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");

      map.on("error", (e) => {
        // Ignore tile 404s, catch fatal WebGL errors
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
        zoom: 10,
        essential: true,
      });
    }
  }, [center.lat, center.lon]);

  // Toggle 3D pitch and building extrusion
  const toggle3D = useCallback(() => {
    if (!mapRef.current) return;
    const next3D = !is3D;
    setIs3D(next3D);

    mapRef.current.easeTo({
      pitch: next3D ? 55 : 0,
      bearing: next3D ? 20 : 0,
      duration: 1000,
    });
  }, [is3D]);

  // Update GeoJSON layer for regional forecast cells when activeInstant or gridData changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "regional-aqi-cells";
    const layerId = "regional-aqi-fill";
    const borderLayerId = "regional-aqi-borders";

    // Build GeoJSON features for each regional cell colored by AQI at activeInstant
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = gridData.map((item) => {
      const { cell, forecast: cellForecast } = item;
      const sample = activeInstant
        ? getCellValueAtInstant(cellForecast, activeInstant)
        : cellForecast.current;

      const aqi = sample?.usAqi ?? null;
      const pm25 = sample?.pm25 ?? null;

      // Color mapping
      let color = "rgba(100, 116, 139, 0.25)"; // default slate
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

    if (!fireGeoJson) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(fireGeoJson);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: fireGeoJson,
      });

      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 6,
          "circle-color": "#f97316",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, [fireGeoJson]);

  // Render Smoke Trajectory Path Lines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "smoke-source";
    const layerId = "smoke-layer";

    if (!smokeGeoJson) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(smokeGeoJson);
    } else {
      map.addSource(sourceId, {
        type: "geojson",
        data: smokeGeoJson,
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
          "line-dasharray": [1.5, 1.5],
        },
      });
    }
  }, [smokeGeoJson]);

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

  const currentDisplayTime = activeInstant && forecast?.timeZone
    ? formatHourlyTime(activeInstant, forecast.timeZone)
    : "Current conditions";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Top Map Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-700 shadow-md">
          <span className="text-xs font-semibold text-slate-200">
            Regional PM₂.₅ & AQI Overlay
          </span>
          <span className="text-[11px] font-mono text-emerald-400">
            {currentDisplayTime}
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={toggle3D}
            aria-label="Toggle 3D perspective view"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border backdrop-blur transition shadow-md ${
              is3D
                ? "bg-emerald-600 text-white border-emerald-500 shadow-emerald-950"
                : "bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800"
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>{is3D ? "3D Active" : "3D View"}</span>
          </button>

          {onOpenPlan && (
            <button
              type="button"
              onClick={onOpenPlan}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30 backdrop-blur shadow-md transition"
            >
              <span>Build my smog plan</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

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
                <span>Now ({hourlySlots[0] ? formatHourlyTime(hourlySlots[0].at, forecast?.timeZone || "UTC") : ""})</span>
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

        {/* Consistent AQI Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
          <span className="text-slate-400 font-medium">US AQI Legend:</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              Good (0-50)
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded bg-yellow-500 inline-block" />
              Moderate (51-100)
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded bg-orange-500 inline-block" />
              Sensitive (101-150)
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
              Unhealthy (151-200)
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded bg-purple-500 inline-block" />
              Very Unhealthy (201-300)
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-3 rounded bg-red-950 border border-red-500 inline-block" />
              Hazardous (301+)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
