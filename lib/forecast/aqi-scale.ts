/**
 * Shared US AQI threshold table and styling helpers used across forecast cards and map layers.
 */

export interface AqiCategory {
  category:
    | "Good"
    | "Moderate"
    | "Unhealthy for Sensitive Groups"
    | "Unhealthy"
    | "Very Unhealthy"
    | "Hazardous";
  colorClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  description: string;
}

interface AqiScaleEntry {
  maxInclusive: number;
  category: AqiCategory;
  mapFillColor: string;
}

const MISSING_AQI_CATEGORY: AqiCategory = {
  category: "Moderate",
  colorClass: "text-stone-600",
  bgClass: "bg-stone-50",
  borderClass: "border-stone-200",
  badgeClass: "bg-stone-100 text-stone-700",
  description: "No estimate available",
};

const MISSING_AQI_MAP_FILL_COLOR = "rgba(100, 116, 139, 0.25)";

const HAZARDOUS_AQI_ENTRY: AqiScaleEntry = {
  maxInclusive: Number.POSITIVE_INFINITY,
  category: {
    category: "Hazardous",
    colorClass: "text-rose-900",
    bgClass: "bg-rose-100/80",
    borderClass: "border-rose-300",
    badgeClass: "bg-rose-200 text-rose-950 font-bold",
    description: "Health warning of emergency conditions; everyone is more likely to be affected.",
  },
  mapFillColor: "rgba(136, 19, 55, 0.65)",
};

const US_AQI_SCALE_ENTRIES: readonly AqiScaleEntry[] = [
  {
    maxInclusive: 50,
    category: {
      category: "Good",
      colorClass: "text-emerald-700",
      bgClass: "bg-emerald-50/70",
      borderClass: "border-emerald-200",
      badgeClass: "bg-emerald-100 text-emerald-800",
      description: "Air quality is satisfactory and poses little or no risk.",
    },
    mapFillColor: "rgba(16, 185, 129, 0.4)",
  },
  {
    maxInclusive: 100,
    category: {
      category: "Moderate",
      colorClass: "text-amber-700",
      bgClass: "bg-amber-50/70",
      borderClass: "border-amber-200",
      badgeClass: "bg-amber-100 text-amber-800",
      description: "Acceptable quality; sensitive individuals may experience minor symptoms.",
    },
    mapFillColor: "rgba(234, 179, 8, 0.4)",
  },
  {
    maxInclusive: 150,
    category: {
      category: "Unhealthy for Sensitive Groups",
      colorClass: "text-orange-700",
      bgClass: "bg-orange-50/70",
      borderClass: "border-orange-200",
      badgeClass: "bg-orange-100 text-orange-800",
      description: "Members of sensitive groups may experience health effects.",
    },
    mapFillColor: "rgba(249, 115, 22, 0.45)",
  },
  {
    maxInclusive: 200,
    category: {
      category: "Unhealthy",
      colorClass: "text-red-700",
      bgClass: "bg-red-50/70",
      borderClass: "border-red-200",
      badgeClass: "bg-red-100 text-red-800",
      description: "Everyone may begin to experience health effects; sensitive groups more seriously.",
    },
    mapFillColor: "rgba(244, 63, 94, 0.5)",
  },
  {
    maxInclusive: 300,
    category: {
      category: "Very Unhealthy",
      colorClass: "text-purple-800",
      bgClass: "bg-purple-50/70",
      borderClass: "border-purple-200",
      badgeClass: "bg-purple-100 text-purple-900",
      description: "Health alert: The risk of health effects is increased for everyone.",
    },
    mapFillColor: "rgba(168, 85, 247, 0.55)",
  },
];

function findAqiScaleEntry(usAqi: number): AqiScaleEntry {
  return US_AQI_SCALE_ENTRIES.find((entry) => usAqi <= entry.maxInclusive) ?? HAZARDOUS_AQI_ENTRY;
}

/**
 * Returns Tailwind UI category metadata and classes for a US AQI value.
 */
export function getAqiCategory(usAqi: number | null): AqiCategory {
  if (usAqi === null || usAqi === undefined || Number.isNaN(usAqi)) {
    return MISSING_AQI_CATEGORY;
  }
  return findAqiScaleEntry(usAqi).category;
}

/**
 * Returns the translucent RGBA polygon fill color representing a US AQI level on the map.
 */
export function getAqiMapFillColor(usAqi: number | null): string {
  if (usAqi === null || usAqi === undefined || Number.isNaN(usAqi)) {
    return MISSING_AQI_MAP_FILL_COLOR;
  }
  return findAqiScaleEntry(usAqi).mapFillColor;
}
