import { HazeStyle } from "./types";

/**
 * Derives stylized 3D atmospheric haze properties strictly from forecast PM₂.₅ concentration.
 * Enforces bounded, monotonic opacity and extinction scaling so higher pollutant hours
 * visually produce denser haze while keeping building facades legible.
 *
 * Exact user-facing disclaimer label: "Illustration of forecast pollution".
 */
export function getHazeStyle(pm25: number | null | undefined): HazeStyle | null {
  if (pm25 == null || typeof pm25 !== "number" || isNaN(pm25) || !isFinite(pm25) || pm25 < 0) {
    return null;
  }

  // Bounded non-linear curve: smoothstep transition matching WHO/EPA air quality tiers
  // Baseline clean threshold: 12 µg/m³, Hazardous threshold: 250+ µg/m³
  const clampedPm25 = Math.min(Math.max(pm25, 0), 500);

  // Normalized factor [0, 1] using power curve for high contrast between clean and smog
  const normalized = Math.min(1.0, Math.pow(clampedPm25 / 200, 0.75));

  // Monotonic opacity: bounded between 0.08 (lightest atmospheric depth) and 0.88 (dense inversion)
  const opacity = Math.min(0.88, Math.max(0.08, 0.08 + normalized * 0.80));

  // Monotonic extinction density: bounded between 0.05 and 0.85
  const density = Math.min(0.85, Math.max(0.05, 0.05 + normalized * 0.80));

  // Atmospheric layer ceiling: winter thermal inversions trap pollutants closer to the ground
  // (320m for high smog down to 180m, allowing skyscrapers to peek through)
  const heightCeiling = Math.max(180, 360 - normalized * 140);

  // Smog aerosol tint progression: mist grey -> amber haze -> dense brownish winter smog
  let color = "#cbd5e1";
  let alertLevel: HazeStyle["alertLevel"] = "good";
  let label = "Good";

  if (clampedPm25 <= 12) {
    color = "#cbd5e1"; // slate mist
    alertLevel = "good";
    label = "Low Exposure · Clean Air";
  } else if (clampedPm25 <= 35.4) {
    color = "#b0c4de"; // light haze
    alertLevel = "moderate";
    label = "Moderate Haze";
  } else if (clampedPm25 <= 55.4) {
    color = "#d4af37"; // golden amber tint
    alertLevel = "unhealthy_sensitive";
    label = "Sensitive Group Alert";
  } else if (clampedPm25 <= 150.4) {
    color = "#b8860b"; // dark goldenrod / particulate haze
    alertLevel = "unhealthy";
    label = "Unhealthy Smog";
  } else if (clampedPm25 <= 250.4) {
    color = "#8b4513"; // brownish smog layer
    alertLevel = "very_unhealthy";
    label = "Very Unhealthy Inversion";
  } else {
    color = "#5c3317"; // heavy particulate smog
    alertLevel = "hazardous";
    label = "Hazardous Ground Inversion";
  }

  return {
    pm25: clampedPm25,
    density,
    opacity,
    color,
    heightCeiling,
    alertLevel,
    label,
  };
}
