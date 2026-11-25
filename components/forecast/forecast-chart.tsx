"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { buildForecastChartGeometry, FORECAST_CHART_DIMENSIONS } from "@/lib/forecast/chart-geometry";
import { formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";
import { AirSample, Forecast, getAqiCategory } from "@/lib/forecast/types";
import { ForecastAccessibleTable } from "./forecast-accessible-table";

interface ForecastChartProps {
  forecast: Forecast | null;
  selectedInstant?: string | null;
  onSelectHour?: (sample: AirSample) => void;
  className?: string;
}

const Y_AXIS_RATIOS = [0, 0.33, 0.66, 1] as const;

/**
 * Interactive 24-hour PM2.5 SVG profile with keyboard scrubbing and accessible table fallback.
 */
export function ForecastChart({
  forecast,
  selectedInstant,
  onSelectHour,
  className = "",
}: ForecastChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = useId();

  const hourlySlots: AirSample[] = useMemo(
    () => forecast?.hourly?.slice(0, 24) || [],
    [forecast?.hourly]
  );
  const timeZone = forecast?.timeZone || "UTC";

  const selectedIndex = useMemo(() => {
    if (!selectedInstant || hourlySlots.length === 0) return -1;
    return hourlySlots.findIndex((sample) => sample.at === selectedInstant);
  }, [selectedInstant, hourlySlots]);

  const activeIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex >= 0 ? selectedIndex : 0;
  const activeSample = hourlySlots[activeIndex] || null;

  const { maxPm25, points, midnightIndices, pathSegments } = useMemo(
    () => buildForecastChartGeometry(hourlySlots, timeZone),
    [hourlySlots, timeZone]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (hourlySlots.length === 0) return;

      let nextIndex = activeIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = Math.min(hourlySlots.length - 1, activeIndex + 1);
        event.preventDefault();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = Math.max(0, activeIndex - 1);
        event.preventDefault();
      } else if (event.key === "Home") {
        nextIndex = 0;
        event.preventDefault();
      } else if (event.key === "End") {
        nextIndex = hourlySlots.length - 1;
        event.preventDefault();
      }

      if (nextIndex !== activeIndex) {
        setHoveredIndex(nextIndex);
        if (onSelectHour && hourlySlots[nextIndex]) {
          onSelectHour(hourlySlots[nextIndex]);
        }
      }
    },
    [activeIndex, hourlySlots, onSelectHour]
  );

  if (hourlySlots.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-stone-500 border border-stone-200 rounded-xl bg-white">
        Forecast data loading...
      </div>
    );
  }

  const activeCategory = activeSample ? getAqiCategory(activeSample.usAqi) : null;
  const activeFormatted = activeSample ? formatHourlyTimeWithDate(activeSample.at, timeZone) : null;
  const baselineY = FORECAST_CHART_DIMENSIONS.height - FORECAST_CHART_DIMENSIONS.paddingBottom;

  return (
    <div
      className={`bg-white border border-stone-200/90 rounded-xl p-4 shadow-sm flex flex-col gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${className}`}
      role="region"
      aria-label="Hourly air quality forecast"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
        <div>
          <span className="text-xs uppercase font-semibold tracking-wider text-stone-600">
            24-Hour PM₂.₅ Profile ({timeZone})
          </span>
          <p className="text-[11px] text-stone-600">
            Click or use arrow keys to inspect hourly readings. Gaps denote missing data.
          </p>
        </div>

        {activeSample && activeCategory && (
          <div className="flex items-center gap-2 text-xs bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
            <span className="font-medium text-stone-700">
              {activeFormatted?.time}
              {activeFormatted?.isNextDay ? ` (${activeFormatted.date})` : ""}
            </span>
            <span className="text-stone-300">|</span>
            <span className="font-semibold text-stone-900">
              {activeSample.pm25 !== null ? `${Math.round(activeSample.pm25)} µg/m³` : "Missing data"}
            </span>
            <span className="text-stone-300">|</span>
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${activeCategory.badgeClass}`}>
              AQI {activeSample.usAqi !== null ? activeSample.usAqi : "—"} · {activeCategory.category}
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden select-none">
        <svg viewBox="0 0 1000 200" className="w-full h-44 overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0f766e" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {Y_AXIS_RATIOS.map((ratio) => {
            const y = 25 + (200 - 25 - 35) * (1 - ratio);
            return (
              <g key={ratio}>
                <line x1={50} y1={y} x2={980} y2={y} stroke="#e7e5e4" strokeDasharray="3 3" strokeWidth="1" />
                <text x={44} y={y + 3} textAnchor="end" fontSize="10" fill="#78716c" fontFamily="monospace">
                  {Math.round(maxPm25 * ratio)}
                </text>
              </g>
            );
          })}

          <text x={8} y={15} fontSize="10" fill="#78716c" fontWeight="bold">
            µg/m³
          </text>

          {midnightIndices.map((index) => {
            const point = points[index];
            if (!point) return null;
            return (
              <g key={`midnight-${index}`}>
                <line x1={point.x} y1={20} x2={point.x} y2={165} stroke="#0f766e" strokeWidth="1.5" strokeDasharray="4 4" />
                <text x={point.x + 4} y={32} fontSize="10" fill="#0f766e" fontWeight="600">
                  Midnight
                </text>
              </g>
            );
          })}

          {pathSegments.map((segment, segmentIndex) => {
            const linePath = segment.reduce(
              (acc, point, pointIdx) => `${acc} ${pointIdx === 0 ? "M" : "L"} ${point.x} ${point.y}`,
              ""
            );
            const areaPath = `${linePath} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`;
            return (
              <g key={`seg-${segmentIndex}`}>
                <path d={areaPath} fill={`url(#${gradientId})`} />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#0f766e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {points.map((point) => {
            const isHovered = hoveredIndex === point.index;
            const isSelected = selectedIndex === point.index;
            const timeInfo = formatHourlyTimeWithDate(point.sample.at, timeZone);

            return (
              <g
                key={point.sample.at || point.index}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(point.index)}
                onClick={() => onSelectHour?.(point.sample)}
              >
                <rect x={point.x - 18} y={15} width={36} height={160} fill="transparent" />
                {(isHovered || isSelected) && (
                  <line
                    x1={point.x}
                    y1={20}
                    x2={point.x}
                    y2={165}
                    stroke="#0f766e"
                    strokeWidth={isSelected ? 2 : 1}
                    opacity={isSelected ? 0.9 : 0.5}
                  />
                )}
                {point.y !== null ? (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 5 : isHovered ? 4 : 2.5}
                    fill={isSelected ? "#0f766e" : isHovered ? "#115e59" : "#ffffff"}
                    stroke="#0f766e"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                ) : (
                  <line x1={point.x - 6} y1={165} x2={point.x + 6} y2={165} stroke="#dc2626" strokeWidth="2" strokeDasharray="2 2" />
                )}
                {(point.index % 4 === 0 || point.index === points.length - 1) && (
                  <text x={point.x} y={182} textAnchor="middle" fontSize="10" fill="#78716c" fontFamily="sans-serif">
                    {timeInfo.time}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ForecastAccessibleTable
        hourlySlots={hourlySlots}
        timeZone={timeZone}
        selectedInstant={selectedInstant}
        onSelectHour={onSelectHour}
      />
    </div>
  );
}
