import { Bounds, clampLatitude, normalizeLongitude } from "../map/regional-cells";

export interface FireDetection {
  id: string;
  lat: number;
  lon: number;
  observedAt: string; // ISO 8601 UTC
  source: "NASA FIRMS";
  confidence?: string;
  frp?: number; // Fire Radiative Power (MW)
}

/**
 * Parses NASA FIRMS CSV output into strictly typed FireDetection objects.
 * Handles zero-padding of 3 or 4-digit acq_time (e.g. '830' -> '08:30' UTC).
 */
export function parseFirmsCsv(csvText: string): FireDetection[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const latIdx = header.indexOf("latitude");
  const lonIdx = header.indexOf("longitude");
  const dateIdx = header.indexOf("acq_date");
  const timeIdx = header.indexOf("acq_time");
  const confIdx = header.indexOf("confidence");
  const frpIdx = header.indexOf("frp");

  if (latIdx === -1 || lonIdx === -1 || dateIdx === -1 || timeIdx === -1) {
    return [];
  }

  const detections: FireDetection[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim());
    const lat = parseFloat(parts[latIdx]);
    const lon = parseFloat(parts[lonIdx]);

    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180) {
      continue; // Skip invalid coordinates
    }

    const dateStr = parts[dateIdx]; // YYYY-MM-DD
    const rawTime = parts[timeIdx]; // e.g. "830" or "1425"

    // Pad time with leading zeros to 4 digits
    const paddedTime = rawTime.padStart(4, "0");
    const hh = paddedTime.slice(0, 2);
    const mm = paddedTime.slice(2, 4);

    const observedAt = `${dateStr}T${hh}:${mm}:00.000Z`;

    // Ensure valid ISO date
    const dateObj = new Date(observedAt);
    if (isNaN(dateObj.getTime())) continue;

    const id = `firms-${lat.toFixed(4)}-${lon.toFixed(4)}-${dateStr}-${paddedTime}`;

    detections.push({
      id,
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      observedAt: dateObj.toISOString(),
      source: "NASA FIRMS",
      confidence: confIdx !== -1 ? parts[confIdx] : undefined,
      frp: frpIdx !== -1 && !isNaN(parseFloat(parts[frpIdx])) ? parseFloat(parts[frpIdx]) : undefined,
    });
  }

  return detections;
}

/**
 * Fetch active fire detections from NASA FIRMS API within the bounding box.
 * Automatically splits queries crossing the 180° antimeridian.
 */
export async function listFires(bounds: Bounds, apiKey?: string): Promise<FireDetection[]> {
  const key = apiKey || process.env.FIRMS_MAP_KEY;

  // Handle antimeridian crossing
  if (bounds.west > bounds.east) {
    const box1: Bounds = {
      west: bounds.west,
      south: bounds.south,
      east: 180,
      north: bounds.north,
    };
    const box2: Bounds = {
      west: -180,
      south: bounds.south,
      east: bounds.east,
      north: bounds.north,
    };

    const [res1, res2] = await Promise.all([
      fetchFirmsBbox(box1, key),
      fetchFirmsBbox(box2, key),
    ]);

    return [...res1, ...res2];
  }

  return fetchFirmsBbox(bounds, key);
}

async function fetchFirmsBbox(bounds: Bounds, key?: string): Promise<FireDetection[]> {
  if (!key || key === "your-firms-map-key") {
    // Demo fallback for active fires in Northern India / Punjab-Haryana agricultural fire season
    return getDemoFires(bounds);
  }

  const w = bounds.west.toFixed(2);
  const s = bounds.south.toFixed(2);
  const e = bounds.east.toFixed(2);
  const n = bounds.north.toFixed(2);

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${w},${s},${e},${n}/1`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NASA FIRMS API returned status ${res.status}: ${res.statusText}`);
  }

  const csv = await res.text();
  return parseFirmsCsv(csv);
}

function getDemoFires(bounds: Bounds): FireDetection[] {
  // Realistic demonstration fire detections in agricultural zones upwind of Delhi (Punjab / Haryana)
  const candidateFires: FireDetection[] = [
    {
      id: "firms-demo-1",
      lat: 30.345,
      lon: 76.382,
      observedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      source: "NASA FIRMS",
      confidence: "nominal",
      frp: 18.4,
    },
    {
      id: "firms-demo-2",
      lat: 30.122,
      lon: 76.712,
      observedAt: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
      source: "NASA FIRMS",
      confidence: "high",
      frp: 28.1,
    },
    {
      id: "firms-demo-3",
      lat: 29.854,
      lon: 76.541,
      observedAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
      source: "NASA FIRMS",
      confidence: "nominal",
      frp: 12.0,
    },
    {
      id: "firms-demo-4",
      lat: 29.412,
      lon: 77.021,
      observedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      source: "NASA FIRMS",
      confidence: "nominal",
      frp: 9.5,
    },
  ];

  return candidateFires.filter(
    (f) =>
      f.lat >= bounds.south &&
      f.lat <= bounds.north &&
      f.lon >= bounds.west &&
      f.lon <= bounds.east
  );
}
