import { describe, it, expect } from "vitest";
import { toScene, toGeodetic } from "@/lib/immersive/frame";
import { GeoPoint } from "@/lib/immersive/types";

describe("Immersive Coordinate Frame Transformations", () => {
  const tokyoAnchor: GeoPoint = { lat: 35.6812, lon: 139.7671, alt: 40 };
  const delhiAnchor: GeoPoint = { lat: 28.6139, lon: 77.209, alt: 215 };

  it("maps the anchor point to the origin (0, 0, 0)", () => {
    const tokyoScene = toScene(tokyoAnchor, tokyoAnchor);
    expect(Math.abs(tokyoScene.x)).toBeLessThan(1e-4);
    expect(Math.abs(tokyoScene.y)).toBeLessThan(1e-4);
    expect(Math.abs(tokyoScene.z)).toBeLessThan(1e-4);

    const delhiScene = toScene(delhiAnchor, delhiAnchor);
    expect(Math.abs(delhiScene.x)).toBeLessThan(1e-4);
    expect(Math.abs(delhiScene.y)).toBeLessThan(1e-4);
    expect(Math.abs(delhiScene.z)).toBeLessThan(1e-4);
  });

  it("increasing longitude moves East (+X in scene frame)", () => {
    const eastPoint: GeoPoint = { lat: tokyoAnchor.lat, lon: tokyoAnchor.lon + 0.01, alt: tokyoAnchor.alt };
    const scene = toScene(eastPoint, tokyoAnchor);
    expect(scene.x).toBeGreaterThan(500); // ~0.01 deg lon at 35N is ~900m
    expect(Math.abs(scene.y)).toBeLessThan(10); // minimal elevation change on ellipsoid
  });

  it("increasing latitude moves North (-Z in scene frame where South is +Z)", () => {
    const northPoint: GeoPoint = { lat: tokyoAnchor.lat + 0.01, lon: tokyoAnchor.lon, alt: tokyoAnchor.alt };
    const scene = toScene(northPoint, tokyoAnchor);
    expect(scene.z).toBeLessThan(-500); // North is -Z, so increasing lat yields negative Z
  });

  it("increasing altitude moves Up (+Y in scene frame)", () => {
    const higherPoint: GeoPoint = { lat: tokyoAnchor.lat, lon: tokyoAnchor.lon, alt: (tokyoAnchor.alt ?? 0) + 150 };
    const scene = toScene(higherPoint, tokyoAnchor);
    expect(scene.y).toBeCloseTo(150, 0);
  });

  it("round-trips known coordinates near Tokyo within 1 meter", () => {
    // Tokyo Tower (~3 km southwest of Tokyo Station: 35.6586° N, 139.7454° E)
    const tokyoTower: GeoPoint = { lat: 35.6586, lon: 139.7454, alt: 50 };
    const scene = toScene(tokyoTower, tokyoAnchor);
    const recovered = toGeodetic(scene, tokyoAnchor);

    // Verify round-trip accuracy
    const latDiffMeters = Math.abs(recovered.lat - tokyoTower.lat) * 111320;
    const lonDiffMeters = Math.abs(recovered.lon - tokyoTower.lon) * 111320 * Math.cos((tokyoTower.lat * Math.PI) / 180);
    const altDiffMeters = Math.abs((recovered.alt ?? 0) - (tokyoTower.alt ?? 0));

    expect(latDiffMeters).toBeLessThan(0.05); // Less than 5 centimeters
    expect(lonDiffMeters).toBeLessThan(0.05);
    expect(altDiffMeters).toBeLessThan(0.05);
  });

  it("round-trips known coordinates near Delhi within 1 meter", () => {
    // India Gate (~2.5 km southeast: 28.6129° N, 77.2295° E)
    const indiaGate: GeoPoint = { lat: 28.6129, lon: 77.2295, alt: 218 };
    const scene = toScene(indiaGate, delhiAnchor);
    const recovered = toGeodetic(scene, delhiAnchor);

    const latDiffMeters = Math.abs(recovered.lat - indiaGate.lat) * 111320;
    const lonDiffMeters = Math.abs(recovered.lon - indiaGate.lon) * 111320 * Math.cos((indiaGate.lat * Math.PI) / 180);
    const altDiffMeters = Math.abs((recovered.alt ?? 0) - (indiaGate.alt ?? 0));

    expect(latDiffMeters).toBeLessThan(0.05);
    expect(lonDiffMeters).toBeLessThan(0.05);
    expect(altDiffMeters).toBeLessThan(0.05);
  });
});
