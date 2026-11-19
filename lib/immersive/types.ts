import { Forecast } from "@/lib/forecast/types";

export type Coordinates = { lat: number; lon: number };
export type MapView = "map" | "immersive";
export type SceneMode = "photorealistic" | "terrain-buildings" | "procedural";

export interface GeoPoint {
  lat: number;
  lon: number;
  alt?: number; // meters above WGS84 ellipsoid
}

export interface ScenePoint {
  x: number; // East (meters)
  y: number; // Up (meters)
  z: number; // South (meters)
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface HazeStyle {
  pm25: number;
  density: number; // [0, 1] stylized extinction factor
  opacity: number; // [0, 1] alpha blend
  color: string; // hex or rgb
  heightCeiling: number; // meters above ground
  alertLevel: "good" | "moderate" | "unhealthy_sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";
  label: string;
}

export interface CityAnchorPreset {
  id: string;
  name: string;
  coordinates: Coordinates;
  altitudeOffset: number;
  defaultMode: SceneMode;
  cameraPresets: {
    aerial: CameraPose;
    skyline: CameraPose;
    home: CameraPose;
  };
}

export interface AirQualityViewProps {
  center: Coordinates;
  placeLabel: string;
  forecast: Forecast | null;
  selectedInstant: string | null;
  onSelectInstant: (instant: string) => void;
  onSelectCoordinate: (coords: Coordinates) => void;
  onBuildPlan: () => void;
}
