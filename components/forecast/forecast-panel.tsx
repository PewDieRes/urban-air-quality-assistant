"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Forecast, AirSample } from "@/lib/forecast/types";
import { ForecastSummary } from "./forecast-summary";
import { ForecastChart } from "./forecast-chart";

interface ForecastPanelProps {
  lat: number;
  lon: number;
  locationName: string;
  onOpenPlan?: () => void;
  onSelectHour?: (sample: AirSample) => void;
  selectedInstant?: string | null;
  onExploreMap?: () => void;
}

export function ForecastPanel({
  lat,
  lon,
  locationName,
  onOpenPlan,
  onSelectHour,
  selectedInstant,
  onExploreMap,
}: ForecastPanelProps) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to retrieve forecast data");
      }
      const data = await res.json();
      setForecast(data.forecast);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to load forecast";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [lat, lon]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  return (
    <div className="space-y-4">
      <ForecastSummary
        forecast={forecast}
        locationName={locationName}
        isLoading={isLoading}
        error={error}
        onRefresh={fetchForecast}
        onExploreMap={onExploreMap}
      />
      <ForecastChart
        forecast={forecast}
        selectedInstant={selectedInstant}
        onSelectHour={onSelectHour}
      />
    </div>
  );
}
