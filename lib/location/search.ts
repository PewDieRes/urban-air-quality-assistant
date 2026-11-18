import { fetchWithTimeout } from "../security/fetch-with-timeout";

export interface Place {
  id: string;
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
  timeZone?: string;
}

export const DEFAULT_PLACE: Place = {
  id: "delhi-ncr-default",
  name: "Delhi-NCR",
  region: "National Capital Region",
  country: "India",
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
};

export const TOKYO_PLACE: Place = {
  id: "tokyo-demo",
  name: "Tokyo",
  region: "Tokyo",
  country: "Japan",
  lat: 35.6762,
  lon: 139.6503,
  timeZone: "Asia/Tokyo",
};

export function formatPlaceLabel(place: Place): string {
  const parts: string[] = [place.name];
  if (place.region) {
    parts.push(place.region);
  }
  if (place.country) {
    parts.push(place.country);
  }
  return parts.join(", ");
}

interface OpenMeteoGeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  timezone?: string;
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoGeocodingResult[];
}

export async function searchLocations(query: string, limit = 8): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const boundedLimit = Math.min(Math.max(1, limit), 20);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    trimmed
  )}&count=${boundedLimit}&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding service returned status ${res.status}`);
  }

  const data: OpenMeteoGeocodingResponse = await res.json();
  if (!data.results || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item) => ({
    id: String(item.id),
    name: item.name,
    region: item.admin1,
    country: item.country,
    lat: item.latitude,
    lon: item.longitude,
    timeZone: item.timezone || "UTC",
  }));
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.trim().toLowerCase();
  return (
    clean === "localhost" ||
    clean === "::1" ||
    clean === "127.0.0.1" ||
    clean.startsWith("192.168.") ||
    clean.startsWith("10.") ||
    clean.startsWith("172.16.") ||
    clean.startsWith("172.17.") ||
    clean.startsWith("172.18.") ||
    clean.startsWith("172.19.") ||
    clean.startsWith("172.2") ||
    clean.startsWith("172.30.") ||
    clean.startsWith("172.31.") ||
    clean.startsWith("fe80:")
  );
}

/**
 * Detects user's geographic location from IP with multiple redundant providers.
 * Works accurately for localhost development (public outbound IP) and cloud deployments.
 */
export async function detectLocationFromIp(clientIp?: string): Promise<Place | null> {
  const isPrivate = !clientIp || isPrivateIp(clientIp);

  // Strategy 1: ipwho.is (HTTPS, IPv4/IPv6, fast worldwide coverage)
  try {
    const url = isPrivate ? "https://ipwho.is/" : `https://ipwho.is/${encodeURIComponent(clientIp!.trim())}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 4000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.latitude != null && data.longitude != null) {
        return {
          id: `ip-${(data.city || "loc").toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Number(data.latitude).toFixed(2)}`,
          name: data.city || data.region || "Current Location",
          region: data.region || undefined,
          country: data.country || undefined,
          lat: Number(data.latitude),
          lon: Number(data.longitude),
          timeZone: data.timezone?.id || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };
      }
    }
  } catch {
    // Try fallback
  }

  // Strategy 2: ip-api.com fallback
  try {
    const url = isPrivate ? "http://ip-api.com/json/" : `http://ip-api.com/json/${encodeURIComponent(clientIp!.trim())}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 4000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "success" && data.lat != null && data.lon != null) {
        return {
          id: `ip-${(data.city || "loc").toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Number(data.lat).toFixed(2)}`,
          name: data.city || data.regionName || "Current Location",
          region: data.regionName || undefined,
          country: data.country || undefined,
          lat: Number(data.lat),
          lon: Number(data.lon),
          timeZone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        };
      }
    }
  } catch {
    // Both failed
  }

  return null;
}

/**
 * Reverse geocodes coordinates to a human-readable city, region, and country
 * using OpenStreetMap Nominatim with graceful fallback.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<Place> {
  const fallbackPlace: Place = {
    id: `custom-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    name: "Selected Location",
    lat,
    lon,
    timeZone: "UTC",
  };

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "UrbanAirQualityAssistant/1.0",
          Accept: "application/json",
        },
      },
      4000
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const cityName =
          addr.city ||
          addr.town ||
          addr.municipality ||
          addr.village ||
          addr.suburb ||
          addr.county ||
          addr.state_district ||
          "Selected Location";
        const regionName = addr.state || addr.region || undefined;
        const countryName = addr.country || undefined;

        return {
          id: `rev-${lat.toFixed(4)}-${lon.toFixed(4)}`,
          name: cityName,
          region: regionName,
          country: countryName,
          lat,
          lon,
          timeZone: "UTC",
        };
      }
    }
  } catch {
    // Return fallback on timeout or error
  }

  return fallbackPlace;
}

