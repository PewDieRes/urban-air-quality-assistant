"use client";

import React from "react";
import { Forecast, getAqiCategory } from "@/lib/forecast/types";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ForecastSummaryProps {
  forecast: Forecast | null;
  locationName: string;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExploreMap?: () => void;
}

export function ForecastSummary({
  forecast,
  locationName,
  isLoading,
  error,
  onRefresh,
  onExploreMap,
}: ForecastSummaryProps) {
  const currentAqi = forecast?.current?.usAqi ?? null;
  const currentPm25 = forecast?.current?.pm25 ?? null;
  const currentCategory = getAqiCategory(currentAqi);
  const timeZone = forecast?.timeZone || "UTC";
  const updatedLocal = forecast?.current?.at
    ? formatHourlyTime(forecast.current.at, timeZone)
    : "Recently";

  return (
    <section
      aria-labelledby="city-air-heading"
      className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-sm text-stone-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
              City air today
            </span>
            <span className="text-xs text-stone-500 font-mono">
              Updated {updatedLocal} ({timeZone})
            </span>
          </div>
          <h2 id="city-air-heading" className="text-xl font-bold text-stone-900 mt-1">
            Air Quality in {locationName}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Copernicus CAMS regional air quality model · Open-Meteo
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExploreMap && (
            <button
              type="button"
              onClick={onExploreMap}
              className="text-xs font-medium text-teal-800 hover:text-teal-950 px-2.5 py-1 rounded-lg border border-teal-200 bg-teal-50/50 hover:bg-teal-50 transition"
            >
              Explore map →
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh forecast"
            className="p-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 transition disabled:opacity-50"
            title="Refresh forecast"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && !forecast && (
        <div className="py-12 flex flex-col items-center justify-center text-stone-500 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-teal-700" />
          <p className="text-xs">Loading regional forecast data...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="my-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Forecast unavailable: {error}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-2.5 py-1 bg-white hover:bg-rose-100 font-medium rounded border border-rose-300 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Current Metrics: Clear visual hierarchy & compact mobile layout */}
      {forecast && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3.5">
          {/* US AQI Tile */}
          <div
            className={`rounded-xl p-3 sm:p-4 border flex flex-col justify-between ${currentCategory.bgClass} ${currentCategory.borderClass}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] sm:text-xs uppercase font-bold tracking-wider text-stone-600">
                US AQI
              </span>
              <span className={`text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.2 rounded ${currentCategory.badgeClass}`}>
                {currentCategory.category}
              </span>
            </div>

            <div className="my-1.5 flex items-baseline gap-1.5">
              <span
                data-testid="current-aqi-value"
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${currentCategory.colorClass}`}
              >
                {currentAqi !== null ? currentAqi : "—"}
              </span>
              <span className="text-[11px] text-stone-500 font-medium">0–500 scale</span>
            </div>

            <p className="text-[11px] sm:text-xs text-stone-700 leading-snug line-clamp-2">
              {currentCategory.description}
            </p>
          </div>

          {/* PM2.5 Tile */}
          <div className="rounded-xl p-3 sm:p-4 bg-stone-50/70 border border-stone-200/90 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] sm:text-xs uppercase font-bold tracking-wider text-stone-600">
                PM₂.₅ Concentration
              </span>
              <span className="text-[10px] text-stone-500 font-mono">
                Standard units
              </span>
            </div>

            <div className="my-1.5 flex items-baseline gap-1.5">
              <span
                data-testid="current-pm25-value"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900"
              >
                {currentPm25 !== null ? currentPm25.toFixed(1) : "—"}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-stone-600">µg/m³</span>
            </div>

            <p className="text-[11px] sm:text-xs text-stone-600 leading-snug line-clamp-2">
              Primary pollutant driving local smog and respiratory exposure.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
