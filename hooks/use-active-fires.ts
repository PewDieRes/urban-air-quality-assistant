import { useEffect, useState } from "react";
import { FireDetection } from "@/lib/fires/firms";
import { Bounds } from "@/lib/map/regional-cells";

/**
 * Fetches recent NASA FIRMS thermal detections around the map center when enabled.
 */
export function useActiveFires(center: { lat: number; lon: number }, enabled: boolean) {
  const [fires, setFires] = useState<FireDetection[] | null>(null);
  const [firesNotice, setFiresNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFires(null);
      setFiresNotice(null);
      return;
    }

    const abortController = new AbortController();
    const delta = 2.0;
    const bounds: Bounds = {
      west: center.lon - delta,
      south: center.lat - delta,
      east: center.lon + delta,
      north: center.lat + delta,
    };

    async function loadActiveFires() {
      try {
        const response = await fetch(
          `/api/fires?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`,
          { signal: abortController.signal }
        );
        if (!response.ok) {
          throw new Error(`Active fires request returned ${response.status}`);
        }
        const payload = (await response.json()) as { fires?: FireDetection[] };
        if (!abortController.signal.aborted) {
          setFires(payload.fires || []);
          setFiresNotice(null);
        }
      } catch (fetchError: unknown) {
        if (abortController.signal.aborted) {
          return;
        }
        console.warn("Active fire overlay unavailable:", fetchError);
        setFiresNotice("Active fire overlay temporarily unavailable.");
      }
    }

    loadActiveFires();
    return () => {
      abortController.abort();
    };
  }, [center.lat, center.lon, enabled]);

  return { fires, firesNotice };
}
