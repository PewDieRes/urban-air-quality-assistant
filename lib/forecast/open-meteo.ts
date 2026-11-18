import { AirSample, Forecast } from "./types";
import { fetchWithTimeout } from "../security/fetch-with-timeout";
import { getCachedForecast } from "../cache/forecast-cache";

export interface OpenMeteoAirQualityResponse {
  latitude: number;
  longitude: number;
  timezone?: string;
  current?: {
    time: string | number;
    pm2_5?: number | null;
    us_aqi?: number | null;
  };
  hourly?: {
    time: (string | number)[];
    pm2_5?: (number | null)[];
    us_aqi?: (number | null)[];
  };
}

export interface FormattedHourlyTime {
  time: string;
  date: string;
  full: string;
  isNextDay: boolean;
}

let lastSeenDayByTz: Record<string, string> = {};

/**
 * Parses any Open-Meteo time format (unixtime number, ISO with offset/Z, or naive local ISO)
 * into an unambiguous UTC ISO 8601 string.
 */
export function parseTimeToUtcInstant(timeVal: string | number, timeZone = "UTC"): string {
  if (typeof timeVal === "number" || (typeof timeVal === "string" && /^\d+$/.test(timeVal.trim()))) {
    const num = Number(timeVal);
    const ms = num < 1e11 ? num * 1000 : num;
    return new Date(ms).toISOString();
  }

  const str = String(timeVal).trim();
  // Check if string already has explicit UTC or timezone offset (Z, +HH:MM, -HH:MM)
  if (/([Zz]|[+-]\d{2}(:?\d{2})?)$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }

  // Parse naive ISO string: "YYYY-MM-DDTHH:mm(:ss)?"
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = match[4] ? parseInt(match[4], 10) : 0;
  const minute = match[5] ? parseInt(match[5], 10) : 0;
  const second = match[6] ? parseInt(match[6], 10) : 0;

  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    let guessMs = Date.UTC(year, month - 1, day, hour, minute, second);

    // Iteratively adjust offset to converge on exact local time in timeZone
    for (let iter = 0; iter < 3; iter++) {
      const parts = dtf.formatToParts(new Date(guessMs));
      let pY = year, pM = month, pD = day, pH = hour, pMin = minute, pS = second;
      for (const p of parts) {
        if (p.type === "year") pY = parseInt(p.value, 10);
        else if (p.type === "month") pM = parseInt(p.value, 10);
        else if (p.type === "day") pD = parseInt(p.value, 10);
        else if (p.type === "hour") {
          const h = parseInt(p.value, 10);
          pH = h === 24 ? 0 : h;
        } else if (p.type === "minute") pMin = parseInt(p.value, 10);
        else if (p.type === "second") pS = parseInt(p.value, 10);
      }

      const formattedInTzAsUtc = Date.UTC(pY, pM - 1, pD, pH, pMin, pS);
      const diff = formattedInTzAsUtc - Date.UTC(year, month - 1, day, hour, minute, second);
      if (diff === 0) break;
      guessMs -= diff;
    }

    return new Date(guessMs).toISOString();
  } catch {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
  }
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
  if (raw.current && raw.current.time !== undefined && raw.current.time !== null) {
    const parsedCurrentTime = parseTimeToUtcInstant(raw.current.time, timeZone);
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
      const timeVal = times[i];
      if (timeVal === undefined || timeVal === null) continue;

      const instantIso = parseTimeToUtcInstant(timeVal, timeZone);
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
  } catch {
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
 * Format an ISO instant into a localized hour string along with date and midnight crossing indicator.
 */
export function formatHourlyTimeWithDate(
  instantIso: string,
  timeZone: string,
  referenceInstantIso?: string
): FormattedHourlyTime {
  const date = new Date(instantIso);
  const tz = timeZone || "UTC";

  let timePart = "12:00 AM";
  let datePart = "";
  let fullPart = "";

  try {
    timePart = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);

    datePart = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    }).format(date);

    fullPart = `${datePart}, ${timePart}`;
  } catch {
    timePart = date.toTimeString().slice(0, 5);
    datePart = date.toDateString().slice(4, 10);
    fullPart = `${datePart}, ${timePart}`;
  }

  // Determine if it crosses into the next day
  let isNextDay = false;
  if (referenceInstantIso) {
    try {
      const refDate = new Date(referenceInstantIso);
      const refDatePart = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        month: "short",
        day: "numeric",
      }).format(refDate);
      isNextDay = datePart !== refDatePart;
    } catch {
      isNextDay = false;
    }
  } else {
    // If consecutive calls in series, check against previous call in this timezone
    const lastDay = lastSeenDayByTz[tz];
    if (lastDay && lastDay !== datePart) {
      isNextDay = true;
    }
    lastSeenDayByTz[tz] = datePart;
  }

  return {
    time: timePart,
    date: datePart,
    full: fullPart,
    isNextDay,
  };
}

/**
 * Reset time format tracker (useful between test runs or component mounts)
 */
export function resetTimeFormatTracker(): void {
  lastSeenDayByTz = {};
}

/**
 * Fetch forecast from Open-Meteo Air Quality API requesting unixtime timestamps,
 * protected with deduplicated coordinate caching and 8s upstream timeout.
 */
export async function getForecast(lat: number, lon: number, bypassCache = false): Promise<Forecast> {
  if (lat < -90 || lat > 90 || isNaN(lat)) {
    throw new Error(`Invalid latitude: ${lat}`);
  }
  if (lon < -180 || lon > 180 || isNaN(lon)) {
    throw new Error(`Invalid longitude: ${lon}`);
  }

  const fetchDirect = async (): Promise<Forecast> => {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(
      4
    )}&longitude=${lon.toFixed(
      4
    )}&current=pm2_5,us_aqi&hourly=pm2_5,us_aqi&timeformat=unixtime&timezone=auto&forecast_days=2`;

    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) {
      throw new Error(`Open-Meteo air quality error: ${res.status}`);
    }

    const raw: OpenMeteoAirQualityResponse = await res.json();
    return normalizeForecast(raw, lat, lon);
  };

  if (bypassCache) {
    return fetchDirect();
  }

  return getCachedForecast(lat, lon, fetchDirect);
}
