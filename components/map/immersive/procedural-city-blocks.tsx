"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { CityAnchorPreset } from "@/lib/immersive/types";

interface ProceduralBuildingSpec {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  name: string;
}

interface ProceduralCityBlocksProps {
  anchor: CityAnchorPreset;
  onPick?: (point: THREE.Vector3) => void;
}

const TOKYO_PALETTE = ["#1e293b", "#334155", "#475569", "#64748b", "#0f172a"] as const;
const DELHI_PALETTE = ["#78350f", "#92400e", "#b45309", "#d97706", "#451a03"] as const;

function buildProceduralBuildings(isTokyo: boolean): ProceduralBuildingSpec[] {
  const buildings: ProceduralBuildingSpec[] = [];
  let seed = isTokyo ? 1397671 : 772090;
  const nextRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  buildings.push({
    id: "landmark-center",
    position: [0, 18, 0],
    size: [110, 36, 160],
    color: isTokyo ? "#8b2500" : "#d97706",
    name: isTokyo ? "Tokyo Station Marunouchi" : "Connaught Central Arcade",
  });

  const gridExtent = 4;
  const blockSpacing = 160;
  const palette = isTokyo ? TOKYO_PALETTE : DELHI_PALETTE;
  const complexPrefix = isTokyo ? "Marunouchi Tower" : "Barakhamba Complex";

  for (let gridX = -gridExtent; gridX <= gridExtent; gridX++) {
    for (let gridZ = -gridExtent; gridZ <= gridExtent; gridZ++) {
      if (gridX === 0 && gridZ === 0) {
        continue;
      }

      const blockX = gridX * blockSpacing;
      const blockZ = gridZ * blockSpacing;
      const buildingsPerBlock = 1 + Math.floor(nextRandom() * 3);

      for (let buildingIndex = 0; buildingIndex < buildingsPerBlock; buildingIndex++) {
        const offsetX = (nextRandom() - 0.5) * 80;
        const offsetZ = (nextRandom() - 0.5) * 80;
        const distanceFromCenter = Math.hypot(gridX, gridZ);
        const heightScale = Math.max(0.3, 1.0 - distanceFromCenter / (gridExtent * 1.5));
        const height = Math.floor(35 + nextRandom() * 180 * heightScale);
        const width = 30 + Math.floor(nextRandom() * 40);
        const depth = 30 + Math.floor(nextRandom() * 40);

        buildings.push({
          id: `bld-${gridX}-${gridZ}-${buildingIndex}`,
          position: [blockX + offsetX, height / 2, blockZ + offsetZ],
          size: [width, height, depth],
          color: palette[Math.floor(nextRandom() * palette.length)],
          name: `${complexPrefix} #${gridX + 5}-${gridZ + 5}`,
        });
      }
    }
  }

  return buildings;
}

/**
 * Procedural textured 3D city layout benchmark used when real 3D tile keys are unset or chosen explicitly.
 */
export function ProceduralCityBlocks({ anchor, onPick }: ProceduralCityBlocksProps) {
  const isTokyo = anchor.id.includes("tokyo");
  const buildings = useMemo(() => buildProceduralBuildings(isTokyo), [isTokyo]);

  return (
    <group name="procedural-city-blocks">
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          onPick?.(event.point);
        }}
      >
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      <gridHelper args={[4000, 50, "#334155", "#1e293b"]} position={[0, 0.2, 0]} />

      {buildings.map((building) => (
        <group key={building.id} position={building.position}>
          <mesh
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onPick?.(event.point);
            }}
          >
            <boxGeometry args={building.size} />
            <meshStandardMaterial color={building.color} roughness={0.4} metalness={0.2} />
          </mesh>
          <mesh position={[0, building.size[1] / 2 + 1, 0]}>
            <boxGeometry args={[building.size[0] * 0.7, 2, building.size[2] * 0.7]} />
            <meshStandardMaterial color="#0284c7" emissive="#0369a1" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
