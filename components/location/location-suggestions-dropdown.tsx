import React from "react";
import { Place } from "@/lib/location/search";

interface LocationSuggestionsDropdownProps {
  results: Place[];
  onSelectPlace: (place: Place) => void;
}

/**
 * Floating city autocomplete results menu rendered below the location search input.
 */
export function LocationSuggestionsDropdown({
  results,
  onSelectPlace,
}: LocationSuggestionsDropdownProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
      {results.map((place) => (
        <button
          key={place.id}
          type="button"
          onClick={() => onSelectPlace(place)}
          className="w-full text-left px-3.5 py-2.5 hover:bg-stone-50 border-b border-stone-100 last:border-b-0 flex items-start justify-between gap-3 transition"
        >
          <div>
            <div className="text-xs font-semibold text-stone-900">
              {place.name}
              {place.country && <span className="text-stone-500 font-normal">, {place.country}</span>}
            </div>
            {place.region && <div className="text-[11px] text-stone-500">{place.region}</div>}
          </div>
          <span className="text-[10px] text-stone-600 font-mono mt-0.5">
            {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
          </span>
        </button>
      ))}
    </div>
  );
}
