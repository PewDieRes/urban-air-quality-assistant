"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, MapPin, Navigation, Loader2 } from "lucide-react";
import { Place, DEFAULT_PLACE, formatPlaceLabel } from "@/lib/location/search";

interface LocationPickerProps {
  selectedPlace: Place | null;
  coordinates: { lat: number; lon: number };
  onSelectLocation: (place: Place | null, coords: { lat: number; lon: number }) => void;
}

export function LocationPicker({
  selectedPlace,
  coordinates,
  onSelectLocation,
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Guard against out-of-order stale responses
  const activeRequestIdRef = useRef<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/locations?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        throw new Error("Location search failed");
      }
      const data = await res.json();

      // Only apply results if this request is still the newest one
      if (requestId === activeRequestIdRef.current) {
        setResults(data.places || []);
        setIsOpen(true);
      }
    } catch (err) {
      if (requestId === activeRequestIdRef.current) {
        setResults([]);
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Debounced input change
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      search(val);
    }, 250);
  };

  const handleSelectPlace = (place: Place) => {
    onSelectLocation(place, { lat: place.lat, lon: place.lon });
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setGeoError(null);
  };

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLoading(false);
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const customPlace: Place = {
          id: `custom-${lat.toFixed(4)}-${lon.toFixed(4)}`,
          name: "Current Location",
          region: "Browser Geolocation",
          country: "",
          lat,
          lon,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };
        onSelectLocation(customPlace, { lat, lon });
        setIsOpen(false);
      },
      (error) => {
        setIsLoading(false);
        // Geolocation denied or unavailable: keep manual city search usable
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Search for your city below."
            : "Could not retrieve your location. Search for your city below."
        );
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  const displayTitle = selectedPlace ? selectedPlace.name : "Custom coordinates";
  const displaySubtitle = selectedPlace
    ? [selectedPlace.region, selectedPlace.country].filter(Boolean).join(", ")
    : `${coordinates.lat.toFixed(3)}°, ${coordinates.lon.toFixed(3)}°`;

  return (
    <div className="relative w-full max-w-xl" ref={dropdownRef}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-slate-900/80 border border-slate-700/80 rounded-xl px-4 py-3 backdrop-blur shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <MapPin className="w-5 h-5 shrink-0" />
            </div>
            <div className="min-w-0">
              <div
                data-testid="selected-location-name"
                className="font-semibold text-slate-100 truncate text-base"
              >
                {displayTitle}
              </div>
              <div className="text-xs text-slate-400 truncate">
                {displaySubtitle}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleUseGeolocation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition"
            title="Use current GPS location"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>Near Me</span>
          </button>
        </div>

        {geoError && (
          <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-1.5">
            {geoError}
          </div>
        )}

        <div className="relative">
          <label htmlFor="location-search-input" className="sr-only">
            Search city or location
          </label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="location-search-input"
            type="text"
            role="textbox"
            aria-label="Search city or location"
            placeholder="Search city (e.g. Delhi, Tokyo, London)..."
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (results.length > 0) setIsOpen(true);
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
          />
          {isLoading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl overflow-hidden backdrop-blur max-h-72 overflow-y-auto">
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => handleSelectPlace(place)}
              className="w-full text-left px-4 py-3 hover:bg-slate-800/80 border-b border-slate-800/60 last:border-b-0 flex items-start justify-between gap-3 transition"
            >
              <div>
                <div className="text-sm font-medium text-slate-200">
                  {place.name}
                  {place.country && <span className="text-slate-400 font-normal">, {place.country}</span>}
                </div>
                {place.region && (
                  <div className="text-xs text-slate-400">{place.region}</div>
                )}
              </div>
              <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
