import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/fires/firms", () => ({
  listFires: vi.fn(),
}));

vi.mock("@/lib/forecast/open-meteo", () => ({
  getForecast: vi.fn(),
}));

vi.mock("@/lib/location/search", () => ({
  searchLocations: vi.fn(),
  reverseGeocode: vi.fn(),
}));

import { GET as getFires } from "@/app/api/fires/route";
import { GET as getForecastRoute } from "@/app/api/forecast/route";
import { GET as getForecastGrid } from "@/app/api/forecast/grid/route";
import { GET as getLocations } from "@/app/api/locations/route";
import { GET as detectLocation } from "@/app/api/locations/detect/route";
import { GET as reverseLocation } from "@/app/api/locations/reverse/route";
import { FireDetection, listFires } from "@/lib/fires/firms";
import { getForecast } from "@/lib/forecast/open-meteo";
import { Forecast } from "@/lib/forecast/types";
import { Place, reverseGeocode, searchLocations } from "@/lib/location/search";

const SAMPLE_FORECAST: Forecast = {
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-18T10:00:00Z", pm25: 110, usAqi: 179 },
  hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 110, usAqi: 179 }],
};

const SAMPLE_FIRES: FireDetection[] = [
  {
    id: "firms-1",
    lat: 30.2,
    lon: 75.8,
    observedAt: "2026-11-18T08:00:00Z",
    source: "NASA FIRMS",
    confidence: "nominal",
    frp: 24.5,
  },
];

