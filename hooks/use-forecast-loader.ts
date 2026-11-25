import { useCallback, useEffect, useRef, useState } from "react";
import { Forecast } from "@/lib/forecast/types";
import { DEFAULT_PLACE, Place } from "@/lib/location/search";

/**
 * Coordinates active location state, race-guarded /api/forecast fetches,
 * and race-guarded reverse geocoding when picking coordinates from the map.
 */
export function useForecastLoader() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(DEFAULT_PLACE);
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>({
    lat: DEFAULT_PLACE.lat,
    lon: DEFAULT_PLACE.lon,
  });
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState<boolean>(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [selectedInstant, setSelectedInstant] = useState<string | null>(null);

  const forecastSequenceRef = useRef<number>(0);
  const forecastAbortControllerRef = useRef<AbortController | null>(null);
  const reverseSequenceRef = useRef<number>(0);
  const reverseAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      forecastAbortControllerRef.current?.abort();
      reverseAbortControllerRef.current?.abort();
    };
  }, []);

  const fetchForecast = useCallback(async () => {
    forecastAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    forecastAbortControllerRef.current = abortController;
    const requestSequence = ++forecastSequenceRef.current;

    setIsLoadingForecast(true);
    setForecastError(null);

    try {
      const response = await fetch(
        `/api/forecast?lat=${coordinates.lat}&lon=${coordinates.lon}`,
        { signal: abortController.signal }
      );
      if (requestSequence !== forecastSequenceRef.current || abortController.signal.aborted) {
        return;
      }
      if (!response.ok) {
        const errorJson = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(errorJson.error?.message || "Failed to retrieve forecast data");
      }
      const payload = (await response.json()) as { forecast: Forecast };
      if (requestSequence !== forecastSequenceRef.current || abortController.signal.aborted) {
        return;
      }
      setForecast(payload.forecast);
    } catch (requestError: unknown) {
      if (requestSequence !== forecastSequenceRef.current || abortController.signal.aborted) {
        return;
      }
      setForecastError(
        requestError instanceof Error ? requestError.message : "Unable to load forecast"
      );
    } finally {
      if (requestSequence === forecastSequenceRef.current) {
        setIsLoadingForecast(false);
      }
    }
  }, [coordinates.lat, coordinates.lon]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const selectLocation = useCallback(
    (place: Place | null, nextCoords: { lat: number; lon: number }) => {
      reverseAbortControllerRef.current?.abort();
      reverseSequenceRef.current += 1;

      if (nextCoords.lat !== coordinates.lat || nextCoords.lon !== coordinates.lon) {
        forecastAbortControllerRef.current?.abort();
        setForecast(null);
        setForecastError(null);
      }
      setSelectedPlace(place);
      setCoordinates(nextCoords);
      setSelectedInstant(null);
    },
    [coordinates.lat, coordinates.lon]
  );

  const selectMapCoordinate = useCallback(
    (nextCoords: { lat: number; lon: number }) => {
      const provisionalPlace: Place = {
        id: `loc-${nextCoords.lat.toFixed(4)}-${nextCoords.lon.toFixed(4)}`,
        name: "Selected Location",
        region: `${nextCoords.lat.toFixed(2)}°, ${nextCoords.lon.toFixed(2)}°`,
        country: "",
        lat: nextCoords.lat,
        lon: nextCoords.lon,
        timeZone: forecast?.timeZone || "UTC",
      };
      selectLocation(provisionalPlace, nextCoords);

      const reverseController = new AbortController();
      reverseAbortControllerRef.current = reverseController;
      const reverseSeq = ++reverseSequenceRef.current;

      fetch(`/api/locations/reverse?lat=${nextCoords.lat}&lon=${nextCoords.lon}`, {
        signal: reverseController.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { place?: Place } | null) => {
          if (
            reverseSeq === reverseSequenceRef.current &&
            !reverseController.signal.aborted &&
            payload?.place
          ) {
            setSelectedPlace(payload.place);
          }
        })
        .catch((reverseError: unknown) => {
          if (!reverseController.signal.aborted) {
            console.warn("Reverse geocode lookup skipped:", reverseError);
          }
        });
    },
    [forecast?.timeZone, selectLocation]
  );

  return {
    selectedPlace,
    coordinates,
    forecast,
    isLoadingForecast,
    forecastError,
    selectedInstant,
    setSelectedInstant,
    fetchForecast,
    selectLocation,
    selectMapCoordinate,
  };
}
