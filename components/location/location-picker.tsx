"use client";

import React, { useId, useRef } from "react";
import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import { DEFAULT_PLACE, Place, TOKYO_PLACE } from "@/lib/location/search";
import { useLocationPicker } from "@/hooks/use-location-picker";
import { LocationSuggestionsDropdown } from "./location-suggestions-dropdown";

interface LocationPickerProps {
  selectedPlace: Place | null;
  coordinates: { lat: number; lon: number };
  onSelectLocation: (place: Place | null, coords: { lat: number; lon: number }) => void;
}

/**
 * Unified active-city bar, preset buttons, browser geolocation trigger, and autocomplete search.
 */
export function LocationPicker({
  selectedPlace,
  coordinates,
  onSelectLocation,
}: LocationPickerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const picker = useLocationPicker({ onSelectLocation, dropdownRef });

  const displayTitle = selectedPlace ? selectedPlace.name : "Custom coordinates";
  const displaySubtitle = selectedPlace
    ? [selectedPlace.region, selectedPlace.country].filter(Boolean).join(", ")
    : `${coordinates.lat.toFixed(2)}°, ${coordinates.lon.toFixed(2)}°`;

  const isDelhi = selectedPlace?.name === DEFAULT_PLACE.name;
  const isTokyo = selectedPlace?.name === TOKYO_PLACE.name;

  return (
    <div className="relative w-full max-w-xl" ref={dropdownRef}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-stone-200/90 rounded-xl px-3.5 py-2 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-800 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div
                data-testid="selected-location-name"
                className="font-bold text-stone-900 text-sm truncate leading-tight"
              >
                {displayTitle}
              </div>
              <div className="text-[11px] text-stone-500 truncate leading-tight">
                {displaySubtitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={isDelhi}
              onClick={() =>
                onSelectLocation(DEFAULT_PLACE, { lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon })
              }
              className={`px-2.5 py-1 rounded text-xs font-medium transition-shadow ${
                isDelhi
                  ? "bg-teal-700 text-white shadow-xs"
                  : "bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              Delhi-NCR
            </button>
            <button
              type="button"
              aria-pressed={isTokyo}
              onClick={() =>
                onSelectLocation(TOKYO_PLACE, { lat: TOKYO_PLACE.lat, lon: TOKYO_PLACE.lon })
              }
              className={`px-2.5 py-1 rounded text-xs font-medium transition-shadow ${
                isTokyo
                  ? "bg-teal-700 text-white shadow-xs"
                  : "bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              Tokyo Demo
            </button>
            <button
              type="button"
              onClick={picker.handleUseGeolocation}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 transition"
              title="Use current GPS or network location"
            >
              <Navigation className="w-3 h-3 text-teal-700" />
              <span>Near Me</span>
            </button>
          </div>
        </div>

        {picker.geoNotice && (
          <div className="text-xs text-teal-900 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
            <span>{picker.geoNotice}</span>
            <button
              type="button"
              onClick={() => picker.setGeoNotice(null)}
              className="text-teal-700 hover:text-teal-900 ml-2"
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        )}

        {picker.geoError && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
            <span>{picker.geoError}</span>
            <button
              type="button"
              onClick={() => picker.setGeoError(null)}
              className="text-amber-700 hover:text-amber-900 ml-2"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        <div className="relative">
          <label htmlFor="location-search-input" className="sr-only">
            Search city or location
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <input
            id="location-search-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={picker.isOpen && picker.results.length > 0}
            aria-controls={picker.isOpen && picker.results.length > 0 ? listboxId : undefined}
            aria-activedescendant={
              picker.isOpen && picker.activeIndex >= 0
                ? `${listboxId}-option-${picker.activeIndex}`
                : undefined
            }
            aria-label="Search city or location"
            placeholder="Search city (e.g. Delhi, Tokyo, London)..."
            value={picker.query}
            onChange={(event) => picker.handleQueryChange(event.target.value)}
            onKeyDown={picker.handleKeyDown}
            onFocus={() => {
              if (picker.results.length > 0) picker.setIsOpen(true);
            }}
            className="w-full bg-white border border-stone-200 rounded-lg pl-9 pr-8 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 transition"
          />
          {picker.isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 animate-spin" />
          )}
        </div>
      </div>

      {picker.isOpen && (
        <LocationSuggestionsDropdown
          listboxId={listboxId}
          results={picker.results}
          activeIndex={picker.activeIndex}
          onSelectPlace={picker.selectPlace}
        />
      )}
    </div>
  );
}
