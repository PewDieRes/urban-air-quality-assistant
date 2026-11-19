import { describe, it, expect } from "vitest";
import { getHazeStyle } from "@/lib/immersive/haze";

describe("Immersive 3D Haze Derivation", () => {
  it("returns null for unavailable, invalid, or negative samples", () => {
    expect(getHazeStyle(null)).toBeNull();
    expect(getHazeStyle(undefined)).toBeNull();
    expect(getHazeStyle(NaN)).toBeNull();
    expect(getHazeStyle(Infinity)).toBeNull();
    expect(getHazeStyle(-5)).toBeNull();
  });

  it("evaluates fixed test cases: 20 µg/m³ and 120 µg/m³", () => {
    const clean20 = getHazeStyle(20);
    const smog120 = getHazeStyle(120);

    expect(clean20).not.toBeNull();
    expect(smog120).not.toBeNull();

    // 120 µg/m³ must strictly have higher density and opacity than 20 µg/m³
    expect(smog120!.density).toBeGreaterThan(clean20!.density);
    expect(smog120!.opacity).toBeGreaterThan(clean20!.opacity);

    // Bounded between 0 and 1
    expect(clean20!.opacity).toBeGreaterThan(0);
    expect(clean20!.opacity).toBeLessThan(1);
    expect(smog120!.opacity).toBeGreaterThan(0);
    expect(smog120!.opacity).toBeLessThan(1);

    expect(clean20!.alertLevel).toBe("moderate");
    expect(smog120!.alertLevel).toBe("unhealthy");
  });

  it("strictly enforces monotonic scaling across the full PM2.5 spectrum", () => {
    const samples = [0, 10, 25, 45, 80, 120, 180, 260, 400];
    const results = samples.map((s) => getHazeStyle(s)!);

    for (let i = 1; i < results.length; i++) {
      expect(results[i].density).toBeGreaterThanOrEqual(results[i - 1].density);
      expect(results[i].opacity).toBeGreaterThanOrEqual(results[i - 1].opacity);
    }
  });

  it("bounds output values even under extreme concentrations", () => {
    const extreme = getHazeStyle(999);
    expect(extreme).not.toBeNull();
    expect(extreme!.opacity).toBeLessThanOrEqual(0.95);
    expect(extreme!.density).toBeLessThanOrEqual(0.95);
    expect(extreme!.alertLevel).toBe("hazardous");
  });
});
