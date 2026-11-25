import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Forecast } from "@/lib/forecast/types";

const mockMapSpies = vi.hoisted(() => ({
  easeTo: vi.fn(),
  flyTo: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  remove: vi.fn(),
  layers: new Set<string>(),
  sources: new Set<string>(),
}));

vi.mock("maplibre-gl", () => {
  class MockNavigationControl {}
  class MockPopup {
    setLngLat() {
      return this;
    }
    setHTML() {
      return this;
    }
    addTo() {
      return this;
    }
  }
  class MockMap {
    addControl() {}
    on() {}
    remove() {
      mockMapSpies.remove();
    }
    flyTo(options: unknown) {
      mockMapSpies.flyTo(options);
    }
    easeTo(options: unknown) {
      mockMapSpies.easeTo(options);
    }
    isStyleLoaded() {
      return true;
    }
    getSource(id: string) {
      return mockMapSpies.sources.has(id) ? { setData: vi.fn() } : undefined;
    }
    addSource(id: string) {
      mockMapSpies.sources.add(id);
      mockMapSpies.addSource(id);
    }
    removeSource(id: string) {
      mockMapSpies.sources.delete(id);
    }
    getLayer(id: string) {
      return mockMapSpies.layers.has(id) ? { id } : undefined;
    }
    addLayer(layer: { id: string }) {
      mockMapSpies.layers.add(layer.id);
      mockMapSpies.addLayer(layer.id);
    }
    removeLayer(id: string) {
      mockMapSpies.layers.delete(id);
    }
    setLayoutProperty() {}
  }

  return {
    default: {
      Map: MockMap,
      NavigationControl: MockNavigationControl,
      Popup: MockPopup,
    },
  };
});

import { AirQualityMap } from "@/components/map/air-quality-map";

const SAMPLE_FORECAST: Forecast = {
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
  hourly: [
    { at: "2026-11-18T10:00:00Z", pm25: 120, usAqi: 184 },
    { at: "2026-11-18T11:00:00Z", pm25: 105, usAqi: 176 },
  ],
};

describe("AirQualityMap fallback handling and overlay toggles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMapSpies.layers.clear();
    mockMapSpies.sources.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("retains map UI and publishes polite status when regional grid fetch fails", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/forecast/grid")) {
        return Promise.resolve(new Response("Service Unavailable", { status: 503 }));
      }
      if (url.includes("/api/fires")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              fires: [
                {
                  id: "fire-1",
                  lat: 30.1,
                  lon: 75.9,
                  observedAt: "2026-11-18T08:00:00Z",
                  source: "NASA FIRMS",
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AirQualityMap center={{ lat: 28.6139, lon: 77.209 }} forecast={SAMPLE_FORECAST} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /Regional spatial grid overlay temporarily unavailable/i
      );
    });
    expect(screen.getByRole("button", { name: /Toggle NASA FIRMS active fire detections/i })).toBeInTheDocument();
  });

  it("toggles 3D perspective, fires overlay, and historical smoke drawer cleanly", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/forecast/grid")) {
        return Promise.resolve(new Response(JSON.stringify({ grid: [] }), { status: 200 }));
      }
      if (url.includes("/api/fires")) {
        return Promise.resolve(new Response(JSON.stringify({ fires: [] }), { status: 200 }));
      }
      if (url.includes("/smoke/historical.geojson")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              metadata: { caseName: "Punjab-Delhi Nov 2024" },
              features: [],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AirQualityMap center={{ lat: 28.6139, lon: 77.209 }} forecast={SAMPLE_FORECAST} />);

    // 1. Toggle 3D buildings perspective
    const toggle3DBtn = screen.getByRole("button", {
      name: /Switch to 3D perspective with extruded buildings/i,
    });
    fireEvent.click(toggle3DBtn);
    expect(mockMapSpies.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 55, bearing: 20 })
    );
    expect(screen.getByText("2D Flat View")).toBeInTheDocument();

    // 2. Toggle Historical Smoke drawer on and off
    const smokeBtn = screen.getByRole("button", { name: /Toggle historical smoke case/i });
    fireEvent.click(smokeBtn);
    await waitFor(() => {
      expect(screen.getByText(/Possible smoke paths/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Close historical smoke details/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Possible smoke paths/i)).not.toBeInTheDocument();
    });
  });
});
