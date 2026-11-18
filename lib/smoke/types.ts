export interface SmokeMetadata {
  runMode: "historical" | "live_forward";
  sourceLat: number;
  sourceLon: number;
  observedAt: string; // ISO 8601 UTC
  runTime: string;    // ISO 8601 UTC
  weatherCycle: string;
  startHeightsM: number[];
  notes: string;
}

export interface SmokeLineProperties {
  startHeightM: number;
  timestamps: string[];
}

export interface SmokePathSet {
  metadata: SmokeMetadata;
  paths: GeoJSON.FeatureCollection<GeoJSON.LineString, SmokeLineProperties>;
}
