import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_PLACE, TOKYO_PLACE } from "@/lib/location/search";

vi.mock("@/components/map/air-quality-view", () => ({
  AirQualityView: () => <div data-testid="mock-air-quality-view" />,
}));

import Home from "@/app/page";

beforeAll(() => {
  if (typeof window !== "undefined" && !window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => "blob:mock");
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mockDelhiForecast = {
  lat: DEFAULT_PLACE.lat,
  lon: DEFAULT_PLACE.lon,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
  hourly: [
    { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
    { at: "2026-11-18T11:00:00Z", pm25: 140, usAqi: 195 },
  ],
};

const mockTokyoForecast = {
  lat: TOKYO_PLACE.lat,
  lon: TOKYO_PLACE.lon,
  timeZone: "Asia/Tokyo",
  source: "Open-Meteo",
  current: { at: "2026-11-18T10:00:00Z", pm25: 18, usAqi: 63 },
  hourly: [
    { at: "2026-11-18T10:00:00Z", pm25: 18, usAqi: 63 },
    { at: "2026-11-18T11:00:00Z", pm25: 15, usAqi: 57 },
  ],
};

describe("forecast race conditions and ownership", () => {
  it("keeps Tokyo visible when Tokyo resolves before an obsolete Delhi request resolves", async () => {
    let resolveDelhi: ((value: unknown) => void) | null = null;
    let resolveTokyo: ((value: unknown) => void) | null = null;

    const delhiPromise = new Promise((resolve) => {
      resolveDelhi = resolve;
    });
    const tokyoPromise = new Promise((resolve) => {
      resolveTokyo = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes(String(DEFAULT_PLACE.lat))) {
        return delhiPromise;
      }
      if (url.includes(String(TOKYO_PLACE.lat))) {
        return tokyoPromise;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ forecast: mockDelhiForecast }),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    // Delhi request is now in flight
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(String(DEFAULT_PLACE.lat)),
      expect.any(Object)
    );

    // User switches to Tokyo Demo before Delhi completes
    const tokyoBtn = screen.getByRole("button", { name: "Tokyo Demo" });
    fireEvent.click(tokyoBtn);

    // Tokyo request is now also in flight
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(String(TOKYO_PLACE.lat)),
      expect.any(Object)
    );

    // Resolve Tokyo first
    resolveTokyo!({
      ok: true,
      json: async () => ({ forecast: mockTokyoForecast }),
    });

    // Tokyo data is rendered (18.0 µg/m³)
    await waitFor(() => {
      expect(screen.getByTestId("current-pm25-value").textContent).toBe("18.0");
    });

    // Now resolve the older, obsolete Delhi request
    resolveDelhi!({
      ok: true,
      json: async () => ({ forecast: mockDelhiForecast }),
    });

    // Small delay to allow any microtasks or state updates to run
    await new Promise((r) => setTimeout(r, 50));

    // Tokyo must remain displayed! Delhi's 120.0 µg/m³ must NOT overwrite Tokyo!
    expect(screen.getByTestId("current-pm25-value").textContent).toBe("18.0");
    expect(screen.getByTestId("selected-location-name").textContent).toBe("Tokyo");
  });

  it("ignores stale Delhi rejection after Tokyo succeeds without displaying an error", async () => {
    let rejectDelhi: ((reason: unknown) => void) | null = null;

    const delhiPromise = new Promise((_, reject) => {
      rejectDelhi = reject;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes(String(DEFAULT_PLACE.lat))) {
        return delhiPromise;
      }
      if (url.includes(String(TOKYO_PLACE.lat))) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ forecast: mockTokyoForecast }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ forecast: mockDelhiForecast }),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    // Switch to Tokyo
    const tokyoBtn = screen.getByRole("button", { name: "Tokyo Demo" });
    fireEvent.click(tokyoBtn);

    // Tokyo succeeds
    await waitFor(() => {
      expect(screen.getByTestId("current-pm25-value").textContent).toBe("18.0");
    });

    // Obsolete Delhi request now rejects with error
    rejectDelhi!(new Error("Network failed for Delhi"));

    await new Promise((r) => setTimeout(r, 50));

    // Tokyo must remain displayed and no error alert must appear
    expect(screen.getByTestId("current-pm25-value").textContent).toBe("18.0");
    expect(screen.getByTestId("selected-location-name").textContent).toBe("Tokyo");
    expect(screen.queryByText(/Network failed for Delhi/i)).toBeNull();
  });
});
