"use client";

import React, { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Map, Box, Loader2 } from "lucide-react";
import { AirQualityViewProps, MapView } from "@/lib/immersive/types";
import { AirQualityMap } from "./air-quality-map";
import { ForecastTimeline } from "./forecast-timeline";

// On-demand dynamic import of React Three Fiber 3D viewer (SSR disabled)
const ImmersiveCityView = dynamic(
  () =>
    import("./immersive/immersive-city-view").then(
      (mod) => mod.ImmersiveCityView
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[540px] bg-slate-950 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-300">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <span className="text-sm font-medium">Loading Immersive 3D City Engine...</span>
        <span className="text-xs text-slate-400 font-mono">Initializing Three.js &amp; 3D Tiles pipeline</span>
      </div>
    ),
  }
);

export function AirQualityView({
  center,
  placeLabel,
  forecast,
  selectedInstant,
  onSelectInstant,
  onSelectCoordinate,
  onBuildPlan,
}: AirQualityViewProps) {
  const [viewMode, setViewMode] = useState<MapView>("map");
  const immersiveTabRef = useRef<HTMLButtonElement>(null);

  const handleBackToMapWithFocus = useCallback(() => {
    setViewMode("map");
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        immersiveTabRef.current?.focus();
      });
    }
  }, []);

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Main Mode Switcher Bar */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs">
          <button
            type="button"
            aria-pressed={viewMode === "map"}
            onClick={() => setViewMode("map")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              viewMode === "map"
                ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow"
                : "text-slate-300 hover:text-white hover:bg-slate-800/70"
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>2D Regional Map</span>
          </button>

          <button
            ref={immersiveTabRef}
            type="button"
            aria-pressed={viewMode === "immersive"}
            onClick={() => setViewMode("immersive")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              viewMode === "immersive"
                ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow"
                : "text-slate-300 hover:text-white hover:bg-slate-800/70"
            }`}
          >
            <Box className="w-3.5 h-3.5 text-sky-300" />
            <span>Immersive 3D City</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-sky-950 text-sky-200 border border-sky-800/50">
              New
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>Viewing:</span>
          <span className="font-semibold text-slate-200">{placeLabel}</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-slate-400">
            {center.lat.toFixed(2)}°, {center.lon.toFixed(2)}°
          </span>
        </div>
      </div>

      {/* Main View Area (Mounts only ONE active viewer to avoid canvas / GPU duplication) */}
      <div className="relative w-full">
        {viewMode === "map" ? (
          <AirQualityMap
            center={center}
            forecast={forecast}
            onOpenPlan={onBuildPlan}
            onSelectCoordinate={onSelectCoordinate}
            selectedInstant={selectedInstant}
            onSelectInstant={onSelectInstant}
            hideTimeline={true}
          />
        ) : (
          <ImmersiveCityView
            center={center}
            placeLabel={placeLabel}
            forecast={forecast}
            selectedInstant={selectedInstant}
            onSelectCoordinate={onSelectCoordinate}
            onBackToMap={handleBackToMapWithFocus}
            onBuildPlan={onBuildPlan}
          />
        )}
      </div>

      {/* Shared Unified 24-Hour Timeline & AQI Scale across both 2D and 3D views */}
      <ForecastTimeline
        forecast={forecast}
        selectedInstant={selectedInstant}
        onSelectInstant={onSelectInstant}
      />
    </div>
  );
}
