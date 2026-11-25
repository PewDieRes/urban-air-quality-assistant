"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { AlertTriangle } from "lucide-react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";
import { AirSample, Forecast } from "@/lib/forecast/types";
import { getHazeStyle } from "@/lib/immersive/haze";
import { findAnchorForCoordinates } from "@/lib/immersive/presets";
import { CityAnchorPreset, Coordinates, ProviderStatus, SceneMode } from "@/lib/immersive/types";
import { CityTiles } from "./city-tiles";
import {
  CameraPresetKey,
  ImmersiveAtmosphereBanner,
  ImmersiveCameraControls,
  ImmersiveFallbackModal,
  ImmersiveHeaderBar,
} from "./immersive-overlays";
import { SmogPass } from "./smog-pass";

interface ImmersiveCityViewProps {
  center: Coordinates;
  placeLabel: string;
  forecast: Forecast | null;
  selectedInstant: string | null;
  onSelectCoordinate: (coords: Coordinates) => void;
  onBackToMap: () => void;
  onBuildPlan?: () => void;
}

/**
 * Interactive Three.js / React Three Fiber 3D skyline and forecast-linked haze viewer.
 */
export function ImmersiveCityView({
  center,
  placeLabel,
  forecast,
  selectedInstant,
  onSelectCoordinate,
  onBackToMap,
  onBuildPlan,
}: ImmersiveCityViewProps) {
  const [showHaze, setShowHaze] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPresetKey>("home");
  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);

  const anchor: CityAnchorPreset = useMemo(() => findAnchorForCoordinates(center), [center]);

  const hasGoogleKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY || "").trim().length > 0;
  const hasCesiumToken = (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "").trim().length > 0;

  const defaultInitialMode: SceneMode = useMemo(() => {
    if (hasGoogleKey) return "photorealistic";
    if (hasCesiumToken) return "terrain-buildings";
    return anchor.defaultMode;
  }, [hasGoogleKey, hasCesiumToken, anchor.defaultMode]);

  const [sceneMode, setSceneMode] = useState<SceneMode>(defaultInitialMode);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    provider: "3D City Renderer",
    ready: false,
    hasCredentials: hasGoogleKey || hasCesiumToken,
    error: null,
    errorType: null,
    geometryRendered: false,
    mode: defaultInitialMode,
  });

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const glContext = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!glContext) {
        setWebGlSupported(false);
      }
    } catch (webGlError: unknown) {
      console.warn("WebGL context probe failed:", webGlError);
      setWebGlSupported(false);
    }
  }, []);

  const currentSample: AirSample | null = useMemo(() => {
    if (!forecast?.hourly || forecast.hourly.length === 0) return null;
    if (!selectedInstant) return forecast.hourly[0];
    return forecast.hourly.find((sample) => sample.at === selectedInstant) || forecast.hourly[0];
  }, [forecast?.hourly, selectedInstant]);

  const hazeStyle = useMemo(() => getHazeStyle(currentSample?.pm25), [currentSample]);

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const isDraggingRef = useRef(false);
  const pointerDownPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const applyPreset = useCallback(
    (presetName: CameraPresetKey) => {
      setActivePreset(presetName);
      if (!controlsRef.current) {
        return;
      }
      const preset = anchor.cameraPresets[presetName];
      controlsRef.current.object.position.set(...preset.position);
      controlsRef.current.target.set(...preset.target);
      controlsRef.current.update();
    },
    [anchor]
  );

  useEffect(() => {
    applyPreset("home");
  }, [anchor.id, applyPreset]);

  const handlePointerDown = (event: React.PointerEvent) => {
    isDraggingRef.current = false;
    pointerDownPositionRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const deltaX = Math.abs(event.clientX - pointerDownPositionRef.current.x);
    const deltaY = Math.abs(event.clientY - pointerDownPositionRef.current.y);
    if (deltaX > 4 || deltaY > 4) {
      isDraggingRef.current = true;
    }
  };

  const handlePickCoordinate = (coords: Coordinates) => {
    if (!isDraggingRef.current) {
      onSelectCoordinate(coords);
    }
  };

  const formattedTime = useMemo(() => {
    if (!currentSample) return null;
    const formatted = formatHourlyTimeWithDate(currentSample.at, forecast?.timeZone || "UTC");
    return typeof formatted === "string" ? formatted : formatted.full;
  }, [currentSample, forecast?.timeZone]);

  if (!webGlSupported) {
    return (
      <div className="relative w-full h-[460px] sm:h-[540px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
        <h3 className="text-lg font-semibold text-slate-100">
          WebGL2 is Not Supported on this Browser
        </h3>
        <p className="text-sm text-slate-400 max-w-md mt-1 mb-4">
          Hardware-accelerated 3D rendering is unavailable. You can continue using the
          high-resolution 2D forecast map and household planner.
        </p>
        <button
          type="button"
          onClick={onBackToMap}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition shadow-lg"
        >
          Return to 2D Map
        </button>
      </div>
    );
  }

  const attributionLabel =
    sceneMode === "photorealistic"
      ? "Google Photorealistic 3D Tiles"
      : sceneMode === "terrain-buildings"
      ? "Cesium Ion World Terrain & OSM"
      : "OpenStreetMap";

  return (
    <div
      className="relative w-full h-[460px] sm:h-[540px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <div className="absolute inset-0 z-0">
        <Canvas
          gl={{ antialias: true, powerPreference: "high-performance", depth: true }}
          dpr={[1, 1.5]}
        >
          <PerspectiveCamera
            makeDefault
            position={anchor.cameraPresets.home.position}
            fov={anchor.cameraPresets.home.fov || 50}
            near={1}
            far={16000}
          />
          <OrbitControls
            ref={controlsRef}
            target={new THREE.Vector3(...anchor.cameraPresets.home.target)}
            maxPolarAngle={Math.PI / 2.05}
            minDistance={40}
            maxDistance={3500}
            enableDamping
            dampingFactor={0.08}
          />

          <ambientLight intensity={0.8} />
          <directionalLight position={[400, 800, 300]} intensity={1.4} castShadow />
          <directionalLight position={[-400, 200, -300]} intensity={0.4} />

          <CityTiles
            anchor={anchor}
            sceneMode={sceneMode}
            onPickCoordinate={handlePickCoordinate}
            onProviderStatus={setProviderStatus}
          />

          <SmogPass
            hazeStyle={hazeStyle}
            visible={showHaze && currentSample != null && currentSample.pm25 != null}
          />
        </Canvas>
      </div>

      <ImmersiveHeaderBar
        placeLabel={placeLabel}
        sceneMode={sceneMode}
        providerStatus={providerStatus}
        onChangeSceneMode={setSceneMode}
        onBackToMap={onBackToMap}
      />

      <ImmersiveCameraControls
        activePreset={activePreset}
        showHaze={showHaze}
        onApplyPreset={applyPreset}
        onToggleHaze={setShowHaze}
      />

      <ImmersiveAtmosphereBanner
        currentSample={currentSample}
        formattedTime={formattedTime}
        hazeStyle={hazeStyle}
      />

      {sceneMode !== "procedural" && (!providerStatus.hasCredentials || providerStatus.error) && (
        <ImmersiveFallbackModal
          providerStatus={providerStatus}
          onChooseIllustrative={() => setSceneMode("procedural")}
          onBackToMap={onBackToMap}
        />
      )}

      <div className="absolute bottom-3 left-3 z-10 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg text-[11px] text-slate-300 flex items-center gap-2">
          <span>Click 3D point to set planner location</span>
          {onBuildPlan && (
            <button
              type="button"
              onClick={onBuildPlan}
              className="ml-1 px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-[11px] transition shadow"
            >
              Build Plan
            </button>
          )}
        </div>
      </div>

      <div className="absolute bottom-2 right-3 z-10 pointer-events-none text-[10px] text-slate-300 bg-slate-950/90 backdrop-blur px-2 py-0.5 rounded border border-slate-800">
        Tiles &amp; Data: {attributionLabel} · Open-Meteo
      </div>
    </div>
  );
}
