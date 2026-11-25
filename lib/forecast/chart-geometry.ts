import { formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";
import { AirSample } from "@/lib/forecast/types";

export interface ChartPoint {
  x: number;
  y: number | null;
  sample: AirSample;
  index: number;
}

export interface PlottedSegmentPoint {
  x: number;
  y: number;
  sample: AirSample;
  index: number;
}

export interface ForecastChartGeometry {
  maxPm25: number;
  points: ChartPoint[];
  midnightIndices: number[];
  pathSegments: PlottedSegmentPoint[][];
}

export const FORECAST_CHART_DIMENSIONS = {
  width: 1000,
  height: 200,
  paddingLeft: 50,
  paddingRight: 20,
  paddingTop: 25,
  paddingBottom: 35,
} as const;

/**
 * Projects 24-hour PM2.5 samples onto SVG coordinates, splitting contiguous line paths across data gaps.
 */
export function buildForecastChartGeometry(
  hourlySlots: AirSample[],
  timeZone: string
): ForecastChartGeometry {
  if (hourlySlots.length === 0) {
    return { maxPm25: 100, points: [], midnightIndices: [], pathSegments: [] };
  }

  const validPmValues = hourlySlots
    .map((sample) => sample.pm25)
    .filter((value): value is number => value !== null && !Number.isNaN(value));
  const highestPm25 = validPmValues.length > 0 ? Math.max(...validPmValues) : 50;
  const maxPm25 = Math.max(60, Math.ceil((highestPm25 * 1.25) / 25) * 25);

  const { width, height, paddingLeft, paddingRight, paddingTop, paddingBottom } =
    FORECAST_CHART_DIMENSIONS;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const stepX = hourlySlots.length > 1 ? plotWidth / (hourlySlots.length - 1) : plotWidth;

  const midnightIndices: number[] = [];
  const points: ChartPoint[] = hourlySlots.map((sample, index) => {
    const x = paddingLeft + index * stepX;
    let y: number | null = null;
    if (sample.pm25 !== null && !Number.isNaN(sample.pm25)) {
      const normalized = Math.min(1, Math.max(0, sample.pm25 / maxPm25));
      y = paddingTop + plotHeight * (1 - normalized);
    }

    const formatted = formatHourlyTimeWithDate(sample.at, timeZone);
    if (formatted.isNextDay && index > 0) {
      midnightIndices.push(index);
    }

    return { x, y, sample, index };
  });

  const pathSegments: PlottedSegmentPoint[][] = [];
  let currentSegment: PlottedSegmentPoint[] = [];

  for (const point of points) {
    if (point.y !== null) {
      currentSegment.push({ x: point.x, y: point.y, sample: point.sample, index: point.index });
    } else if (currentSegment.length > 0) {
      pathSegments.push(currentSegment);
      currentSegment = [];
    }
  }
  if (currentSegment.length > 0) {
    pathSegments.push(currentSegment);
  }

  return { maxPm25, points, midnightIndices, pathSegments };
}
