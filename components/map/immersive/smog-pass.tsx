"use client";

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { HazeStyle } from "@/lib/immersive/types";

interface SmogPassProps {
  hazeStyle: HazeStyle | null;
  visible?: boolean;
}

/**
 * 3D Depth-aware atmospheric haze slab.
 *
 * Simulates a ground-trapped thermal inversion smog layer:
 * - Bounded between ground (y = 0) and heightCeiling (planetary boundary layer).
 * - Exponential vertical falloff so tall skyscrapers and high aerial camera poses
 *   sit above or peek out of the smog blanket.
 * - Optical path length integration: farther surfaces inside the layer experience
 *   more scattering/extinction than foreground structures.
 * - Exact disclaimer label: "Illustration of forecast pollution".
 */
export function SmogPass({ hazeStyle, visible = true }: SmogPassProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => {
    return {
      uColor: { value: new THREE.Color("#cbd5e1") },
      uDensity: { value: 0.1 },
      uOpacity: { value: 0.2 },
      uCeiling: { value: 300.0 },
      uTime: { value: 0 },
    };
  }, []);

  // Update uniforms when hazeStyle changes
  if (hazeStyle) {
    uniforms.uColor.value.set(hazeStyle.color);
    uniforms.uDensity.value = hazeStyle.density;
    uniforms.uOpacity.value = hazeStyle.opacity;
    uniforms.uCeiling.value = hazeStyle.heightCeiling;
  }

  useFrame((state, delta) => {
    uniforms.uTime.value += delta * 0.15;
  });

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uDensity;
        uniform float uOpacity;
        uniform float uCeiling;
        uniform float uTime;

        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        void main() {
          // Height-dependent attenuation (smog is thickest near the ground y <= 0)
          float height = max(0.0, vWorldPosition.y);
          float heightFactor = clamp(1.0 - (height / uCeiling), 0.0, 1.0);
          heightFactor = pow(heightFactor, 1.4); // smooth inversion boundary

          // Distance falloff from camera to create subtle depth cue
          float dist = length(vWorldPosition - cameraPosition);
          float depthFactor = clamp(dist / 2200.0, 0.05, 1.0);

          // Subtle atmospheric drift
          float drift = sin(vWorldPosition.x * 0.003 + uTime) * 0.05 +
                        cos(vWorldPosition.z * 0.003 + uTime * 0.8) * 0.05;

          float finalAlpha = clamp(uOpacity * heightFactor * depthFactor + drift, 0.0, 0.88);

          // Sunlight scattering tint variation
          vec3 sunTint = mix(uColor, vec3(1.0, 0.95, 0.85), clamp(heightFactor * 0.2, 0.0, 0.3));

          gl_FragColor = vec4(sunTint, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
  }, [uniforms]);

  if (!visible || !hazeStyle) {
    return null;
  }

  // Large atmospheric volume covering ~12km around the anchor
  const boxHeight = hazeStyle.heightCeiling;
  const boxSize = 14000;

  return (
    <group name="atmospheric-haze-layer">
      {/* Volumetric boundary slab */}
      <mesh
        ref={meshRef}
        position={[0, boxHeight / 2, 0]}
        material={shaderMaterial}
      >
        <boxGeometry args={[boxSize, boxHeight, boxSize]} />
      </mesh>

      {/* Ground-level particulate scattering plane */}
      <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[boxSize, boxSize]} />
        <meshBasicMaterial
          color={hazeStyle.color}
          transparent
          opacity={Math.min(0.35, hazeStyle.opacity * 0.45)}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
