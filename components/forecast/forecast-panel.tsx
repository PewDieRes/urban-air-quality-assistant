"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Forecast, AirSample, getAqiCategory } from "@/lib/forecast/types";
import { formatHourlyTimeWithDate, resetTimeFormatTracker } from "@/lib/forecast/open-meteo";
import { Wind, AlertTriangle, RefreshCw, Clock, Info, ArrowUpRight, Calendar } from "lucide-react";

interface ForecastPanelProps {
  lat: number;
  lon: number;
  locationName: string;
  onOpenPlan?: () => void;
  onSelectHour?: (sample: AirSample) => void;
  selectedInstant?: string | null;
}

export function ForecastPanel({
  lat,
  lon,
  locationName,
  onOpenPlan,
  onSelectHour,
  selectedInstant,
}: ForecastPanelProps) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to retrieve forecast data");
      }
      const data = await res.json();
      setForecast(data.forecast);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to load forecast";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [lat, lon]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const currentAqi = forecast?.current?.usAqi ?? null;
  const currentPm25 = forecast?.current?.pm25 ?? null;
  const currentCategory = getAqiCategory(currentAqi);

  // Reset time tracker before rendering hourly series to ensure accurate midnight crossing detection
  resetTimeFormatTracker();

  return (
    <section
      aria-labelledby="forecast-heading"
      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md"
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30">
              Regional model estimate
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Source: Open-Meteo
            </span>
          </div>
          <h2
            id="forecast-heading"
            className="text-lg font-bold text-slate-100 mt-1"
          >
            Air Quality in {locationName}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {onOpenPlan && (
            <button
              type="button"
              onClick={onOpenPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-950 transition"
            >
              <span>Build my smog plan</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={fetchForecast}
            disabled={isLoading}
            aria-label="Refresh forecast"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && !forecast && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          <p className="text-sm">Retrieving 24-hour regional air quality model...</p>
        </div>
      )}

      {/* Error / Retry state */}
      {error && (
        <div className="my-6 p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm">Forecast unavailable</div>
              <p className="text-xs text-rose-300 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchForecast}
            className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-xs font-medium rounded-lg border border-rose-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main summary cards */}
      {forecast && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            className={`rounded-xl p-4 border flex flex-col justify-between ${currentCategory.bgClass} ${currentCategory.borderClass}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-300">
                Current US AQI
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/30 text-slate-300">
                0-500 scale
              </span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span
                data-testid="current-aqi-value"
                className={`text-4xl font-extrabold ${currentCategory.colorClass}`}
              >
                {currentAqi !== null ? currentAqi : "—"}
              </span>
              <span className={`text-sm font-semibold ${currentCategory.colorClass}`}>
                {currentCategory.category}
              </span>
            </div>

            <div className="text-xs text-slate-300 leading-snug">
              {currentCategory.description}
            </div>
          </div>

          <div className="col-span-1 md:col-span-2 rounded-xl p-4 bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                Current Fine Particulate (PM₂.₅)
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5" />
                Timezone: {forecast.timeZone}
              </span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span
                data-testid="current-pm25-value"
                className="text-3xl font-bold text-slate-100"
              >
                {currentPm25 !== null ? currentPm25.toFixed(1) : "No estimate"}
              </span>
              <span className="text-sm font-medium text-slate-400">µg/m³</span>
            </div>

            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              Regional estimate based on Copernicus Atmosphere Monitoring Service / Open-Meteo.
            </p>
          </div>
        </div>
      )}

      {/* Accessible 24-hour Hourly Forecast List with midnight date indicator */}
      {forecast && forecast.hourly && forecast.hourly.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400">
              Next 24-Hour Forecast (Local Time: {forecast.timeZone})
            </h3>
            <span className="text-[11px] text-slate-500">
              Click hour to highlight on map
            </span>
          </div>

          <div
            role="region"
            aria-label="Hourly air quality forecast"
            className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-700"
          >
            {forecast.hourly.map((sample, idx) => {
              const cat = getAqiCategory(sample.usAqi);
              const isSelected = selectedInstant === sample.at;
              const timeInfo = formatHourlyTimeWithDate(sample.at, forecast.timeZone);

              return (
                <button
                  key={sample.at || idx}
                  type="button"
                  onClick={() => onSelectHour && onSelectHour(sample)}
                  className={`flex-shrink-0 w-28 p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-between relative ${
                    isSelected
                      ? "ring-2 ring-emerald-400 border-emerald-500 bg-slate-800"
                      : "border-slate-800 hover:border-slate-700 bg-slate-900/80"
                  }`}
                >
                  {timeInfo.isNextDay && (
                    <span className="text-[10px] font-semibold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/40 mb-1 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {timeInfo.date}
                    </span>
                  )}
                  <span className="text-xs text-slate-300 font-medium">
                    {timeInfo.time}
                  </span>

                  <div className="my-1.5 flex flex-col items-center">
                    <span
                      className={`text-lg font-bold leading-none ${cat.colorClass}`}
                    >
                      {sample.usAqi !== null ? sample.usAqi : "—"}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono mt-0.5">
                      AQI
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {sample.pm25 !== null ? `${sample.pm25.toFixed(0)} µg/m³` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
