import { Forecast, AirSample } from "../forecast/types";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface RegionalCell {
  id: string;
  bounds: Bounds;
  lat: number;
  lon: number;
}

/**
 * Normalizes longitudes into the range [-180, 180].
 */
export function normalizeLongitude(lon: number): number {
  let l = lon;
  while (l < -180) l += 360;
  while (l > 180) l -= 360;
  return l;
}

/**
 * Normalizes latitude into [-90, 90].
 */
export function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Generates at most 9 bounded regional cells across the viewport,
 * centered around the focused coordinate and handling antimeridian crossing.
 */
export function regionalCells(
  bounds: Bounds,
  focused: { lat: number; lon: number }
): RegionalCell[] {
  const normFocusedLat = clampLatitude(focused.lat);
  const normFocusedLon = normalizeLongitude(focused.lon);

  // Compute longitude span, handling antimeridian wrapping
  let lonSpan: number;
  if (bounds.east >= bounds.west) {
    lonSpan = bounds.east - bounds.west;
  } else {
    // Crosses antimeridian (e.g. west: 170, east: -170 => span: 20)
    lonSpan = 180 - bounds.west + (bounds.east - (-180));
  }

  const latSpan = Math.max(0.05, Math.min(60, bounds.north - bounds.south));
  lonSpan = Math.max(0.05, Math.min(120, lonSpan));

  // Determine cell step size (approx 1/3 of viewport span, bounded)
  const latStep = Math.max(0.1, latSpan / 3);
  const lonStep = Math.max(0.1, lonSpan / 3);

  const cells: RegionalCell[] = [];

  // Generate a 3x3 grid around the focus point: -1, 0, +1 in lat and lon
  const offsets = [-1, 0, 1];

  for (const latIdx of offsets) {
    for (const lonIdx of offsets) {
      const centerLat = clampLatitude(normFocusedLat + latIdx * latStep);
      const centerLon = normalizeLongitude(normFocusedLon + lonIdx * lonStep);

      const halfLat = latStep / 2;
      const halfLon = lonStep / 2;

      const south = clampLatitude(centerLat - halfLat);
      const north = clampLatitude(centerLat + halfLat);
      const west = normalizeLongitude(centerLon - halfLon);
      const east = normalizeLongitude(centerLon + halfLon);

      const id = `cell-${centerLat.toFixed(2)}-${centerLon.toFixed(2)}`;

      cells.push({
        id,
        lat: Number(centerLat.toFixed(4)),
        lon: Number(centerLon.toFixed(4)),
        bounds: {
          west: Number(west.toFixed(4)),
          south: Number(south.toFixed(4)),
          east: Number(east.toFixed(4)),
          north: Number(north.toFixed(4)),
        },
      });
    }
  }

  // Strictly bound to at most 9 cells
  return cells.slice(0, 9);
}

/**
 * Selects an hourly sample for a cell at a specific ISO instant from existing forecast data.
 */
export function getCellValueAtInstant(
  forecast: Forecast,
  instantIso: string
): AirSample | null {
  if (!forecast || !forecast.hourly || forecast.hourly.length === 0) {
    return null;
  }

  const targetTimeMs = new Date(instantIso).getTime();
  if (isNaN(targetTimeMs)) return null;

  // Exact match
  const exact = forecast.hourly.find((h) => h.at === instantIso);
  if (exact) return exact;

  // Closest match within 45 minutes
  let closest: AirSample | null = null;
  let minDiff = 45 * 60 * 1000;

  for (const sample of forecast.hourly) {
    const sampleMs = new Date(sample.at).getTime();
    const diff = Math.abs(sampleMs - targetTimeMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = sample;
    }
  }

  return closest;
}
