import { useEffect, useState } from "react";
import { SmokePathSet } from "@/lib/smoke/types";

/**
 * Fetches the verified November 3, 2024 HYSPLIT historical smoke GeoJSON when toggled on.
 */
export function useHistoricalSmoke(enabled: boolean) {
  const [smokeData, setSmokeData] = useState<SmokePathSet | null>(null);
  const [smokeNotice, setSmokeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSmokeData(null);
      setSmokeNotice(null);
      return;
    }

    const abortController = new AbortController();

    async function loadHistoricalSmoke() {
      try {
        const response = await fetch("/smoke/historical.geojson", {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Historical smoke fetch returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          metadata: SmokePathSet["metadata"];
          features: SmokePathSet["paths"]["features"];
        };
        if (!abortController.signal.aborted) {
          setSmokeData({
            metadata: payload.metadata,
            paths: {
              type: "FeatureCollection",
              features: payload.features,
            },
          });
          setSmokeNotice(null);
        }
      } catch (fetchError: unknown) {
        if (abortController.signal.aborted) {
          return;
        }
        console.warn("Failed to load historical smoke case:", fetchError);
        setSmokeNotice("Historical smoke trajectory archive could not be loaded.");
      }
    }

    loadHistoricalSmoke();
    return () => {
      abortController.abort();
    };
  }, [enabled]);

  return { smokeData, smokeNotice };
}
