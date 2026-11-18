import { AirSample, Forecast } from "./types";

export interface OpenMeteoAirQualityResponse {
  latitude: number;
  longitude: number;
  timezone?: string;
  current?: {
    time: string;
    pm2_5?: number | null;
    us_aqi?: number | null;
  };
  hourly?: {
    time: string[];
    pm2_5?: (number | null)[];
    us_aqi?: (number | null)[];
  };
}

/**
 * Normalizes Open-Meteo API response into a strict Forecast structure with UTC instants,
 * maintaining monotonicity, uniqueness, and preserving nulls for missing sensor measurements.
 */
export function normalizeForecast(
  raw: OpenMeteoAirQualityResponse,
  lat: number,
  lon: number,
  fallbackTimeZone = "UTC"
): Forecast {
  const timeZone = raw.timezone || fallbackTimeZone;

  let currentSample: AirSample | null = null;
  if (raw.current && raw.current.time) {
    const parsedCurrentTime = new Date(raw.current.time).toISOString();
    currentSample = {
      at: parsedCurrentTime,
      pm25: raw.current.pm2_5 !== undefined && raw.current.pm2_5 !== null ? Number(raw.current.pm2_5) : null,
      usAqi: raw.current.us_aqi !== undefined && raw.current.us_aqi !== null ? Math.round(Number(raw.current.us_aqi)) : null,
    };
  }

  const hourlySamples: AirSample[] = [];
  if (raw.hourly && Array.isArray(raw.hourly.time)) {
    const times = raw.hourly.time;
    const pm25s = raw.hourly.pm2_5 || [];
    const aqis = raw.hourly.us_aqi || [];

    for (let i = 0; i < times.length; i++) {
      const timeStr = times[i];
      if (!timeStr) continue;

      // Ensure proper UTC instant
      const dateObj = new Date(timeStr);
      if (isNaN(dateObj.getTime())) continue;

      const instantIso = dateObj.toISOString();
      const pm25Val = pm25s[i] !== undefined && pm25s[i] !== null ? Number(pm25s[i]) : null;
      const aqiVal = aqis[i] !== undefined && aqis[i] !== null ? Math.round(Number(aqis[i])) : null;

      hourlySamples.push({
        at: instantIso,
        pm25: pm25Val,
        usAqi: aqiVal,
      });
    }
  }

  // Ensure unique and strictly ascending instants
  const seenInstants = new Set<string>();
  const deduplicatedHourly: AirSample[] = [];

  for (const sample of hourlySamples) {
    if (!seenInstants.has(sample.at)) {
      seenInstants.add(sample.at);
      deduplicatedHourly.push(sample);
    }
  }

  deduplicatedHourly.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // If there are more than 24 hourly slots, take the upcoming 24 from current time onwards
  let boundedHourly = deduplicatedHourly;
  if (deduplicatedHourly.length > 24) {
    if (currentSample) {
      const currentInstantMs = new Date(currentSample.at).getTime();
      const upcoming = deduplicatedHourly.filter(
        (h) => new Date(h.at).getTime() >= currentInstantMs - 1800 * 1000
      );
      if (upcoming.length > 0) {
        boundedHourly = upcoming.slice(0, 24);
      } else {
        boundedHourly = deduplicatedHourly.slice(0, 24);
      }
    } else {
      boundedHourly = deduplicatedHourly.slice(0, 24);
    }
  }

  return {
    lat,
    lon,
    timeZone,
    source: "Open-Meteo",
    current: currentSample,
    hourly: boundedHourly,
  };
}

/**
 * Format an ISO instant into a localized hour string for display (e.g. "2:00 PM")
 */
export function formatHourlyTime(instantIso: string, timeZone: string): string {
  try {
    const date = new Date(instantIso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch (err) {
    // Fallback if timezone string is invalid
    const date = new Date(instantIso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
}

/**
 * Fetch forecast from Open-Meteo Air Quality API
 */
export async function getForecast(lat: number, lon: number): Promise<Forecast> {
  if (lat < -90 || lat > 90 || isNaN(lat)) {
    throw new Error(`Invalid latitude: ${lat}`);
  }
  if (lon < -180 || lon > 180 || isNaN(lon)) {
    throw new Error(`Invalid longitude: ${lon}`);
  }

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(
    4
  )}&longitude=${lon.toFixed(
    4
  )}&current=pm2_5,us_aqi&hourly=pm2_5,us_aqi&timeformat=iso8601&timezone=auto&forecast_days=2`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo air quality error: ${res.status}`);
  }

  const raw: OpenMeteoAirQualityResponse = await res.json();
  return normalizeForecast(raw, lat, lon);
}