describe("REST API routes validation, rate limiting, and provider error masking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/fires", () => {
    it("rejects missing and malformed coordinates with HTTP 400", async () => {
      const missingRes = await getFires(new NextRequest("https://example.test/api/fires?west=76"));
      expect(missingRes.status).toBe(400);

      const garbageRes = await getFires(
        new NextRequest(
          "https://example.test/api/fires?west=76abc&south=28&east=78&north=29"
        )
      );
      expect(garbageRes.status).toBe(400);
    });

    it("returns detections on success and masks upstream errors with HTTP 503", async () => {
      vi.mocked(listFires).mockResolvedValueOnce(SAMPLE_FIRES);
      const okRes = await getFires(
        new NextRequest("https://example.test/api/fires?west=75&south=29&east=77&north=31")
      );
      expect(okRes.status).toBe(200);
      expect(await okRes.json()).toEqual({ fires: SAMPLE_FIRES });

      vi.mocked(listFires).mockRejectedValueOnce(new Error("FIRMS key invalid"));
      const failRes = await getFires(
        new NextRequest("https://example.test/api/fires?west=75&south=29&east=77&north=31")
      );
      const failBody = (await failRes.json()) as { error?: { code?: string; message?: string } };
      expect(failRes.status).toBe(503);
      expect(failBody.error?.code).toBe("PROVIDER_FAILURE");
      expect(failBody.error?.message).not.toContain("FIRMS key");
    });

    it("enforces per-IP rate limiting with HTTP 429", async () => {
      vi.stubEnv("VERCEL", "1");
      vi.mocked(listFires).mockResolvedValue([]);
      for (let i = 0; i < 60; i++) {
        const res = await getFires(
          new NextRequest("https://example.test/api/fires?west=75&south=29&east=77&north=31", {
            headers: { "x-vercel-forwarded-for": "203.0.113.72" },
          })
        );
        expect(res.status).toBe(200);
      }
      const blocked = await getFires(
        new NextRequest("https://example.test/api/fires?west=75&south=29&east=77&north=31", {
          headers: { "x-vercel-forwarded-for": "203.0.113.72" },
        })
      );
      expect(blocked.status).toBe(429);
    });
  });

  describe("GET /api/forecast and GET /api/forecast/grid", () => {
    it("validates forecast query parameters and masks provider failures", async () => {
      expect(
        (await getForecastRoute(new NextRequest("https://example.test/api/forecast?lat=28"))).status
      ).toBe(400);
      expect(
        (
          await getForecastRoute(
            new NextRequest("https://example.test/api/forecast?lat=95&lon=77")
          )
        ).status
      ).toBe(400);
      expect(
        (
          await getForecastRoute(
            new NextRequest("https://example.test/api/forecast?lat=28.6xyz&lon=77")
          )
        ).status
      ).toBe(400);

      vi.mocked(getForecast).mockRejectedValueOnce(new Error("Open-Meteo socket error"));
      const failRes = await getForecastRoute(
        new NextRequest("https://example.test/api/forecast?lat=28.6&lon=77.2")
      );
      expect(failRes.status).toBe(503);

      vi.mocked(getForecast).mockResolvedValueOnce(SAMPLE_FORECAST);
      const okRes = await getForecastRoute(
        new NextRequest("https://example.test/api/forecast?lat=28.6&lon=77.2")
      );
      expect(okRes.status).toBe(200);
    });

    it("validates grid bounds, handles partial cell success, and returns 503 when all cells fail", async () => {
      const invertedBoundsRes = await getForecastGrid(
        new NextRequest(
          "https://example.test/api/forecast/grid?west=76&south=30&east=78&north=28&lat=29&lon=77"
        )
      );
      expect(invertedBoundsRes.status).toBe(400);

      // Total failure across all sampled cells returns HTTP 503
      vi.mocked(getForecast).mockRejectedValue(new Error("Upstream timeout"));
      const allFailRes = await getForecastGrid(
        new NextRequest(
          "https://example.test/api/forecast/grid?west=76.5&south=28&east=77.5&north=29&lat=28.6&lon=77.2"
        )
      );
      expect(allFailRes.status).toBe(503);

      // Partial failure still returns fulfilled cells with HTTP 200
      vi.mocked(getForecast)
        .mockResolvedValueOnce(SAMPLE_FORECAST)
        .mockRejectedValue(new Error("Transient cell error"));
      const partialRes = await getForecastGrid(
        new NextRequest(
          "https://example.test/api/forecast/grid?west=76.5&south=28&east=77.5&north=29&lat=28.6&lon=77.2"
        )
      );
      const partialBody = (await partialRes.json()) as { grid: Array<{ forecast: Forecast }> };
      expect(partialRes.status).toBe(200);
      expect(partialBody.grid).toHaveLength(1);
    });
  });

  describe("GET /api/locations, /detect, and /reverse", () => {
    it("handles empty queries, validates length, and enforces rate limit on location search", async () => {
      const emptyRes = await getLocations(new NextRequest("https://example.test/api/locations?q="));
      expect(emptyRes.status).toBe(200);
      expect(await emptyRes.json()).toEqual({ places: [] });

      const longQuery = "a".repeat(101);
      const tooLongRes = await getLocations(
        new NextRequest(`https://example.test/api/locations?q=${longQuery}`)
      );
      expect(tooLongRes.status).toBe(400);

      vi.mocked(searchLocations).mockRejectedValueOnce(new Error("Geocoder 500"));
      const errorRes = await getLocations(
        new NextRequest("https://example.test/api/locations?q=Delhi")
      );
      expect(errorRes.status).toBe(503);

      const places: Place[] = [
        { id: "1", name: "Delhi", region: "Delhi", country: "India", lat: 28.6, lon: 77.2 },
      ];
      vi.mocked(searchLocations).mockResolvedValue(places);
      vi.stubEnv("VERCEL", "1");
      for (let i = 0; i < 60; i++) {
        const res = await getLocations(
          new NextRequest("https://example.test/api/locations?q=Delhi", {
            headers: { "x-vercel-forwarded-for": "203.0.113.73" },
          })
        );
        expect(res.status).toBe(200);
      }
      const blocked = await getLocations(
        new NextRequest("https://example.test/api/locations?q=Delhi", {
          headers: { "x-vercel-forwarded-for": "203.0.113.73" },
        })
      );
      expect(blocked.status).toBe(429);
    });

    it("protects IP detection with private cache headers and validates reverse coordinates", async () => {
      vi.stubEnv("VERCEL", "");
      const notVercelRes = await detectLocation(
        new NextRequest("https://example.test/api/locations/detect")
      );
      expect(notVercelRes.status).toBe(404);

      vi.stubEnv("VERCEL", "1");
      const detectedRes = await detectLocation(
        new NextRequest("https://example.test/api/locations/detect", {
          headers: {
            "x-vercel-ip-latitude": "35.6762",
            "x-vercel-ip-longitude": "139.6503",
            "x-vercel-ip-city": "Tokyo",
            "x-vercel-ip-country": "JP",
          },
        })
      );
      expect(detectedRes.status).toBe(200);
      expect(detectedRes.headers.get("Cache-Control")).toBe("private, no-store");

      expect(
        (
          await reverseLocation(
            new NextRequest("https://example.test/api/locations/reverse?lat=-95&lon=10")
          )
        ).status
      ).toBe(400);

      vi.mocked(reverseGeocode).mockRejectedValueOnce(new Error("Nominatim failure"));
      const revFail = await reverseLocation(
        new NextRequest("https://example.test/api/locations/reverse?lat=35.6&lon=139.6")
      );
      expect(revFail.status).toBe(503);
    });
  });
});
