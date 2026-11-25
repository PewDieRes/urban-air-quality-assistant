import React from "react";
import { Pause, Play } from "lucide-react";
import { formatHourlyTime } from "@/lib/forecast/open-meteo";
import { AirSample } from "@/lib/forecast/types";

interface MapScrubberLegendProps {
  hourlySlots: AirSample[];
  sliderIndex: number;
  isPlaying: boolean;
  timeZone: string;
  currentDisplayTime: string;
  onTogglePlay: () => void;
  onSliderChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const PM25_LEGEND_ITEMS = [
  { swatchClass: "bg-emerald-500", label: "0–12 (Good)" },
  { swatchClass: "bg-yellow-500", label: "12–35 (Moderate)" },
  { swatchClass: "bg-orange-500", label: "35–55 (Sensitive)" },
  { swatchClass: "bg-rose-500", label: "55–150 (Unhealthy)" },
  { swatchClass: "bg-purple-500", label: "150–250 (Very Unhealthy)" },
  { swatchClass: "bg-red-950 border border-red-500", label: "250+ (Hazardous)" },
] as const;

const AQI_SCALE_RANGES = ["0-50", "51-100", "101-150", "151-200", "201-300", "301+"] as const;

/**
 * Standalone map scrubber bar and consistent PM2.5 / US AQI reference legend.
 */
export function MapScrubberLegend({
  hourlySlots,
  sliderIndex,
  isPlaying,
  timeZone,
  currentDisplayTime,
  onTogglePlay,
  onSliderChange,
}: MapScrubberLegendProps) {
  return (
    <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex flex-col gap-3">
      {hourlySlots.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pause forecast animation" : "Play forecast animation"}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <div className="flex-1 flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>
                Now ({hourlySlots[0] ? formatHourlyTime(hourlySlots[0].at, timeZone) : ""})
              </span>
              <span className="font-semibold text-emerald-400">{currentDisplayTime}</span>
              <span>+24h</span>
            </div>
            <input
              type="range"
              min={0}
              max={hourlySlots.length - 1}
              value={sliderIndex}
              onChange={onSliderChange}
              aria-label="24-hour forecast time scrubber"
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/80 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-300 font-medium">
            PM₂.₅ Pollution Overlay Scale (µg/m³):
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {PM25_LEGEND_ITEMS.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-slate-300">
                <span className={`w-3 h-3 rounded inline-block ${item.swatchClass}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-300 border-t border-slate-800/50 pt-1">
          <span className="text-slate-300 font-medium">US AQI Reference Scale:</span>
          <div className="flex flex-wrap items-center gap-3">
            {AQI_SCALE_RANGES.map((rangeLabel) => (
              <span key={rangeLabel}>{rangeLabel}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
