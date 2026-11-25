"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertCircle } from "lucide-react";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import { Forecast } from "@/lib/forecast/types";
import {
  buildFiresGeoJson,
  buildRegionalGridGeoJson,
  syncFiresLayer,
  syncSmokeTrajectoryLayer,
  toggleExtrudedBuildingsLayer,
  upsertRegionalGridLayers,
} from "@/lib/map/map-layers";
import { useActiveFires } from "@/hooks/use-active-fires";
import { useHistoricalSmoke } from "@/hooks/use-historical-smoke";
import { useRegionalGrid } from "@/hooks/use-regional-grid";
import { HistoricalSmokeDrawer } from "./historical-smoke-drawer";
import { MapScrubberLegend } from "./map-scrubber-legend";
import { MapToolbar } from "./map-toolbar";

interface AirQualityMapProps {
  center: { lat: number; lon: number };
  forecast: Forecast | null;
  onOpenPlan?: () => void;
  onSelectCoordinate?: (coords: { lat: number; lon: number }) => void;
  selectedInstant?: string | null;
  onSelectInstant?: (instant: string) => void;
  hideTimeline?: boolean;
}

/**
 * Interactive 2D/3D MapLibre regional air-quality viewer with active fires and historical smoke overlays.
 */
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
  const initialCenterRef = useRef(center);
  const selectCoordinateCallbackRef = useRef(onSelectCoordinate);
  const timeZoneRef = useRef(forecast?.timeZone || "UTC");

  const [is3D, setIs3D] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFires, setShowFires] = useState(true);
  const [showHistoricalSmoke, setShowHistoricalSmoke] = useState(false);

  const hourlySlots = useMemo(() => forecast?.hourly || [], [forecast?.hourly]);
  const activeInstant =
    selectedInstant || (hourlySlots[sliderIndex] ? hourlySlots[sliderIndex].at : null);

  const { gridData, gridNotice } = useRegionalGrid(center);
  const { fires, firesNotice } = useActiveFires(center, showFires);
  const { smokeData, smokeNotice } = useHistoricalSmoke(showHistoricalSmoke);

  const firesGeoJson = useMemo(() => (fires ? buildFiresGeoJson(fires) : null), [fires]);
  const overlayStatusMessage = gridNotice || firesNotice || smokeNotice || "";

  useEffect(() => {
    selectCoordinateCallbackRef.current = onSelectCoordinate;
  }, [onSelectCoordinate]);

  useEffect(() => {
    timeZoneRef.current = forecast?.timeZone || "UTC";
  }, [forecast?.timeZone]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }

    const startCenter = initialCenterRef.current;
    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainerRef.current,
        style: "https://tiles.openfreemap.org/styles/bright",
        center: [startCenter.lon, startCenter.lat],
        zoom: 9,
        pitch: 0,
        attributionControl: false,
      });

      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");
      mapInstance.on("error", (mapEvent) => {
        if (mapEvent.error?.message?.includes("WebGL")) {
          setMapError("WebGL context unavailable. Please use the forecast list.");
        }
      });
      mapInstance.on("click", (clickEvent) => {
        const { lng, lat } = clickEvent.lngLat;
        selectCoordinateCallbackRef.current?.({ lat, lon: lng });
      });

      mapRef.current = mapInstance;
      return () => {
        mapInstance.remove();
        mapRef.current = null;
      };
    } catch (initError: unknown) {
      const message = initError instanceof Error ? initError.message : "Map initialization failed";
      setMapError(`Map preview unavailable (${message}). Regional list remains functional.`);
      return undefined;
    }
  }, []);

  useEffect(() => {
    mapRef.current?.flyTo({
      center: [center.lon, center.lat],
      zoom: 9,
      essential: true,
    });
  }, [center.lat, center.lon]);

  const handleToggle3D = useCallback(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return;
    }
    const next3D = !is3D;
    setIs3D(next3D);
    mapInstance.easeTo({
      pitch: next3D ? 55 : 0,
      bearing: next3D ? 20 : 0,
      duration: 1000,
    });
    toggleExtrudedBuildingsLayer(mapInstance, next3D);
  }, [is3D]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !mapInstance.isStyleLoaded() || gridData.length === 0) {
      return;
    }
    upsertRegionalGridLayers(mapInstance, buildRegionalGridGeoJson(gridData, activeInstant));
  }, [gridData, activeInstant]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !mapInstance.isStyleLoaded()) {
      return;
    }
    syncFiresLayer(mapInstance, firesGeoJson, showFires, () => timeZoneRef.current);
  }, [firesGeoJson, showFires]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !mapInstance.isStyleLoaded()) {
      return;
    }
    syncSmokeTrajectoryLayer(mapInstance, smokeData?.paths || null, showHistoricalSmoke);
  }, [smokeData, showHistoricalSmoke]);

  useEffect(() => {
    if (!isPlaying || hourlySlots.length === 0) {
      return;
    }
    const timer = setInterval(() => {
      setSliderIndex((previousIndex) => {
        const nextIndex = (previousIndex + 1) % hourlySlots.length;
        if (onSelectInstant && hourlySlots[nextIndex]) {
          onSelectInstant(hourlySlots[nextIndex].at);
        }
        return nextIndex;
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [isPlaying, hourlySlots, onSelectInstant]);

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextIndex = parseInt(event.target.value, 10);
    setSliderIndex(nextIndex);
    if (hourlySlots[nextIndex] && onSelectInstant) {
      onSelectInstant(hourlySlots[nextIndex].at);
    }
  };

  const currentDisplayTime =
    activeInstant && forecast?.timeZone
      ? formatHourlyTime(activeInstant, forecast.timeZone)
      : "Current conditions";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {overlayStatusMessage && (
        <div role="status" aria-live="polite" className="sr-only">
          {overlayStatusMessage}
        </div>
      )}

      <MapToolbar
        currentDisplayTime={currentDisplayTime}
        showFires={showFires}
        showHistoricalSmoke={showHistoricalSmoke}
        is3D={is3D}
        onToggleFires={() => setShowFires((prev) => !prev)}
        onToggleHistoricalSmoke={() => setShowHistoricalSmoke((prev) => !prev)}
        onToggle3D={handleToggle3D}
        onOpenPlan={onOpenPlan}
      />

      {showHistoricalSmoke && smokeData && (
        <HistoricalSmokeDrawer onClose={() => setShowHistoricalSmoke(false)} />
      )}

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

      {!hideTimeline && (
        <MapScrubberLegend
          hourlySlots={hourlySlots}
          sliderIndex={sliderIndex}
          isPlaying={isPlaying}
          timeZone={forecast?.timeZone || "UTC"}
          currentDisplayTime={currentDisplayTime}
          onTogglePlay={() => setIsPlaying((prev) => !prev)}
          onSliderChange={handleSliderChange}
        />
      )}
    </div>
  );
}
