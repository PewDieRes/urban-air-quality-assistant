import { CityAnchorPreset, Coordinates } from "./types";

export const TOKYO_ANCHOR: CityAnchorPreset = {
  id: "tokyo-station",
  name: "Tokyo Station & Marunouchi",
  coordinates: { lat: 35.6812, lon: 139.7671 },
  altitudeOffset: 35,
  defaultMode: "photorealistic",
  cameraPresets: {
    home: {
      position: [0, 340, 480],
      target: [0, 30, 0],
      fov: 50,
    },
    aerial: {
      position: [120, 560, 520],
      target: [0, 40, -50],
      fov: 55,
    },
    skyline: {
      position: [-80, 110, 260],
      target: [40, 85, -120],
      fov: 60,
    },
  },
};

export const DELHI_ANCHOR: CityAnchorPreset = {
  id: "delhi-ncr",
  name: "Delhi-NCR (Central Connaught / Rajpath)",
  coordinates: { lat: 28.6139, lon: 77.209 },
  altitudeOffset: 215,
  defaultMode: "photorealistic",
  cameraPresets: {
    home: {
      position: [0, 320, 450],
      target: [0, 25, 0],
      fov: 50,
    },
    aerial: {
      position: [150, 520, 480],
      target: [0, 30, -60],
      fov: 55,
    },
    skyline: {
      position: [-90, 95, 240],
      target: [30, 70, -100],
      fov: 60,
    },
  },
};

export const CITY_PRESETS: CityAnchorPreset[] = [TOKYO_ANCHOR, DELHI_ANCHOR];

/**
 * Returns the verified scene anchor closest to the given coordinates,
 * or generates a dynamic anchor if outside verified boundaries.
 */
export function findAnchorForCoordinates(coords: Coordinates): CityAnchorPreset {
  // Check if within 50km of Tokyo
  const dTokyo = Math.hypot(coords.lat - TOKYO_ANCHOR.coordinates.lat, coords.lon - TOKYO_ANCHOR.coordinates.lon);
  if (dTokyo < 0.5) {
    return TOKYO_ANCHOR;
  }

  // Check if within 50km of Delhi
  const dDelhi = Math.hypot(coords.lat - DELHI_ANCHOR.coordinates.lat, coords.lon - DELHI_ANCHOR.coordinates.lon);
  if (dDelhi < 0.5) {
    return DELHI_ANCHOR;
  }

  // Generic worldwide anchor
  return {
    id: `custom-${coords.lat.toFixed(3)}-${coords.lon.toFixed(3)}`,
    name: `Custom Location (${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}°)`,
    coordinates: coords,
    altitudeOffset: 50,
    defaultMode: "terrain-buildings",
    cameraPresets: {
      home: {
        position: [0, 320, 450],
        target: [0, 25, 0],
        fov: 50,
      },
      aerial: {
        position: [150, 520, 480],
        target: [0, 30, -60],
        fov: 55,
      },
      skyline: {
        position: [-90, 95, 240],
        target: [30, 70, -100],
        fov: 60,
      },
    },
  };
}
