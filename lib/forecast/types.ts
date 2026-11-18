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
  description: string;
}

export function getAqiCategory(usAqi: number | null): AqiCategory {
  if (usAqi === null || usAqi === undefined || isNaN(usAqi)) {
    return {
      category: "Moderate",
      colorClass: "text-slate-400",
      bgClass: "bg-slate-800",
      borderClass: "border-slate-700",
      description: "No estimate available",
    };
  }

  if (usAqi <= 50) {
    return {
      category: "Good",
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      borderClass: "border-emerald-500/30",
      description: "Air quality is satisfactory and poses little or no risk.",
    };
  }
  if (usAqi <= 100) {
    return {
      category: "Moderate",
      colorClass: "text-yellow-400",
      bgClass: "bg-yellow-500/10",
      borderClass: "border-yellow-500/30",
      description: "Acceptable quality; sensitive individuals may experience minor symptoms.",
    };
  }
  if (usAqi <= 150) {
    return {
      category: "Unhealthy for Sensitive Groups",
      colorClass: "text-orange-400",
      bgClass: "bg-orange-500/10",
      borderClass: "border-orange-500/30",
      description: "Members of sensitive groups may experience health effects.",
    };
  }
  if (usAqi <= 200) {
    return {
      category: "Unhealthy",
      colorClass: "text-rose-400",
      bgClass: "bg-rose-500/10",
      borderClass: "border-rose-500/30",
      description: "Everyone may begin to experience health effects; sensitive groups more seriously.",
    };
  }
  if (usAqi <= 300) {
    return {
      category: "Very Unhealthy",
      colorClass: "text-purple-400",
      bgClass: "bg-purple-500/10",
      borderClass: "border-purple-500/30",
      description: "Health alert: The risk of health effects is increased for everyone.",
    };
  }
  return {
    category: "Hazardous",
    colorClass: "text-red-500",
    bgClass: "bg-red-500/20",
    borderClass: "border-red-500/50",
    description: "Health warning of emergency conditions; everyone is more likely to be affected.",
  };
}
