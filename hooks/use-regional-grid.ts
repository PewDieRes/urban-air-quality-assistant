import { useEffect, useState } from "react";
import { Forecast } from "@/lib/forecast/types";
import { Bounds, RegionalCell } from "@/lib/map/regional-cells";

export interface RegionalGridCellForecast {
  cell: RegionalCell;
  forecast: Forecast;
}

/**
 * Fetches forecast data for the 3x3 regional spatial grid centered around coordinates.
 */
export function useRegionalGrid(center: { lat: number; lon: number }) {
  const [gridData, setGridData] = useState<RegionalGridCellForecast[]>([]);
  const [gridNotice, setGridNotice] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const delta = 0.5;
    const bounds: Bounds = {
      west: center.lon - delta,
      south: center.lat - delta,
      east: center.lon + delta,
      north: center.lat + delta,
    };

    async function loadRegionalGrid() {
      try {
        const response = await fetch(
          `/api/forecast/grid?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}&lat=${center.lat}&lon=${center.lon}`,
          { signal: abortController.signal }
        );
        if (!response.ok) {
          throw new Error(`Regional grid request returned ${response.status}`);
        }
        const payload = (await response.json()) as { grid?: RegionalGridCellForecast[] };
        if (!abortController.signal.aborted) {
          setGridData(payload.grid || []);
          setGridNotice(null);
        }
      } catch (fetchError: unknown) {
        if (abortController.signal.aborted) {
          return;
        }
        console.warn("Regional forecast grid unavailable; retaining focal forecast:", fetchError);
        setGridNotice("Regional spatial grid overlay temporarily unavailable.");
      }
    }

    loadRegionalGrid();
    return () => {
      abortController.abort();
    };
  }, [center.lat, center.lon]);

  return { gridData, gridNotice };
}
