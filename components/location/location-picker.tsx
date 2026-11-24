"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, MapPin, Navigation, Loader2 } from "lucide-react";
import { Place, DEFAULT_PLACE, TOKYO_PLACE } from "@/lib/location/search";

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
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

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
    } catch {
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
    setGeoNotice(null);
  };

  const fallbackToIpDetection = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/locations/detect");
      if (res.ok) {
        const data = await res.json();
        if (data.place) {
          onSelectLocation(data.place, { lat: data.place.lat, lon: data.place.lon });
          setGeoNotice(
            `Located near ${data.place.name}${data.place.country ? `, ${data.place.country}` : ""} (via network)`
          );
          setGeoError(null);
          setIsOpen(false);
          return true;
        }
      }
    } catch {
      // Fallback failed
    }
    return false;
  }, [onSelectLocation]);

  const handleUseGeolocation = () => {
    setIsLoading(true);
    setGeoError(null);
    setGeoNotice(null);

    if (!navigator.geolocation) {
      fallbackToIpDetection().then((ok) => {
        setIsLoading(false);
        if (!ok) {
          setGeoError("Geolocation is not supported by your browser. Search for your city below.");
        }
      });
      return;
    }

    let resolved = false;

    // Fast fallback if browser GPS takes more than 3.5s (e.g. desktop PC without GPS)
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        fallbackToIpDetection().then((ok) => {
          setIsLoading(false);
          if (!ok) {
            setGeoError("GPS acquisition timed out. Search for your city below.");
          }
        });
      }
    }, 3500);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        let customPlace: Place = {
          id: `custom-${lat.toFixed(4)}-${lon.toFixed(4)}`,
          name: "Current Location",
          region: "Browser Geolocation",
          country: "",
          lat,
          lon,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };

        try {
          const revRes = await fetch(`/api/locations/reverse?lat=${lat}&lon=${lon}`);
          if (revRes.ok) {
            const revData = await revRes.json();
            if (revData.place) {
              customPlace = revData.place;
            }
          }
        } catch {
          // Use default customPlace
        }

        setIsLoading(false);
        onSelectLocation(customPlace, { lat, lon });
        setGeoNotice(`Located at ${customPlace.name}`);
        setIsOpen(false);
      },
      async (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);

        // When denied or unavailable on desktop, immediately try IP detection
        const ok = await fallbackToIpDetection();
        setIsLoading(false);
        if (!ok) {
          setGeoError(
            error.code === error.PERMISSION_DENIED
              ? "Location permission denied. Search for your city below."
              : "Could not retrieve your location. Search for your city below."
          );
        }
      },
      { timeout: 3500, enableHighAccuracy: false }
    );
  };

  const displayTitle = selectedPlace ? selectedPlace.name : "Custom coordinates";
  const displaySubtitle = selectedPlace
    ? [selectedPlace.region, selectedPlace.country].filter(Boolean).join(", ")
    : `${coordinates.lat.toFixed(2)}°, ${coordinates.lon.toFixed(2)}°`;

  const isDelhi = selectedPlace?.name === DEFAULT_PLACE.name;
  const isTokyo = selectedPlace?.name === TOKYO_PLACE.name;

  return (
    <div className="relative w-full max-w-xl" ref={dropdownRef}>
      <div className="flex flex-col gap-2">
        {/* Prominent Active City & Controls Bar */}
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
              onClick={() => onSelectLocation(DEFAULT_PLACE, { lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon })}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                isDelhi
                  ? "bg-teal-700 text-white shadow-xs"
                  : "bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              Delhi-NCR
            </button>
            <button
              type="button"
              onClick={() => onSelectLocation(TOKYO_PLACE, { lat: TOKYO_PLACE.lat, lon: TOKYO_PLACE.lon })}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                isTokyo
                  ? "bg-teal-700 text-white shadow-xs"
                  : "bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              Tokyo Demo
            </button>
            <button
              type="button"
              onClick={handleUseGeolocation}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 transition"
              title="Use current GPS or network location"
            >
              <Navigation className="w-3 h-3 text-teal-700" />
              <span>Near Me</span>
            </button>
          </div>
        </div>

        {geoNotice && (
          <div className="text-xs text-teal-900 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
            <span>{geoNotice}</span>
            <button
              type="button"
              onClick={() => setGeoNotice(null)}
              className="text-teal-700 hover:text-teal-900 ml-2"
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        )}

        {geoError && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
            <span>{geoError}</span>
            <button
              type="button"
              onClick={() => setGeoError(null)}
              className="text-amber-700 hover:text-amber-900 ml-2"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* City Search Bar */}
        <div className="relative">
          <label htmlFor="location-search-input" className="sr-only">
            Search city or location
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
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
            className="w-full bg-white border border-stone-200 rounded-lg pl-9 pr-8 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 transition"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 animate-spin" />
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => handleSelectPlace(place)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-stone-50 border-b border-stone-100 last:border-b-0 flex items-start justify-between gap-3 transition"
            >
              <div>
                <div className="text-xs font-semibold text-stone-900">
                  {place.name}
                  {place.country && <span className="text-stone-500 font-normal">, {place.country}</span>}
                </div>
                {place.region && (
                  <div className="text-[11px] text-stone-500">{place.region}</div>
                )}
              </div>
              <span className="text-[10px] text-stone-400 font-mono mt-0.5">
                {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
