import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeForecast,
  getForecast,
  formatHourlyTime,
  type OpenMeteoAirQualityResponse,
} from "@/lib/forecast/open-meteo";
import { Forecast } from "@/lib/forecast/types";

describe("forecast normalization and time handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forecastUsesUniqueInstants: handles crossing midnight and daylight-saving clock changes with strictly unique, ordered instants", () => {
    // Simulated daylight saving transition (e.g., London autumn transition where local wall-clock repeated, but UTC differs)
    // 2026-10-25 00:00Z to 04:00Z crossing midnight
    const mockRawData: OpenMeteoAirQualityResponse = {
      latitude: 51.5,
      longitude: -0.12,
      timezone: "Europe/London",
      current: {
        time: "2026-10-24T23:00:00Z",
        pm2_5: 14.2,
        us_aqi: 55,
      },
      hourly: {
        // Crossing midnight and during daylight-saving fall-back
        time: [
          "2026-10-24T22:00:00Z",
          "2026-10-24T23:00:00Z",
          "2026-10-25T00:00:00Z", // Midnight UTC
          "2026-10-25T01:00:00Z", // Fall-back hour in UTC
          "2026-10-25T02:00:00Z",
          "2026-10-25T03:00:00Z",
        ],
        pm2_5: [12.0, 15.5, null, 18.2, null, 20.1], // Includes null missing measurements
        us_aqi: [50, 58, null, 64, null, 68],
      },
    };

    const forecast: Forecast = normalizeForecast(mockRawData, 51.5, -0.12, "Europe/London");

    expect(forecast.source).toBe("Open-Meteo");
    expect(forecast.timeZone).toBe("Europe/London");
    expect(forecast.hourly.length).toBe(6);

    // Assert that absolute timestamps are distinct and in order
    const timestamps = forecast.hourly.map((h) => h.at);
    const uniqueTimestamps = Array.from(new Set(timestamps));
    expect(uniqueTimestamps.length).toBe(timestamps.length);

    for (let i = 1; i < timestamps.length; i++) {
      const prev = new Date(timestamps[i - 1]).getTime();
      const curr = new Date(timestamps[i]).getTime();
      expect(curr).toBeGreaterThan(prev);
    }

    // Assert missing measurements stay null
    expect(forecast.hourly[2].pm25).toBeNull();
    expect(forecast.hourly[2].usAqi).toBeNull();
    expect(forecast.hourly[4].pm25).toBeNull();
    expect(forecast.hourly[4].usAqi).toBeNull();

    // Assert display uses the selected location's time zone
    // For 2026-10-25T00:00:00Z, in London (BST, UTC+1 before 2am), local time is 1:00 AM
    const formattedDisplay = formatHourlyTime(forecast.hourly[2].at, "Europe/London");
    expect(formattedDisplay).toMatch(/1:00\s?(AM|am)/i);

    // In Asia/Kolkata (UTC+5:30), same instant is 5:30 AM
    const kolkataDisplay = formatHourlyTime(forecast.hourly[2].at, "Asia/Kolkata");
    expect(kolkataDisplay).toMatch(/5:30\s?(AM|am)/i);
  });

  it("fetches and bounds forecast up to 24 future hourly slots", async () => {
    // Generate 48 hours of mock data
    const times: string[] = [];
    const pm25s: number[] = [];
    const aqis: number[] = [];

    const baseDate = new Date("2026-11-18T12:00:00Z");
    for (let i = 0; i < 48; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      times.push(d.toISOString());
      pm25s.push(50 + i);
      aqis.push(100 + i);
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: 28.61,
        longitude: 77.2,
        timezone: "Asia/Kolkata",
        current: {
          time: baseDate.toISOString(),
          pm2_5: 95.5,
          us_aqi: 172,
        },
        hourly: {
          time: times,
          pm2_5: pm25s,
          us_aqi: aqis,
        },
      }),
    });

    const forecast = await getForecast(28.61, 77.2);
    expect(forecast.hourly.length).toBeLessThanOrEqual(24);
    expect(forecast.current).not.toBeNull();
    expect(forecast.current?.pm25).toBe(95.5);
    expect(forecast.current?.usAqi).toBe(172);
  });

  it("rejects invalid coordinates", async () => {
    await expect(getForecast(95, 77)).rejects.toThrow(/invalid latitude/i);
    await expect(getForecast(28, 195)).rejects.toThrow(/invalid longitude/i);
  });
});
