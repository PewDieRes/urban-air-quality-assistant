import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { CityTiles } from "@/components/map/immersive/city-tiles";
import { ImmersiveCityView } from "@/components/map/immersive/immersive-city-view";
import { DELHI_ANCHOR, TOKYO_ANCHOR } from "@/lib/immersive/presets";
import { ProviderStatus } from "@/lib/immersive/types";

import { ReorientationPlugin } from "3d-tiles-renderer/plugins";

// Capture props passed to TilesRenderer
let lastTilesRendererProps: any = null;
let lastReorientationArgs: any = null;

vi.mock("3d-tiles-renderer/r3f", () => ({
  TilesRenderer: ({ children, ...props }: any) => {
    lastTilesRendererProps = props;
    return (
      <div data-testid="tiles-renderer" data-url={props.url}>
        {children}
      </div>
    );
  },
  TilesPlugin: ({ plugin, args }: any) => {
    if (plugin && (plugin.name === "ReorientationPlugin" || plugin === ReorientationPlugin)) {
      lastReorientationArgs = args;
    }
    return (
      <div
        data-testid="tiles-plugin"
        data-plugin={plugin?.name || "plugin"}
        data-args={JSON.stringify(args)}
      />
    );
  },
  TilesAttributionOverlay: () => <div data-testid="tiles-attribution-overlay" />,
}));

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    camera: { position: { set: vi.fn() }, updateMatrixWorld: vi.fn() },
    gl: { domElement: { parentNode: { appendChild: vi.fn() } } },
    invalidate: vi.fn(),
  }),
  Canvas: ({ children }: any) => <div data-testid="r3f-canvas">{children}</div>,
  useFrame: vi.fn(),
}));

const MockOrbitControls = React.forwardRef(function MockOrbitControls(props: any, ref: any) {
  React.useImperativeHandle(ref, () => ({
    object: { position: { set: vi.fn() } },
    target: { set: vi.fn() },
    update: vi.fn(),
  }));
  return <div data-testid="orbit-controls" />;
});

vi.mock("@react-three/drei", () => ({
  OrbitControls: MockOrbitControls,
  PerspectiveCamera: () => <div data-testid="perspective-camera" />,
}));

