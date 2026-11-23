import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { enforceRateLimit, getClientIp, rateLimit } from "@/lib/security/rate-limit";
import { fetchWithTimeout } from "@/lib/security/fetch-with-timeout";
import { getCachedForecast, clearForecastCache } from "@/lib/cache/forecast-cache";
import { Forecast } from "@/lib/forecast/types";

describe("security, rate limiting, timeouts and caching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearForecastCache();
  });

  it("rateLimitEnforcesThresholdAndReturnsRetryAfter", () => {
    const testIp = "192.168.1.100";
    const limit = 5;
    const windowMs = 10000;

    // First 5 requests should succeed
    for (let i = 0; i < limit; i++) {
      const res = rateLimit(testIp, limit, windowMs);
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(limit - (i + 1));
    }

    // 6th request must be rejected with 429 semantics
    const rejected = rateLimit(testIp, limit, windowMs);
    expect(rejected.success).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.resetMs).toBeGreaterThan(0);
  });

  it("trusts only the platform visitor header on Vercel", () => {
    const req = new NextRequest("https://example.test", { headers: {
      "x-forwarded-for": "203.0.113.4", "x-vercel-forwarded-for": "203.0.113.5",
    }});
    try {
      vi.stubEnv("VERCEL", "");
      expect(getClientIp(req)).toBe("shared");
      vi.stubEnv("VERCEL", "1");
      expect(getClientIp(req)).toBe("203.0.113.5");
    } finally { vi.unstubAllEnvs(); }
  });

  it("uses the shared count and fails closed on shared limiter failure", async () => {
    try {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.test");
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
      const req = new NextRequest("https://example.test/api/plan");
      const fetcher = vi.fn().mockResolvedValueOnce({ok: true, json: async () => ({result: [6, 4000]})})
        .mockResolvedValueOnce({ok: false});
      vi.stubGlobal("fetch", fetcher);
      const limited = await enforceRateLimit(req, 5);
      expect(limited?.status).toBe(429);
      expect(limited?.headers.get("Retry-After")).toBe("4");
      expect((await enforceRateLimit(req, 5))?.status).toBe(503);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

  it("fetchWithTimeoutAbortsWhenUpstreamHangs", async () => {
    // Simulate a hanging fetch
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    await expect(
      fetchWithTimeout("https://api.example.com/slow", {}, 50)
    ).rejects.toThrow(/timed out after 50ms/i);
  });

  it("forecastCacheDeduplicatesConcurrentRequestsForSameRoundedCoordinate", async () => {
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "Asia/Kolkata",
      source: "Open-Meteo",
      current: { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
      hourly: [],
    };

    let fetchCount = 0;
    const slowFetcher = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 20));
      return mockForecast;
    };

    // Trigger two simultaneous requests for close coordinates that round to the same key
    const [res1, res2] = await Promise.all([
      getCachedForecast(28.6139, 77.2090, slowFetcher),
      getCachedForecast(28.6141, 77.2092, slowFetcher),
    ]);

    expect(res1).toEqual(mockForecast);
    expect(res2).toEqual(mockForecast);
    // Fetcher should have been called only ONCE!
    expect(fetchCount).toBe(1);
  });
});
