import { Forecast } from "../forecast/types";

interface CacheEntry {
  forecast: Forecast;
  expiresAt: number;
}

const forecastCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<Forecast>>();

// Default TTL: 15 minutes (forecast data refreshes hourly from Open-Meteo)
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function getCacheKey(lat: number, lon: number): string {
  // Normalize coordinates to 2 decimal places (~1.1 km resolution)
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export async function getCachedForecast(
  lat: number,
  lon: number,
  fetcher: () => Promise<Forecast>,
  ttlMs = DEFAULT_TTL_MS
): Promise<Forecast> {
  const key = getCacheKey(lat, lon);
  const now = Date.now();

  const cached = forecastCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.forecast;
  }

  // Deduplicate concurrent in-flight requests for the same coordinate
  let pending = inFlightRequests.get(key);
  if (pending) {
    return pending;
  }

  pending = (async () => {
    try {
      const fresh = await fetcher();
      forecastCache.set(key, {
        forecast: fresh,
        expiresAt: Date.now() + ttlMs,
      });
      return fresh;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, pending);
  return pending;
}

export function clearForecastCache(): void {
  forecastCache.clear();
  inFlightRequests.clear();
}
