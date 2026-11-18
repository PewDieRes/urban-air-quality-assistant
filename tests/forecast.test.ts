import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeForecast,
  getForecast,
  formatHourlyTime,
  formatHourlyTimeWithDate,
  parseTimeToUtcInstant,
  type OpenMeteoAirQualityResponse,
} from "@/lib/forecast/open-meteo";
import { Forecast } from "@/lib/forecast/types";

describe("forecast normalization and time handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forecastUsesUniqueInstants: handles crossing midnight and daylight-saving clock changes with strictly unique, ordered instants", () => {
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
        time: [
          "2026-10-24T22:00:00Z",
          "2026-10-24T23:00:00Z",
          "2026-10-25T00:00:00Z",
          "2026-10-25T01:00:00Z",
          "2026-10-25T02:00:00Z",
          "2026-10-25T03:00:00Z",
        ],
        pm2_5: [12.0, 15.5, null, 18.2, null, 20.1],
        us_aqi: [50, 58, null, 64, null, 68],
      },
    };

    const forecast: Forecast = normalizeForecast(mockRawData, 51.5, -0.12, "Europe/London");

    expect(forecast.source).toBe("Open-Meteo");
    expect(forecast.timeZone).toBe("Europe/London");
    expect(forecast.hourly.length).toBe(6);

    const timestamps = forecast.hourly.map((h) => h.at);
    const uniqueTimestamps = Array.from(new Set(timestamps));
    expect(uniqueTimestamps.length).toBe(timestamps.length);

    for (let i = 1; i < timestamps.length; i++) {
      const prev = new Date(timestamps[i - 1]).getTime();
      const curr = new Date(timestamps[i]).getTime();
      expect(curr).toBeGreaterThan(prev);
    }

    expect(forecast.hourly[2].pm25).toBeNull();
    expect(forecast.hourly[2].usAqi).toBeNull();
    expect(forecast.hourly[4].pm25).toBeNull();
    expect(forecast.hourly[4].usAqi).toBeNull();

    const formattedDisplay = formatHourlyTime(forecast.hourly[2].at, "Europe/London");
    expect(formattedDisplay).toMatch(/1:00\s?(AM|am)/i);

    const kolkataDisplay = formatHourlyTime(forecast.hourly[2].at, "Asia/Kolkata");
    expect(kolkataDisplay).toMatch(/5:30\s?(AM|am)/i);
  });

  it("providerNaiveIsoTimestampsDisplayCorrectLocalHourInTokyoAndDelhiEvenOnUtcServer: a 2:00 PM local reading must display as 2:00 PM", () => {
    // Open-Meteo returns naive local strings like "2026-11-18T14:00" when timezone=auto is requested
    const tokyoRaw: OpenMeteoAirQualityResponse = {
      latitude: 35.6895,
      longitude: 139.6917,
      timezone: "Asia/Tokyo",
      current: { time: "2026-11-18T14:00", pm2_5: 18, us_aqi: 60 },
      hourly: {
        time: ["2026-11-18T14:00", "2026-11-18T15:00"],
        pm2_5: [18, 16],
        us_aqi: [60, 55],
      },
    };

    const tokyoForecast = normalizeForecast(tokyoRaw, 35.6895, 139.6917, "Asia/Tokyo");
    // In Tokyo, 2026-11-18 14:00 must format as 2:00 PM
    const tokyoFormatted = formatHourlyTime(tokyoForecast.hourly[0].at, "Asia/Tokyo");
    expect(tokyoFormatted).toMatch(/2:00\s?(PM|pm)/i);

    // Same test for Delhi (Asia/Kolkata, UTC+5:30)
    const delhiRaw: OpenMeteoAirQualityResponse = {
      latitude: 28.6139,
      longitude: 77.209,
      timezone: "Asia/Kolkata",
      current: { time: "2026-11-18T14:00", pm2_5: 120, us_aqi: 184 },
      hourly: {
        time: ["2026-11-18T14:00", "2026-11-18T15:00"],
        pm2_5: [120, 110],
        us_aqi: [184, 178],
      },
    };

    const delhiForecast = normalizeForecast(delhiRaw, 28.6139, 77.209, "Asia/Kolkata");
    const delhiFormatted = formatHourlyTime(delhiForecast.hourly[0].at, "Asia/Kolkata");
    expect(delhiFormatted).toMatch(/2:00\s?(PM|pm)/i);
  });

  it("shows the date where the forecast crosses midnight", () => {
    // Two timestamps crossing midnight in Tokyo: 23:00 on Nov 18 and 01:00 on Nov 19
    const instantBeforeMidnight = parseTimeToUtcInstant("2026-11-18T23:00", "Asia/Tokyo");
    const instantAfterMidnight = parseTimeToUtcInstant("2026-11-19T01:00", "Asia/Tokyo");

    const beforeDisplay = formatHourlyTimeWithDate(instantBeforeMidnight, "Asia/Tokyo");
    const afterDisplay = formatHourlyTimeWithDate(instantAfterMidnight, "Asia/Tokyo");

    expect(beforeDisplay.time).toMatch(/11:00\s?(PM|pm)/i);
    expect(beforeDisplay.date).toContain("Nov 18");

    expect(afterDisplay.time).toMatch(/1:00\s?(AM|am)/i);
    expect(afterDisplay.date).toContain("Nov 19");

    // Clear distinction across midnight
    expect(afterDisplay.isNextDay).toBe(true);
  });

  it("fetches and bounds forecast up to 24 future hourly slots", async () => {
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
