"use client";

import React, { useState, useMemo, useCallback, useId } from "react";
import { Forecast, AirSample, getAqiCategory } from "@/lib/forecast/types";
import { formatHourlyTime, formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";

interface ForecastChartProps {
  forecast: Forecast | null;
  selectedInstant?: string | null;
  onSelectHour?: (sample: AirSample) => void;
  className?: string;
}

export function ForecastChart({
  forecast,
  selectedInstant,
  onSelectHour,
  className = "",
}: ForecastChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = useId();

  const hourlySlots: AirSample[] = useMemo(() => {
    return forecast?.hourly?.slice(0, 24) || [];
  }, [forecast?.hourly]);

  const timeZone = forecast?.timeZone || "UTC";

  // Identify selected or hovered sample
  const selectedIndex = useMemo(() => {
    if (!selectedInstant || hourlySlots.length === 0) return -1;
    return hourlySlots.findIndex((s) => s.at === selectedInstant);
  }, [selectedInstant, hourlySlots]);

  const activeIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex >= 0 ? selectedIndex : 0;
  const activeSample = hourlySlots[activeIndex] || null;

  // Chart coordinate math
  const { maxPm, points, midnightIndices, pathSegments } = useMemo(() => {
    if (hourlySlots.length === 0) {
      return { maxPm: 100, points: [], midnightIndices: [], pathSegments: [] };
    }

    const validPms = hourlySlots.map((s) => s.pm25).filter((p): p is number => p !== null && !isNaN(p));
    const highest = validPms.length > 0 ? Math.max(...validPms) : 50;
    // Round max up to neat increment
    const chartMax = Math.max(60, Math.ceil((highest * 1.25) / 25) * 25);

    const width = 1000;
    const height = 200;
    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 35;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const stepX = hourlySlots.length > 1 ? plotWidth / (hourlySlots.length - 1) : plotWidth;

    const midnights: number[] = [];
    const pts = hourlySlots.map((sample, idx) => {
      const x = paddingLeft + idx * stepX;
      let y: number | null = null;
      if (sample.pm25 !== null && !isNaN(sample.pm25)) {
        const normalized = Math.min(1, Math.max(0, sample.pm25 / chartMax));
        y = paddingTop + plotHeight * (1 - normalized);
      }

      // Check midnight date boundary
      const dateInfo = formatHourlyTimeWithDate(sample.at, timeZone);
      if (dateInfo.isNextDay && idx > 0) {
        midnights.push(idx);
      }

      return { x, y, sample, idx };
    });

    // Build contiguous line path segments (breaking on null / missing data gaps)
    const segments: Array<Array<{ x: number; y: number; sample: AirSample; idx: number }>> = [];
    let currentSegment: Array<{ x: number; y: number; sample: AirSample; idx: number }> = [];

    pts.forEach((pt) => {
      if (pt.y !== null) {
        currentSegment.push({ x: pt.x, y: pt.y, sample: pt.sample, idx: pt.idx });
      } else {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
    });
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return { maxPm: chartMax, points: pts, midnightIndices: midnights, pathSegments: segments };
  }, [hourlySlots, timeZone]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (hourlySlots.length === 0) return;
      let nextIdx = activeIndex;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIdx = Math.min(hourlySlots.length - 1, activeIndex + 1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIdx = Math.max(0, activeIndex - 1);
        e.preventDefault();
      } else if (e.key === "Home") {
        nextIdx = 0;
        e.preventDefault();
      } else if (e.key === "End") {
        nextIdx = hourlySlots.length - 1;
        e.preventDefault();
      }

      if (nextIdx !== activeIndex) {
        setHoveredIndex(nextIdx);
        if (onSelectHour && hourlySlots[nextIdx]) {
          onSelectHour(hourlySlots[nextIdx]);
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

  return (
    <div
      className={`bg-white border border-stone-200/90 rounded-xl p-4 shadow-sm flex flex-col gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${className}`}
      role="region"
      aria-label="Hourly air quality forecast"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {/* Chart Header Bar */}
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

      {/* SVG Chart Graphic */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox="0 0 1000 200"
          className="w-full h-44 overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0f766e" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis scale */}
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = 25 + (200 - 25 - 35) * (1 - ratio);
            const val = Math.round(maxPm * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={50}
                  y1={y}
                  x2={980}
                  y2={y}
                  stroke="#e7e5e4"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={44}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#78716c"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          <text x={8} y={15} fontSize="10" fill="#78716c" fontWeight="bold">
            µg/m³
          </text>

          {/* Midnight transition divider line */}
          {midnightIndices.map((idx) => {
            const pt = points[idx];
            if (!pt) return null;
            return (
              <g key={`midnight-${idx}`}>
                <line
                  x1={pt.x}
                  y1={20}
                  x2={pt.x}
                  y2={165}
                  stroke="#0f766e"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={pt.x + 4}
                  y={32}
                  fontSize="10"
                  fill="#0f766e"
                  fontWeight="600"
                >
                  Midnight
                </text>
              </g>
            );
          })}

          {/* Contiguous Area & Line segments (breaks at gaps) */}
          {pathSegments.map((segment, sIdx) => {
            if (segment.length === 0) return null;
            const linePath = segment.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`, "");
            const baselineY = 200 - 35;
            const areaPath = `${linePath} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`;

            return (
              <g key={`seg-${sIdx}`}>
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

          {/* Interactive hour columns & touch targets */}
          {points.map((pt) => {
            const isHovered = hoveredIndex === pt.idx;
            const isSelected = selectedIndex === pt.idx;
            const isMissing = pt.y === null;
            const timeInfo = formatHourlyTimeWithDate(pt.sample.at, timeZone);

            return (
              <g
                key={pt.sample.at || pt.idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(pt.idx)}
                onClick={() => onSelectHour && onSelectHour(pt.sample)}
              >
                {/* Invisible wide column for easy mouse hover */}
                <rect
                  x={pt.x - 18}
                  y={15}
                  width={36}
                  height={160}
                  fill="transparent"
                />

                {/* Vertical scrubber line when active */}
                {(isHovered || isSelected) && (
                  <line
                    x1={pt.x}
                    y1={20}
                    x2={pt.x}
                    y2={165}
                    stroke="#0f766e"
                    strokeWidth={isSelected ? 2 : 1}
                    opacity={isSelected ? 0.9 : 0.5}
                  />
                )}

                {/* Data point dot */}
                {pt.y !== null ? (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5 : isHovered ? 4 : 2.5}
                    fill={isSelected ? "#0f766e" : isHovered ? "#115e59" : "#ffffff"}
                    stroke="#0f766e"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                ) : (
                  // Missing data gap indicator
                  <line
                    x1={pt.x - 6}
                    y1={165}
                    x2={pt.x + 6}
                    y2={165}
                    stroke="#dc2626"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                  />
                )}

                {/* X-axis labels at intervals */}
                {(pt.idx % 4 === 0 || pt.idx === points.length - 1) && (
                  <text
                    x={pt.x}
                    y={182}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#78716c"
                    fontFamily="sans-serif"
                  >
                    {timeInfo.time}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Accessible exact readings collapsible table */}
      <details className="mt-1 pt-2 border-t border-stone-100 text-xs text-stone-600">
        <summary className="cursor-pointer text-stone-600 hover:text-stone-900 font-medium py-1 select-none flex items-center justify-between">
          <span>Exact hourly forecast values (accessible table)</span>
          <span className="text-[11px] text-stone-600">Click to expand</span>
        </summary>
        <div className="max-h-56 overflow-y-auto mt-2 border border-stone-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-700">
              <tr>
                <th className="py-1.5 px-3 font-semibold">Local Time</th>
                <th className="py-1.5 px-3 font-semibold">PM₂.₅ (µg/m³)</th>
                <th className="py-1.5 px-3 font-semibold">US AQI</th>
                <th className="py-1.5 px-3 font-semibold">Air Quality Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono">
              {hourlySlots.map((slot) => {
                const cat = getAqiCategory(slot.usAqi);
                const info = formatHourlyTimeWithDate(slot.at, timeZone);
                const isSelected = selectedInstant === slot.at;
                return (
                  <tr
                    key={slot.at}
                    className={`hover:bg-stone-50 ${
                      isSelected ? "bg-teal-50/70 font-semibold text-teal-900" : ""
                    }`}
                  >
                    <td className="py-1 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectHour && onSelectHour(slot)}
                        className="text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded px-0.5"
                      >
                        {info.time} {info.isNextDay ? `(${info.date})` : ""}
                      </button>
                    </td>
                    <td className="py-1 px-3">
                      {slot.pm25 !== null ? `${slot.pm25.toFixed(1)} µg/m³` : "Missing"}
                    </td>
                    <td className="py-1 px-3">
                      {slot.usAqi !== null ? slot.usAqi : "—"}
                    </td>
                    <td className="py-1 px-3 font-sans">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] ${cat.badgeClass}`}>
                        {cat.category}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
