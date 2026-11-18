import { describe, it, expect } from "vitest";
import {
  regionalCells,
  normalizeLongitude,
  getCellValueAtInstant,
  type Bounds,
  type RegionalCell,
} from "@/lib/map/regional-cells";
import { Forecast } from "@/lib/forecast/types";

describe("regional cells grid sampling", () => {
  it("viewportUsesBoundedRegionalSamples: bounds cells to at most 9, normalizes wrapped longitudes, and selects hourly values from existing data", () => {
    // Normal viewport centered around Delhi
    const normalBounds: Bounds = {
      west: 76.8,
      south: 28.2,
      east: 77.6,
      north: 29.0,
    };
    const focused = { lat: 28.6139, lon: 77.209 };

    const cells: RegionalCell[] = regionalCells(normalBounds, focused);

    // Assert that there are at most nine requested cells
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(9);

    // Each cell has a valid stable ID, bounding box, and center coordinate
    for (const cell of cells) {
      expect(cell.id).toBeDefined();
      expect(cell.lat).toBeGreaterThanOrEqual(-90);
      expect(cell.lat).toBeLessThanOrEqual(90);
      expect(cell.lon).toBeGreaterThanOrEqual(-180);
      expect(cell.lon).toBeLessThanOrEqual(180);
      expect(cell.bounds.south).toBeLessThan(cell.bounds.north);
    }

    // Wrapped viewport (e.g. crossing the antimeridian or panned past 180 deg)
    const wrappedBounds: Bounds = {
      west: 175.0,
      south: -45.0,
      east: -175.0, // Crossing antimeridian: east wrapped
      north: -35.0,
    };
    const wrappedFocused = { lat: -40.0, lon: 179.0 };

    const wrappedCells = regionalCells(wrappedBounds, wrappedFocused);
    expect(wrappedCells.length).toBeLessThanOrEqual(9);

    // Wrapped viewports select valid longitudes in [-180, 180]
    for (const cell of wrappedCells) {
      expect(cell.lon).toBeGreaterThanOrEqual(-180);
      expect(cell.lon).toBeLessThanOrEqual(180);
      expect(cell.bounds.west).toBeGreaterThanOrEqual(-180);
      expect(cell.bounds.east).toBeLessThanOrEqual(180);
    }

    // Longitudinal wrapping normalization helper
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-195)).toBe(165);
    expect(normalizeLongitude(77.2)).toBe(77.2);

    // Assert an hourly value can be selected from existing data without refetching
    const mockForecast: Forecast = {
      lat: 28.61,
      lon: 77.2,
      timeZone: "Asia/Kolkata",
      source: "Open-Meteo",
      current: { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
      hourly: [
        { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
        { at: "2026-11-18T11:00:00Z", pm25: 110, usAqi: 178 },
        { at: "2026-11-18T12:00:00Z", pm25: 95, usAqi: 165 },
      ],
    };

    const valHour0 = getCellValueAtInstant(mockForecast, "2026-11-18T10:00:00Z");
    const valHour1 = getCellValueAtInstant(mockForecast, "2026-11-18T11:00:00Z");
    const valHourMissing = getCellValueAtInstant(mockForecast, "2026-11-18T15:00:00Z");

    expect(valHour0?.pm25).toBe(120);
    expect(valHour0?.usAqi).toBe(184);
    expect(valHour1?.pm25).toBe(110);
    expect(valHourMissing).toBeNull();
  });
});
