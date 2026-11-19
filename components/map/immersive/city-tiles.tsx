"use client";

import React, { useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { TilesRenderer, TilesPlugin } from "3d-tiles-renderer/r3f";
import {
  GoogleCloudAuthPlugin,
  CesiumIonAuthPlugin,
  QuantizedMeshPlugin,
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { CityAnchorPreset, SceneMode, Coordinates } from "@/lib/immersive/types";
import { toGeodetic, toScene } from "@/lib/immersive/frame";

interface CityTilesProps {
  anchor: CityAnchorPreset;
  sceneMode: SceneMode;
  onPickCoordinate?: (coords: Coordinates) => void;
  onProviderStatus?: (status: {
    provider: string;
    ready: boolean;
    hasCredentials: boolean;
    error: string | null;
  }) => void;
}

/**
 * Procedural textured 3D city block layout used when credentials are not configured,
 * or as an offline/instant benchmark scene. Provides realistic urban morphology,
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
  const { camera } = useThree();
  const [providerError, setProviderError] = useState<string | null>(null);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY || "";
  const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "";

  const hasGoogleKey = Boolean(googleKey && googleKey.length > 10);
  const hasCesiumToken = Boolean(cesiumToken && cesiumToken.length > 10);

  // Determine active feed:
  // If photorealistic selected and Google key present -> Google 3D Tiles
  // If terrain-buildings selected and Cesium token present -> Cesium Ion
  // Otherwise -> High-fidelity procedural 3D city mesh with real coordinates
  const activeMode: SceneMode = useMemo(() => {
    if (sceneMode === "photorealistic" && hasGoogleKey) return "photorealistic";
    if (sceneMode === "terrain-buildings" && hasCesiumToken) return "terrain-buildings";
    return "procedural";
  }, [sceneMode, hasGoogleKey, hasCesiumToken]);

  useEffect(() => {
    if (sceneMode === "photorealistic" && !hasGoogleKey) {
      onProviderStatus?.({
        provider: "Google Photorealistic 3D Tiles",
        ready: false,
        hasCredentials: false,
        error: "Google Map Tiles API key (NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY) is not configured.",
      });
    } else if (sceneMode === "terrain-buildings" && !hasCesiumToken) {
      onProviderStatus?.({
        provider: "Cesium ion World Terrain & OSM Buildings",
        ready: false,
        hasCredentials: false,
        error: "Cesium ion token (NEXT_PUBLIC_CESIUM_ION_TOKEN) is not configured.",
      });
    } else {
      onProviderStatus?.({
        provider: activeMode === "photorealistic" ? "Google 3D Tiles" : activeMode === "terrain-buildings" ? "Cesium ion" : "Interactive 3D Urban Model",
        ready: true,
        hasCredentials: true,
        error: null,
      });
    }
  }, [sceneMode, activeMode, hasGoogleKey, hasCesiumToken, onProviderStatus]);

  const handlePickPoint = (point: THREE.Vector3) => {
    if (!onPickCoordinate) return;
    const geo = toGeodetic({ x: point.x, y: point.y, z: point.z }, {
      lat: anchor.coordinates.lat,
      lon: anchor.coordinates.lon,
      alt: anchor.altitudeOffset,
    });
    onPickCoordinate({ lat: geo.lat, lon: geo.lon });
  };

  return (
    <group name="city-tiles-root">
      {/* 1. Google Photorealistic 3D Tiles when credentials available */}
      {activeMode === "photorealistic" && hasGoogleKey && (
        <TilesRenderer
          url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleKey}`}
        >
          <TilesPlugin plugin={GoogleCloudAuthPlugin} args={[{ apiToken: googleKey }]} />
          <TilesPlugin plugin={GLTFExtensionsPlugin} />
          <TilesPlugin plugin={TileCompressionPlugin} />
          <TilesPlugin plugin={TilesFadePlugin} />
          <TilesPlugin plugin={UpdateOnChangePlugin} />
        </TilesRenderer>
      )}

      {/* 2. Cesium ion World Terrain & OSM Buildings when credentials available */}
      {activeMode === "terrain-buildings" && hasCesiumToken && (
        <group name="cesium-ion-layers">
          {/* Cesium OSM Buildings (Asset 96188) */}
          <TilesRenderer
            url="https://assets.ion.cesium.com/96188/tileset.json"
          >
            <TilesPlugin plugin={CesiumIonAuthPlugin} args={[{ apiToken: cesiumToken, assetId: 96188 }]} />
            <TilesPlugin plugin={GLTFExtensionsPlugin} />
            <TilesPlugin plugin={TileCompressionPlugin} />
            <TilesPlugin plugin={TilesFadePlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
          </TilesRenderer>

          {/* Cesium World Terrain (Asset 1) */}
          <TilesRenderer
            url="https://assets.ion.cesium.com/1/tileset.json"
          >
            <TilesPlugin plugin={CesiumIonAuthPlugin} args={[{ apiToken: cesiumToken, assetId: 1 }]} />
            <TilesPlugin plugin={QuantizedMeshPlugin} />
            <TilesPlugin plugin={UpdateOnChangePlugin} />
          </TilesRenderer>
        </group>
      )}

      {/* 3. High-fidelity procedural 3D textured mesh (fallback or standalone) */}
      {activeMode === "procedural" && (
        <ProceduralCityBlocks
          anchor={anchor}
          onPick={handlePickPoint}
        />
      )}
    </group>
  );
}
