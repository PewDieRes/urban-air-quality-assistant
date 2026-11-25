import React from "react";
import { formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";
import { AirSample, getAqiCategory } from "@/lib/forecast/types";

interface ForecastAccessibleTableProps {
  hourlySlots: AirSample[];
  timeZone: string;
  selectedInstant?: string | null;
  onSelectHour?: (sample: AirSample) => void;
}

/**
 * Keyboard-navigable tabular alternative to the 24-hour SVG forecast profile.
 */
export function ForecastAccessibleTable({
  hourlySlots,
  timeZone,
  selectedInstant,
  onSelectHour,
}: ForecastAccessibleTableProps) {
  return (
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
              const category = getAqiCategory(slot.usAqi);
              const timeInfo = formatHourlyTimeWithDate(slot.at, timeZone);
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
                      onClick={() => onSelectHour?.(slot)}
                      className="text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 rounded px-0.5"
                    >
                      {timeInfo.time} {timeInfo.isNextDay ? `(${timeInfo.date})` : ""}
                    </button>
                  </td>
                  <td className="py-1 px-3">
                    {slot.pm25 !== null ? `${slot.pm25.toFixed(1)} µg/m³` : "Missing"}
                  </td>
                  <td className="py-1 px-3">{slot.usAqi !== null ? slot.usAqi : "—"}</td>
                  <td className="py-1 px-3 font-sans">
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${category.badgeClass}`}>
                      {category.category}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
