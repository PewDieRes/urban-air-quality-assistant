"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ThreeEvent } from "@react-three/fiber";
import { TilesAttributionOverlay, TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import {
  CesiumIonAuthPlugin,
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  QuantizedMeshPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { toGeodetic } from "@/lib/immersive/frame";
import { CityAnchorPreset, Coordinates, ProviderStatus, SceneMode } from "@/lib/immersive/types";
import { ProceduralCityBlocks } from "./procedural-city-blocks";

interface CityTilesProps {
  anchor: CityAnchorPreset;
  sceneMode: SceneMode;
  onPickCoordinate?: (coords: Coordinates) => void;
  onProviderStatus?: (status: ProviderStatus) => void;
}

interface TileLoadErrorEvent {
  tile?: unknown;
  error?: unknown;
  url?: string | URL;
}

function getProviderDisplayName(sceneMode: SceneMode): string {
  if (sceneMode === "photorealistic") {
    return "Google Photorealistic 3D Tiles";
  }
  if (sceneMode === "terrain-buildings") {
    return "Cesium Ion World Terrain & OSM Buildings";
  }
  return "Illustrative 3D City";
}

function classifyTileLoadError(rawError: unknown): {
  errorType: ProviderStatus["errorType"];
  descriptiveError: string;
} {
  const errorMessage =
    rawError instanceof Error ? rawError.message : String(rawError || "");
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("key")
  ) {
    return {
      errorType: "denied",
      descriptiveError:
        "Access denied by 3D tile provider. Please verify API key and restrictions.",
    };
  }
  if (normalized.includes("404") || normalized.includes("not found")) {
    return {
      errorType: "no_coverage",
      descriptiveError: "3D imagery coverage is unavailable for this location.",
    };
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("abort")
  ) {
    return {
      errorType: "network",
      descriptiveError: "Network connection failed while streaming 3D tiles.",
    };
  }

  return {
    errorType: "failed",
    descriptiveError: `Tile streaming failed: ${errorMessage || "Unknown error"}`,
  };
}

function buildInitialProviderStatus(
  sceneMode: SceneMode,
  hasGoogleKey: boolean,
  hasCesiumToken: boolean
): ProviderStatus {
  const provider = getProviderDisplayName(sceneMode);
  if (sceneMode === "procedural") {
    return {
      provider,
      ready: true,
      hasCredentials: true,
      error: null,
      errorType: null,
      geometryRendered: true,
      mode: "procedural",
    };
  }

  const hasCredentials = sceneMode === "photorealistic" ? hasGoogleKey : hasCesiumToken;
  const missingMessage =
    sceneMode === "photorealistic"
      ? "Google Map Tiles API key is not configured."
      : "Cesium Ion token is not configured.";

  return {
    provider,
    ready: false,
    hasCredentials,
    error: hasCredentials ? null : missingMessage,
    errorType: hasCredentials ? null : "missing_credential",
    geometryRendered: false,
    mode: sceneMode,
  };
}

/**
 * Renders either configured real-city 3D tile providers or the procedural illustrative skyline.
 */
export function CityTiles({
  anchor,
  sceneMode,
  onPickCoordinate,
  onProviderStatus,
}: CityTilesProps) {
  const geometryRenderedRef = useRef<boolean>(false);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY || "";
  const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "";
  const hasGoogleKey = googleKey.trim().length > 0;
  const hasCesiumToken = cesiumToken.trim().length > 0;

  const anchorKeySuffix = `${anchor.id}-${anchor.coordinates.lat.toFixed(4)}-${anchor.coordinates.lon.toFixed(4)}`;

  const reorientationArgs = useMemo(
    () => [
      {
        lat: (anchor.coordinates.lat * Math.PI) / 180,
        lon: (anchor.coordinates.lon * Math.PI) / 180,
        height: anchor.altitudeOffset || 0,
        recenter: true,
      },
    ],
    [anchor.coordinates.lat, anchor.coordinates.lon, anchor.altitudeOffset]
  );

  useEffect(() => {
    geometryRenderedRef.current = sceneMode === "procedural";
    onProviderStatus?.(buildInitialProviderStatus(sceneMode, hasGoogleKey, hasCesiumToken));
  }, [
    anchor.id,
    anchor.coordinates.lat,
    anchor.coordinates.lon,
    sceneMode,
    hasGoogleKey,
    hasCesiumToken,
    onProviderStatus,
  ]);

  const handleGeometryVisible = useCallback(() => {
    if (geometryRenderedRef.current) {
      return;
    }
    geometryRenderedRef.current = true;
    onProviderStatus?.({
      provider: getProviderDisplayName(sceneMode),
      ready: true,
      hasCredentials: true,
      error: null,
      errorType: null,
      geometryRendered: true,
      mode: sceneMode,
    });
  }, [sceneMode, onProviderStatus]);

  const handleTileVisibilityChange = useCallback(
    (event: { visible?: boolean }) => {
      if (event?.visible) {
        handleGeometryVisible();
      }
    },
    [handleGeometryVisible]
  );

  const handleLoadError = useCallback(
    (event: TileLoadErrorEvent) => {
      const { errorType, descriptiveError } = classifyTileLoadError(event?.error);
      onProviderStatus?.({
        provider: getProviderDisplayName(sceneMode),
        ready: false,
        hasCredentials: true,
        error: descriptiveError,
        errorType,
        geometryRendered: false,
        mode: sceneMode,
      });
    },
    [sceneMode, onProviderStatus]
  );

  const handlePickPoint = useCallback(
    (point: THREE.Vector3) => {
      if (!onPickCoordinate) {
        return;
      }
      const geodetic = toGeodetic(
        { x: point.x, y: point.y, z: point.z },
        {
          lat: anchor.coordinates.lat,
          lon: anchor.coordinates.lon,
          alt: anchor.altitudeOffset,
        }
      );
      onPickCoordinate({ lat: geodetic.lat, lon: geodetic.lon });
    },
    [anchor, onPickCoordinate]
  );

  const handleGroupClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    handlePickPoint(event.point);
  };

  return (
    <group name="city-tiles-root">
      {sceneMode === "photorealistic" && hasGoogleKey && (
        <group key={`group-google-${anchorKeySuffix}`} onClick={handleGroupClick}>
          <TilesRenderer
            key={`google-tiles-${anchorKeySuffix}`}
            url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleKey}`}
            onLoadModel={handleGeometryVisible}
            onTileVisibilityChange={handleTileVisibilityChange}
            onLoadError={handleLoadError}
          >
            <TilesPlugin plugin={GoogleCloudAuthPlugin} args={[{ apiToken: googleKey }]} />
            <TilesPlugin plugin={ReorientationPlugin} args={reorientationArgs} />
            <TilesPlugin plugin={GLTFExtensionsPlugin} />
            <TilesPlugin plugin={TileCompressionPlugin} />
            <TilesPlugin plugin={TilesFadePlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
            <TilesAttributionOverlay />
          </TilesRenderer>
        </group>
      )}

      {sceneMode === "terrain-buildings" && hasCesiumToken && (
        <group
          key={`group-cesium-${anchorKeySuffix}`}
          name="cesium-ion-layers"
          onClick={handleGroupClick}
        >
          <TilesRenderer
            key={`cesium-osm-${anchorKeySuffix}`}
            url="https://assets.ion.cesium.com/96188/tileset.json"
            onLoadModel={handleGeometryVisible}
            onTileVisibilityChange={handleTileVisibilityChange}
            onLoadError={handleLoadError}
          >
            <TilesPlugin
              plugin={CesiumIonAuthPlugin}
              args={[{ apiToken: cesiumToken, assetId: "96188" }]}
            />
            <TilesPlugin plugin={ReorientationPlugin} args={reorientationArgs} />
            <TilesPlugin plugin={GLTFExtensionsPlugin} />
            <TilesPlugin plugin={TileCompressionPlugin} />
            <TilesPlugin plugin={TilesFadePlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
            <TilesAttributionOverlay />
          </TilesRenderer>

          <TilesRenderer
            key={`cesium-terrain-${anchorKeySuffix}`}
            url="https://assets.ion.cesium.com/1/tileset.json"
            onLoadModel={handleGeometryVisible}
            onTileVisibilityChange={handleTileVisibilityChange}
            onLoadError={handleLoadError}
          >
            <TilesPlugin
              plugin={CesiumIonAuthPlugin}
              args={[{ apiToken: cesiumToken, assetId: "1" }]}
            />
            <TilesPlugin plugin={ReorientationPlugin} args={reorientationArgs} />
            <TilesPlugin plugin={QuantizedMeshPlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
          </TilesRenderer>
        </group>
      )}

      {sceneMode === "procedural" && (
        <ProceduralCityBlocks anchor={anchor} onPick={handlePickPoint} />
      )}
    </group>
  );
}
