import { useCallback, useEffect, useRef, useState } from "react";
import { Place } from "@/lib/location/search";

interface UseLocationPickerArgs {
  onSelectLocation: (place: Place | null, coords: { lat: number; lon: number }) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Manages debounced city search, sequence-guarded autocomplete results,
 * and browser GPS geolocation with IP geolocation fallback.
 */
export function useLocationPicker({ onSelectLocation, dropdownRef }: UseLocationPickerArgs) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

  const activeRequestIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geolocationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (geolocationTimerRef.current) clearTimeout(geolocationTimerRef.current);
    };
  }, [dropdownRef]);

  const executeSearch = useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(trimmedQuery)}`);
      if (!response.ok) {
        throw new Error(`Location search returned ${response.status}`);
      }
      const payload = (await response.json()) as { places?: Place[] };

      if (requestId === activeRequestIdRef.current) {
        setResults(payload.places || []);
        setActiveIndex(-1);
        setIsOpen(true);
      }
    } catch (searchError: unknown) {
      console.warn("City search failed:", searchError);
      if (requestId === activeRequestIdRef.current) {
        setResults([]);
        setActiveIndex(-1);
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(nextQuery);
    }, 250);
  };

  const selectPlace = (place: Place) => {
    onSelectLocation(place, { lat: place.lat, lon: place.lon });
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setGeoError(null);
    setGeoNotice(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
      }
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((prev) => (prev + 1) % results.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(results.length - 1);
      } else {
        setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      }
      return;
    }

    if (event.key === "Enter" && isOpen && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      selectPlace(results[activeIndex]);
    }
  };

  const fallbackToIpDetection = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/locations/detect");
      if (response.ok) {
        const payload = (await response.json()) as { place?: Place };
        if (payload.place) {
          onSelectLocation(payload.place, { lat: payload.place.lat, lon: payload.place.lon });
          setGeoNotice(
            `Located near ${payload.place.name}${
              payload.place.country ? `, ${payload.place.country}` : ""
            } (via network)`
          );
          setGeoError(null);
          setIsOpen(false);
          return true;
        }
      }
    } catch (detectError: unknown) {
      console.warn("Network geolocation fallback failed:", detectError);
    }
    return false;
  }, [onSelectLocation]);

  const handleUseGeolocation = () => {
    setIsLoading(true);
    setGeoError(null);
    setGeoNotice(null);

    if (!navigator.geolocation) {
      fallbackToIpDetection().then((resolved) => {
        setIsLoading(false);
        if (!resolved) {
          setGeoError("Geolocation is not supported by your browser. Search for your city below.");
        }
      });
      return;
    }

    let settled = false;
    if (geolocationTimerRef.current) {
      clearTimeout(geolocationTimerRef.current);
    }
    geolocationTimerRef.current = setTimeout(() => {
      if (!settled) {
        settled = true;
        fallbackToIpDetection().then((resolved) => {
          setIsLoading(false);
          if (!resolved) {
            setGeoError("GPS acquisition timed out. Search for your city below.");
          }
        });
      }
    }, 3500);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (settled) return;
        settled = true;
        if (geolocationTimerRef.current) clearTimeout(geolocationTimerRef.current);

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        let resolvedPlace: Place = {
          id: `custom-${lat.toFixed(4)}-${lon.toFixed(4)}`,
          name: "Current Location",
          region: "Browser Geolocation",
          country: "",
          lat,
          lon,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };

        try {
          const reverseResponse = await fetch(`/api/locations/reverse?lat=${lat}&lon=${lon}`);
          if (reverseResponse.ok) {
            const reverseData = (await reverseResponse.json()) as { place?: Place };
            if (reverseData.place) {
              resolvedPlace = reverseData.place;
            }
          }
        } catch (reverseError: unknown) {
          console.warn("Reverse geocoding fallback kept raw GPS label:", reverseError);
        }

        setIsLoading(false);
        onSelectLocation(resolvedPlace, { lat, lon });
        setGeoNotice(`Located at ${resolvedPlace.name}`);
        setIsOpen(false);
      },
      async (positionError) => {
        if (settled) return;
        settled = true;
        if (geolocationTimerRef.current) clearTimeout(geolocationTimerRef.current);

        const detected = await fallbackToIpDetection();
        setIsLoading(false);
        if (!detected) {
          setGeoError(
            positionError.code === positionError.PERMISSION_DENIED
              ? "Location permission denied. Search for your city below."
              : "Could not retrieve your location. Search for your city below."
          );
        }
      },
      { timeout: 3500, enableHighAccuracy: false }
    );
  };

  return {
    query,
    results,
    isOpen,
    setIsOpen,
    activeIndex,
    isLoading,
    geoError,
    setGeoError,
    geoNotice,
    setGeoNotice,
    handleQueryChange,
    handleKeyDown,
    selectPlace,
    handleUseGeolocation,
  };
}
