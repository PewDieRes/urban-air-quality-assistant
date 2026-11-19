import { GeoPoint, ScenePoint } from "./types";

// WGS84 Ellipsoid constants
export const WGS84_A = 6378137.0; // semi-major axis (meters)
export const WGS84_F = 1.0 / 298.257223563; // flattening
export const WGS84_B = WGS84_A * (1.0 - WGS84_F); // semi-minor axis
export const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A); // first eccentricity squared
export const WGS84_E_PRIME2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B); // second eccentricity squared

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

/**
 * Converts WGS84 Geodetic coordinates (lat, lon, alt) to Earth-Centered, Earth-Fixed (ECEF) coordinates in meters.
 */
export function geodeticToEcef(point: GeoPoint): [number, number, number] {
  const phi = point.lat * DEG2RAD;
  const lambda = point.lon * DEG2RAD;
  const h = point.alt ?? 0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  const n = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinPhi * sinPhi);

  const x = (n + h) * cosPhi * cosLambda;
  const y = (n + h) * cosPhi * sinLambda;
  const z = (n * (1.0 - WGS84_E2) + h) * sinPhi;

  return [x, y, z];
}

/**
 * Converts ECEF coordinates (meters) to WGS84 Geodetic (lat, lon, alt) using Bowring's method.
 */
export function ecefToGeodetic(x: number, y: number, z: number): GeoPoint {
  const p = Math.sqrt(x * x + y * y);
  const theta = Math.atan2(z * WGS84_A, p * WGS84_B);

  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const phi = Math.atan2(
    z + WGS84_E_PRIME2 * WGS84_B * sinTheta * sinTheta * sinTheta,
    p - WGS84_E2 * WGS84_A * cosTheta * cosTheta * cosTheta
  );

  const lambda = Math.atan2(y, x);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinPhi * sinPhi);
  const h = p / cosPhi - n;

  return {
    lat: phi * RAD2DEG,
    lon: lambda * RAD2DEG,
    alt: h,
  };
}

/**
 * Transforms a geographic point into the local scene coordinate frame anchored at `anchor`.
 * Convention:
 * - Scene X: East (meters)
 * - Scene Y: Up (meters)
 * - Scene Z: South (meters) [where North = -Z]
 */
export function toScene(point: GeoPoint, anchor: GeoPoint): ScenePoint {
  const [px, py, pz] = geodeticToEcef(point);
  const [ax, ay, az] = geodeticToEcef(anchor);

  const dx = px - ax;
  const dy = py - ay;
  const dz = pz - az;

  const phi0 = anchor.lat * DEG2RAD;
  const lambda0 = anchor.lon * DEG2RAD;

  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const sinLambda0 = Math.sin(lambda0);
  const cosLambda0 = Math.cos(lambda0);

  // East, North, Up components
  const east = -sinLambda0 * dx + cosLambda0 * dy;
  const north = -sinPhi0 * cosLambda0 * dx - sinPhi0 * sinLambda0 * dy + cosPhi0 * dz;
  const up = cosPhi0 * cosLambda0 * dx + cosPhi0 * sinLambda0 * dy + sinPhi0 * dz;

  return {
    x: east,
    y: up,
    z: -north, // South is positive Z
  };
}

/**
 * Transforms a local scene point (meters from anchor) back to WGS84 geodetic coordinates.
 */
export function toGeodetic(scene: ScenePoint, anchor: GeoPoint): GeoPoint {
  const east = scene.x;
  const up = scene.y;
  const north = -scene.z; // North is -Z

  const phi0 = anchor.lat * DEG2RAD;
  const lambda0 = anchor.lon * DEG2RAD;

  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const sinLambda0 = Math.sin(lambda0);
  const cosLambda0 = Math.cos(lambda0);

  // Rotation from ENU back to ECEF:
  // dx = -sinLambda0 * East - sinPhi0 * cosLambda0 * North + cosPhi0 * cosLambda0 * Up
  // dy =  cosLambda0 * East - sinPhi0 * sinLambda0 * North + cosPhi0 * sinLambda0 * Up
  // dz =                     cosPhi0 * North             + sinPhi0 * Up
  const dx = -sinLambda0 * east - sinPhi0 * cosLambda0 * north + cosPhi0 * cosLambda0 * up;
  const dy = cosLambda0 * east - sinPhi0 * sinLambda0 * north + cosPhi0 * sinLambda0 * up;
  const dz = cosPhi0 * north + sinPhi0 * up;

  const [ax, ay, az] = geodeticToEcef(anchor);

  return ecefToGeodetic(ax + dx, ay + dy, az + dz);
}
