import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit } from "@/lib/security/rate-limit";
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