describe("Immersive 3D City - Regression & Household Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    lastTilesRendererProps = null;
    lastReorientationArgs = null;
    process.env = { ...originalEnv };
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type) => {
      if (type === "webgl" || type === "webgl2") {
        return {};
      }
      return null;
    }) as any;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  describe("Regression: Credential present while tile loading fails", () => {
    it("reports access denied without claiming no-coverage when 403 occurs", () => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY = "dummy-test-key-valid";

      const onStatus = vi.fn();
      render(
        <CityTiles
          anchor={DELHI_ANCHOR}
          sceneMode="photorealistic"
          onProviderStatus={onStatus}
        />
      );

      // Verify TilesRenderer mounted with Google key
      expect(lastTilesRendererProps).not.toBeNull();
      expect(lastTilesRendererProps.url).toContain("dummy-test-key-valid");

      // Trigger load error with 403 Forbidden
      act(() => {
        lastTilesRendererProps.onLoadError({
          error: new Error("403 Forbidden: Request denied for API key"),
        });
      });

      const lastCall: ProviderStatus = onStatus.mock.calls[onStatus.mock.calls.length - 1][0];
      expect(lastCall.ready).toBe(false);
      expect(lastCall.geometryRendered).toBe(false);
      expect(lastCall.errorType).toBe("denied");
      expect(lastCall.error).toContain("Access denied");
      expect(lastCall.error?.toLowerCase()).not.toContain("no coverage");
      expect(lastCall.error?.toLowerCase()).not.toContain("not covered");
    });

    it("reports network error without claiming no-coverage when fetch fails", () => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY = "dummy-test-key-valid";

      const onStatus = vi.fn();
      render(
        <CityTiles
          anchor={DELHI_ANCHOR}
          sceneMode="photorealistic"
          onProviderStatus={onStatus}
        />
      );

      act(() => {
        lastTilesRendererProps.onLoadError({
          error: new TypeError("Failed to fetch"),
        });
      });

      const lastCall: ProviderStatus = onStatus.mock.calls[onStatus.mock.calls.length - 1][0];
      expect(lastCall.ready).toBe(false);
      expect(lastCall.errorType).toBe("network");
      expect(lastCall.error).toContain("Network connection failed");
      expect(lastCall.error?.toLowerCase()).not.toContain("no coverage");
    });

    it("reports specific error description on unknown tile failure without false coverage claim", () => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY = "dummy-test-key-valid";

      const onStatus = vi.fn();
      render(
        <CityTiles
          anchor={DELHI_ANCHOR}
          sceneMode="photorealistic"
          onProviderStatus={onStatus}
        />
      );

      act(() => {
        lastTilesRendererProps.onLoadError({
          error: new Error("Corrupted Draco compressed payload"),
        });
      });

      const lastCall: ProviderStatus = onStatus.mock.calls[onStatus.mock.calls.length - 1][0];
      expect(lastCall.ready).toBe(false);
      expect(lastCall.errorType).toBe("failed");
      expect(lastCall.error).toContain("Corrupted Draco compressed payload");
      expect(lastCall.error?.toLowerCase()).not.toContain("no coverage");
    });
  });

  describe("Regression: Switching cities while previous city is still loading", () => {
    it("updates reorientation target to new city and resets geometry state", () => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY = "dummy-test-key-valid";

      const onStatus = vi.fn();
      const { rerender } = render(
        <CityTiles
          anchor={DELHI_ANCHOR}
          sceneMode="photorealistic"
          onProviderStatus={onStatus}
        />
      );

      // Verify Delhi reorientation coordinates (lat: 28.6139, lon: 77.209)
      const delhiLatRad = (28.6139 * Math.PI) / 180;
      const delhiLonRad = (77.209 * Math.PI) / 180;
      expect(lastReorientationArgs[0].lat).toBeCloseTo(delhiLatRad, 4);
      expect(lastReorientationArgs[0].lon).toBeCloseTo(delhiLonRad, 4);
      expect(lastReorientationArgs[0].recenter).toBe(true);

      // Switch to Tokyo while Delhi tiles are still loading (geometryRendered is false)
      rerender(
        <CityTiles
          anchor={TOKYO_ANCHOR}
          sceneMode="photorealistic"
          onProviderStatus={onStatus}
        />
      );

      // Verify Tokyo reorientation coordinates (lat: 35.6812, lon: 139.7671)
      const tokyoLatRad = (35.6812 * Math.PI) / 180;
      const tokyoLonRad = (139.7671 * Math.PI) / 180;
      expect(lastReorientationArgs[0].lat).toBeCloseTo(tokyoLatRad, 4);
      expect(lastReorientationArgs[0].lon).toBeCloseTo(tokyoLonRad, 4);

      // Status must be un-rendered (ready: false) for the new city until models load
      const latestStatus: ProviderStatus = onStatus.mock.calls[onStatus.mock.calls.length - 1][0];
      expect(latestStatus.ready).toBe(false);
      expect(latestStatus.geometryRendered).toBe(false);

      // Now Tokyo tile model arrives
      act(() => {
        lastTilesRendererProps.onLoadModel({ scene: {}, tile: {}, url: "https://tile.googleapis.com/test" });
      });

      const confirmedStatus: ProviderStatus = onStatus.mock.calls[onStatus.mock.calls.length - 1][0];
      expect(confirmedStatus.ready).toBe(true);
      expect(confirmedStatus.geometryRendered).toBe(true);
      expect(confirmedStatus.provider).toBe("Google Photorealistic 3D Tiles");
    });
  });

  describe("Household UI: Clean copy, explicit choice, and forecast handling", () => {
    it("does not render environment variable names in the household interface", () => {
      // Ensure credentials unset
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY;
      delete process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;

      const { container } = render(
        <ImmersiveCityView
          center={DELHI_ANCHOR.coordinates}
          placeLabel="Delhi-NCR"
          forecast={null}
          selectedInstant={null}
          onSelectCoordinate={vi.fn()}
          onBackToMap={vi.fn()}
        />
      );

      // Ensure no technical env var names leaked
      expect(container.textContent).not.toContain("NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY");
      expect(container.textContent).not.toContain("NEXT_PUBLIC_CESIUM_ION_TOKEN");
      expect(container.textContent).not.toContain("NEXT_PUBLIC");

      // Verify household-friendly explicit options
      expect(screen.getByRole("button", { name: /explore illustrative city/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /return to 2d map/i })).toBeTruthy();
    });

    it("makes 'Explore illustrative city' an explicit user choice", () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY;
      delete process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;

      render(
        <ImmersiveCityView
          center={DELHI_ANCHOR.coordinates}
          placeLabel="Delhi-NCR"
          forecast={null}
          selectedInstant={null}
          onSelectCoordinate={vi.fn()}
          onBackToMap={vi.fn()}
        />
      );

      const exploreBtn = screen.getByRole("button", { name: /explore illustrative city/i });
      fireEvent.click(exploreBtn);

      // After explicit click, illustrative model badge is visible
      expect(screen.getByText(/illustrative city model · 3d layout/i)).toBeTruthy();
      // And "3D imagery loaded" is NOT shown
      expect(screen.queryByText(/3D imagery loaded/i)).toBeNull();
    });

    it("labels the haze 'Illustration of forecast pollution'", () => {
      render(
        <ImmersiveCityView
          center={DELHI_ANCHOR.coordinates}
          placeLabel="Delhi-NCR"
          forecast={null}
          selectedInstant={null}
          onSelectCoordinate={vi.fn()}
          onBackToMap={vi.fn()}
        />
      );

      expect(screen.getAllByText(/illustration of forecast pollution/i).length).toBeGreaterThan(0);
    });

    it("turns off forecast haze and shows status when forecast is unavailable", () => {
      render(
        <ImmersiveCityView
          center={DELHI_ANCHOR.coordinates}
          placeLabel="Delhi-NCR"
          forecast={null}
          selectedInstant={null}
          onSelectCoordinate={vi.fn()}
          onBackToMap={vi.fn()}
        />
      );

      expect(screen.getByText(/forecast unavailable for this location/i)).toBeTruthy();
      // Does not substitute fake numbers
      expect(screen.queryByText(/µg\/m³/)).toBeNull();
    });
  });
});
