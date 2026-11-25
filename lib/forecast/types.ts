export interface AirSample {
  /** ISO 8601 UTC timestamp of the measurement instant */
  at: string;
  /** Particulate Matter 2.5 concentration in µg/m³ (null if unavailable) */
  pm25: number | null;
  /** US Air Quality Index (0-500 scale, null if unavailable) */
  usAqi: number | null;
}

export interface Forecast {
  lat: number;
  lon: number;
  timeZone: string;
  source: "Open-Meteo";
  current: AirSample | null;
  /** Up to 24 upcoming hourly forecast slots, ordered by timestamp */
  hourly: AirSample[];
}

export type { AqiCategory } from "./aqi-scale";
export { getAqiCategory, getAqiMapFillColor } from "./aqi-scale";
