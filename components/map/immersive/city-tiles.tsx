"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { ThreeEvent } from "@react-three/fiber";
import { TilesRenderer, TilesPlugin, TilesAttributionOverlay } from "3d-tiles-renderer/r3f";
import {
  GoogleCloudAuthPlugin,
  CesiumIonAuthPlugin,
  QuantizedMeshPlugin,
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
  ReorientationPlugin,
} from "3d-tiles-renderer/plugins";
import { CityAnchorPreset, SceneMode, Coordinates, ProviderStatus } from "@/lib/immersive/types";
import { toGeodetic } from "@/lib/immersive/frame";

interface CityTilesProps {
  anchor: CityAnchorPreset;
  sceneMode: SceneMode;
  onPickCoordinate?: (coords: Coordinates) => void;
  onProviderStatus?: (status: ProviderStatus) => void;
}

/**
 * Procedural textured 3D city block layout used when real-city 3D tiles are not configured,
 * or as an offline illustrative city benchmark scene. Provides realistic urban morphology,
 * distinct building heights, street grid, and ground terrain matching the anchor.
 */
function ProceduralCityBlocks({
  anchor,
  onPick,
}: {
  anchor: CityAnchorPreset;
  onPick?: (point: THREE.Vector3) => void;
}) {
  const isTokyo = anchor.id.includes("tokyo");

  const buildings = useMemo(() => {
    const list: Array<{
      id: string;
      position: [number, number, number];
      size: [number, number, number];
      color: string;
      roofColor: string;
      name: string;
    }> = [];

    // Seeded pseudo-random generator for consistent city layout
    let seed = isTokyo ? 1397671 : 772090;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Central landmark (Tokyo Station / Connaught Place)
    list.push({
      id: "landmark-center",
      position: [0, 18, 0],
      size: [110, 36, 160],
      color: isTokyo ? "#8b2500" : "#d97706", // red brick Tokyo Station or sandstone Delhi
      roofColor: "#334155",
      name: isTokyo ? "Tokyo Station Marunouchi" : "Connaught Central Arcade",
    });

    // Create a 7x7 city block grid around the anchor (~1.6km x 1.6km)
    const gridSize = 4;
    const blockSpacing = 160;

    for (let gx = -gridSize; gx <= gridSize; gx++) {
      for (let gz = -gridSize; gz <= gridSize; gz++) {
        if (gx === 0 && gz === 0) continue; // skip center landmark

        const blockX = gx * blockSpacing;
        const blockZ = gz * blockSpacing;

        // 2-3 buildings per street block
        const count = 1 + Math.floor(random() * 3);
        for (let b = 0; b < count; b++) {
          const offsetX = (random() - 0.5) * 80;
          const offsetZ = (random() - 0.5) * 80;

          // Height distribution: towers near center (up to 240m), lower at perimeter
          const distFromCenter = Math.hypot(gx, gz);
          const heightScale = Math.max(0.3, 1.0 - distFromCenter / (gridSize * 1.5));
          const height = Math.floor(35 + random() * 180 * heightScale);

          const width = 30 + Math.floor(random() * 40);
          const depth = 30 + Math.floor(random() * 40);

          // Glass, steel, or stone facade shades
          const hues = isTokyo
            ? ["#1e293b", "#334155", "#475569", "#64748b", "#0f172a"]
            : ["#78350f", "#92400e", "#b45309", "#d97706", "#451a03"];
          const color = hues[Math.floor(random() * hues.length)];

          list.push({
            id: `bld-${gx}-${gz}-${b}`,
            position: [blockX + offsetX, height / 2, blockZ + offsetZ],
            size: [width, height, depth],
            color,
            roofColor: "#1e293b",
            name: `${isTokyo ? "Marunouchi Tower" : "Barakhamba Complex"} #${gx + 5}-${gz + 5}`,
          });
        }
      }
    }

    return list;
  }, [isTokyo]);

  return (
    <group name="procedural-city-blocks">
      {/* Ground Terrain Plane with street grid lines */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onPick?.(e.point);
        }}
      >
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* Grid road markings */}
      <gridHelper args={[4000, 50, "#334155", "#1e293b"]} position={[0, 0.2, 0]} />

      {/* 3D Buildings */}
      {buildings.map((b) => (
        <group key={b.id} position={b.position}>
          <mesh
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onPick?.(e.point);
            }}
          >
            <boxGeometry args={b.size} />
            <meshStandardMaterial
              color={b.color}
              roughness={0.4}
              metalness={0.2}
            />
          </mesh>
          {/* Accent roof structure */}
          <mesh position={[0, b.size[1] / 2 + 1, 0]}>
            <boxGeometry args={[b.size[0] * 0.7, 2, b.size[2] * 0.7]} />
            <meshStandardMaterial color="#0284c7" emissive="#0369a1" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function CityTiles({ anchor, sceneMode, onPickCoordinate, onProviderStatus }: CityTilesProps) {
  const geometryRenderedRef = useRef<boolean>(false);
  const activeAnchorIdRef = useRef<string>(anchor.id);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY || "";
  const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "";

  const hasGoogleKey = Boolean(googleKey && googleKey.trim().length > 0);
  const hasCesiumToken = Boolean(cesiumToken && cesiumToken.trim().length > 0);

  // Geographic reorientation parameters: centers (lat, lon, height) at Three.js scene origin (0, 0, 0)
  // with +Y pointing Up, +X pointing West, +Z pointing North (OBJECT_FRAME)
  const reorientationArgs = useMemo(() => {
    return [
      {
        lat: (anchor.coordinates.lat * Math.PI) / 180,
        lon: (anchor.coordinates.lon * Math.PI) / 180,
        height: anchor.altitudeOffset || 0,
        recenter: true,
      },
    ];
  }, [anchor.coordinates.lat, anchor.coordinates.lon, anchor.altitudeOffset]);

  // Synchronize anchor changes and initial provider readiness
  useEffect(() => {
    activeAnchorIdRef.current = anchor.id;
    geometryRenderedRef.current = false;

    if (sceneMode === "photorealistic") {
      if (!hasGoogleKey) {
        onProviderStatus?.({
          provider: "Google Photorealistic 3D Tiles",
          ready: false,
          hasCredentials: false,
          error: "Google Map Tiles API key is not configured.",
          errorType: "missing_credential",
          geometryRendered: false,
          mode: "photorealistic",
        });
      } else {
        onProviderStatus?.({
          provider: "Google Photorealistic 3D Tiles",
          ready: false,
          hasCredentials: true,
          error: null,
          errorType: null,
          geometryRendered: false,
          mode: "photorealistic",
        });
      }
    } else if (sceneMode === "terrain-buildings") {
      if (!hasCesiumToken) {
        onProviderStatus?.({
          provider: "Cesium Ion World Terrain & OSM Buildings",
          ready: false,
          hasCredentials: false,
          error: "Cesium Ion token is not configured.",
          errorType: "missing_credential",
          geometryRendered: false,
          mode: "terrain-buildings",
        });
      } else {
        onProviderStatus?.({
          provider: "Cesium Ion World Terrain & OSM Buildings",
          ready: false,
          hasCredentials: true,
          error: null,
          errorType: null,
          geometryRendered: false,
          mode: "terrain-buildings",
        });
      }
    } else if (sceneMode === "procedural") {
      geometryRenderedRef.current = true;
      onProviderStatus?.({
        provider: "Illustrative 3D City",
        ready: true,
        hasCredentials: true,
        error: null,
        errorType: null,
        geometryRendered: true,
        mode: "procedural",
      });
    }
  }, [
    anchor.id,
    anchor.coordinates.lat,
    anchor.coordinates.lon,
    sceneMode,
    hasGoogleKey,
    hasCesiumToken,
    onProviderStatus,
  ]);

  // Handlers for actual provider geometry rendering confirmation
  const handleGeometryVisible = useCallback(() => {
    if (!geometryRenderedRef.current) {
      geometryRenderedRef.current = true;
      const providerName =
        sceneMode === "photorealistic"
          ? "Google Photorealistic 3D Tiles"
          : "Cesium Ion World Terrain & OSM Buildings";

      onProviderStatus?.({
        provider: providerName,
        ready: true,
        hasCredentials: true,
        error: null,
        errorType: null,
        geometryRendered: true,
        mode: sceneMode,
      });
    }
  }, [sceneMode, onProviderStatus]);

  const handleLoadModel = useCallback(() => {
    handleGeometryVisible();
  }, [handleGeometryVisible]);

  const handleTileVisibilityChange = useCallback(
    (event: { visible?: boolean }) => {
      if (event?.visible) {
        handleGeometryVisible();
      }
    },
    [handleGeometryVisible]
  );

  const handleLoadError = useCallback(
    (event: { tile?: any; error?: any; url?: any }) => {
      const err = event?.error;
      const errMsg = err?.message || String(err || "");
      let errorType: "denied" | "no_coverage" | "network" | "failed" = "failed";
      let descriptiveError = `Tile streaming failed: ${errMsg || "Unknown error"}`;

      const lower = errMsg.toLowerCase();
      if (
        lower.includes("401") ||
        lower.includes("403") ||
        lower.includes("unauthorized") ||
        lower.includes("forbidden") ||
        lower.includes("key")
      ) {
        errorType = "denied";
        descriptiveError = "Access denied by 3D tile provider. Please verify API key and restrictions.";
      } else if (lower.includes("404") || lower.includes("not found")) {
        errorType = "no_coverage";
        descriptiveError = "3D imagery coverage is unavailable for this location.";
      } else if (
        lower.includes("failed to fetch") ||
        lower.includes("network") ||
        lower.includes("abort")
      ) {
        errorType = "network";
        descriptiveError = "Network connection failed while streaming 3D tiles.";
      }

      onProviderStatus?.({
        provider:
          sceneMode === "photorealistic"
            ? "Google Photorealistic 3D Tiles"
            : "Cesium Ion World Terrain & OSM Buildings",
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
      if (!onPickCoordinate) return;
      const geo = toGeodetic(
        { x: point.x, y: point.y, z: point.z },
        {
          lat: anchor.coordinates.lat,
          lon: anchor.coordinates.lon,
          alt: anchor.altitudeOffset,
        }
      );
      onPickCoordinate({ lat: geo.lat, lon: geo.lon });
    },
    [anchor, onPickCoordinate]
  );

  return (
    <group name="city-tiles-root">
      {/* 1. Google Photorealistic 3D Tiles when credentials available */}
      {sceneMode === "photorealistic" && hasGoogleKey && (
        <group
          key={`group-google-${anchor.id}-${anchor.coordinates.lat.toFixed(4)}-${anchor.coordinates.lon.toFixed(4)}`}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            handlePickPoint(e.point);
          }}
        >
          <TilesRenderer
            key={`google-tiles-${anchor.id}-${anchor.coordinates.lat.toFixed(4)}-${anchor.coordinates.lon.toFixed(4)}`}
            url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleKey}`}
            onLoadModel={handleLoadModel}
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

      {/* 2. Cesium Ion World Terrain & OSM Buildings when credentials available */}
      {sceneMode === "terrain-buildings" && hasCesiumToken && (
        <group
          key={`group-cesium-${anchor.id}-${anchor.coordinates.lat.toFixed(4)}-${anchor.coordinates.lon.toFixed(4)}`}
          name="cesium-ion-layers"
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            handlePickPoint(e.point);
          }}
        >
          {/* Cesium OSM Buildings (Asset 96188) */}
          <TilesRenderer
            key={`cesium-osm-${anchor.id}-${anchor.coordinates.lat.toFixed(4)}-${anchor.coordinates.lon.toFixed(4)}`}
            url="https://assets.ion.cesium.com/96188/tileset.json"
            onLoadModel={handleLoadModel}
            onTileVisibilityChange={handleTileVisibilityChange}
            onLoadError={handleLoadError}
          >
            <TilesPlugin plugin={CesiumIonAuthPlugin} args={[{ apiToken: cesiumToken, assetId: "96188" }]} />
            <TilesPlugin plugin={ReorientationPlugin} args={reorientationArgs} />
            <TilesPlugin plugin={GLTFExtensionsPlugin} />
            <TilesPlugin plugin={TileCompressionPlugin} />
            <TilesPlugin plugin={TilesFadePlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
            <TilesAttributionOverlay />
          </TilesRenderer>

          {/* Cesium World Terrain (Asset 1) */}
          <TilesRenderer
            key={`cesium-terrain-${anchor.id}-${anchor.coordinates.lat.toFixed(4)}-${anchor.coordinates.lon.toFixed(4)}`}
            url="https://assets.ion.cesium.com/1/tileset.json"
            onLoadModel={handleLoadModel}
            onTileVisibilityChange={handleTileVisibilityChange}
            onLoadError={handleLoadError}
          >
            <TilesPlugin plugin={CesiumIonAuthPlugin} args={[{ apiToken: cesiumToken, assetId: "1" }]} />
            <TilesPlugin plugin={ReorientationPlugin} args={reorientationArgs} />
            <TilesPlugin plugin={QuantizedMeshPlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
          </TilesRenderer>
        </group>
      )}

      {/* 3. High-fidelity procedural 3D textured mesh (when chosen explicitly or offline) */}
      {sceneMode === "procedural" && (
        <ProceduralCityBlocks
          anchor={anchor}
          onPick={handlePickPoint}
        />
      )}
    </group>
  );
}
