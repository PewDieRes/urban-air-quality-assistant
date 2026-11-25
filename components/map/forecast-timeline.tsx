"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Play, Pause, Clock } from "lucide-react";
import { Forecast, AirSample } from "@/lib/forecast/types";
import { formatHourlyTime, formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";

interface ForecastTimelineProps {
  forecast: Forecast | null;
  selectedInstant: string | null;
  onSelectInstant: (instant: string) => void;
  className?: string;
  showLegend?: boolean;
}

export function ForecastTimeline({
  forecast,
  selectedInstant,
  onSelectInstant,
  className = "",
  showLegend = true,
}: ForecastTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const hourlySlots: AirSample[] = useMemo(() => {
    return forecast?.hourly?.slice(0, 24) || [];
  }, [forecast?.hourly]);

  const currentIndex = useMemo(() => {
    if (!selectedInstant || hourlySlots.length === 0) return 0;
    const idx = hourlySlots.findIndex((s) => s.at === selectedInstant);
    return idx >= 0 ? idx : 0;
  }, [selectedInstant, hourlySlots]);

  const currentSample = hourlySlots[currentIndex] || null;

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying || hourlySlots.length === 0) return;
    const interval = setInterval(() => {
      const nextIdx = (currentIndex + 1) % hourlySlots.length;
      if (hourlySlots[nextIdx]) {
        onSelectInstant(hourlySlots[nextIdx].at);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, hourlySlots, onSelectInstant]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      if (hourlySlots[idx]) {
        onSelectInstant(hourlySlots[idx].at);
      }
    },
    [hourlySlots, onSelectInstant]
  );

  const currentDisplayTime = useMemo(() => {
    if (!currentSample) return "--:--";
    const formatted = formatHourlyTimeWithDate(currentSample.at, forecast?.timeZone || "UTC");
    return typeof formatted === "string" ? formatted : formatted.full;
  }, [currentSample, forecast?.timeZone]);

  const pm25Value = currentSample?.pm25 != null ? Math.round(currentSample.pm25) : "--";
  const aqiValue = currentSample?.usAqi != null ? Math.round(currentSample.usAqi) : "--";

  return (
    <div className={`p-4 bg-slate-900/95 border-t border-slate-800 flex flex-col gap-3 ${className}`}>
      {hourlySlots.length > 0 ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? "Pause forecast animation" : "Play forecast animation"}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
              <span className="truncate">
                Now ({hourlySlots[0] ? formatHourlyTime(hourlySlots[0].at, forecast?.timeZone || "UTC") : ""})
              </span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 inline text-emerald-400" />
                  {currentDisplayTime}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-200 border border-slate-700">
                  PM₂.₅: <strong className="text-amber-300">{pm25Value}</strong> µg/m³ · AQI:{" "}
                  <strong className="text-sky-300">{aqiValue}</strong>
                </span>
              </div>
              <span>+24h</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, hourlySlots.length - 1)}
              value={currentIndex}
              onChange={handleSliderChange}
              aria-label="24-hour forecast time scrubber"
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 py-1 font-mono">
          Forecast timeline loading for selected coordinates...
        </div>
      )}

      {showLegend && (
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
          {/* PM2.5 Pollution Scale in µg/m³ matching overlay colors */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-300 font-medium">PM₂.₅ Pollution Scale (µg/m³):</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                0–12 (Good)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
                12–35 (Moderate)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                35–55 (Sensitive)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                55–150 (Unhealthy)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                150–250 (Very Unhealthy)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-900 inline-block" />
                250+ (Hazardous)
              </span>
            </div>
          </div>

          {/* US AQI Reference scale */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-300 border-t border-slate-800/50 pt-1">
            <span className="text-slate-300 font-medium">US AQI Index (0–500 scale):</span>
            <div className="flex flex-wrap items-center gap-3 text-slate-300">
              <span>0–50 Good</span>
              <span>51–100 Moderate</span>
              <span>101–150 Sensitive</span>
              <span>151–200 Unhealthy</span>
              <span>201–300 Very Unhealthy</span>
              <span>301+ Hazardous</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
