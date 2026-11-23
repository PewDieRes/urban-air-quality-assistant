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

