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

export interface AqiCategory {
  category: "Good" | "Moderate" | "Unhealthy for Sensitive Groups" | "Unhealthy" | "Very Unhealthy" | "Hazardous";
  colorClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  description: string;
}

export function getAqiCategory(usAqi: number | null): AqiCategory {
  if (usAqi === null || usAqi === undefined || isNaN(usAqi)) {
    return {
      category: "Moderate",
      colorClass: "text-stone-600",
      bgClass: "bg-stone-50",
      borderClass: "border-stone-200",
      badgeClass: "bg-stone-100 text-stone-700",
      description: "No estimate available",
    };
  }

  if (usAqi <= 50) {
    return {
      category: "Good",
      colorClass: "text-emerald-700",
      bgClass: "bg-emerald-50/70",
      borderClass: "border-emerald-200",
      badgeClass: "bg-emerald-100 text-emerald-800",
      description: "Air quality is satisfactory and poses little or no risk.",
    };
  }
  if (usAqi <= 100) {
    return {
      category: "Moderate",
      colorClass: "text-amber-700",
      bgClass: "bg-amber-50/70",
      borderClass: "border-amber-200",
      badgeClass: "bg-amber-100 text-amber-800",
      description: "Acceptable quality; sensitive individuals may experience minor symptoms.",
    };
  }
  if (usAqi <= 150) {
    return {
      category: "Unhealthy for Sensitive Groups",
      colorClass: "text-orange-700",
      bgClass: "bg-orange-50/70",
      borderClass: "border-orange-200",
      badgeClass: "bg-orange-100 text-orange-800",
      description: "Members of sensitive groups may experience health effects.",
    };
  }
  if (usAqi <= 200) {
    return {
      category: "Unhealthy",
      colorClass: "text-red-700",
      bgClass: "bg-red-50/70",
      borderClass: "border-red-200",
      badgeClass: "bg-red-100 text-red-800",
      description: "Everyone may begin to experience health effects; sensitive groups more seriously.",
    };
  }
  if (usAqi <= 300) {
    return {
      category: "Very Unhealthy",
      colorClass: "text-purple-800",
      bgClass: "bg-purple-50/70",
      borderClass: "border-purple-200",
      badgeClass: "bg-purple-100 text-purple-900",
      description: "Health alert: The risk of health effects is increased for everyone.",
    };
  }
  return {
    category: "Hazardous",
    colorClass: "text-rose-900",
    bgClass: "bg-rose-100/80",
    borderClass: "border-rose-300",
    badgeClass: "bg-rose-200 text-rose-950 font-bold",
    description: "Health warning of emergency conditions; everyone is more likely to be affected.",
  };
}
