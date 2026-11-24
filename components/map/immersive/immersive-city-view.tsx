"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  Eye,
  RotateCcw,
  Building2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Forecast, AirSample } from "@/lib/forecast/types";
import { Coordinates, SceneMode, CityAnchorPreset, ProviderStatus } from "@/lib/immersive/types";
import { findAnchorForCoordinates } from "@/lib/immersive/presets";
import { getHazeStyle } from "@/lib/immersive/haze";
import { formatHourlyTimeWithDate } from "@/lib/forecast/open-meteo";
import { CityTiles } from "./city-tiles";
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
  const [activePreset, setActivePreset] = useState<"home" | "aerial" | "skyline">("home");
  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);

  const anchor: CityAnchorPreset = useMemo(() => {
    return findAnchorForCoordinates(center);
  }, [center]);

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY || "";
  const cesiumToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "";
  const hasGoogleKey = Boolean(googleKey && googleKey.trim().length > 0);
  const hasCesiumToken = Boolean(cesiumToken && cesiumToken.trim().length > 0);

  // Default mode prioritizes real providers if configured
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

  // Check WebGL availability
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        setWebGlSupported(false);
      }
    } catch {
      setWebGlSupported(false);
    }
  }, []);

  // Derive active hourly sample from selectedInstant
  const currentSample: AirSample | null = useMemo(() => {
    if (!forecast?.hourly || forecast.hourly.length === 0) return null;
    if (!selectedInstant) return forecast.hourly[0];
    const match = forecast.hourly.find((s) => s.at === selectedInstant);
    return match || forecast.hourly[0];
  }, [forecast?.hourly, selectedInstant]);

  const hazeStyle = useMemo(() => {
    return getHazeStyle(currentSample?.pm25);
  }, [currentSample]);

  // Camera & controls ref
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const isDraggingRef = useRef(false);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Camera preset transitions
  const applyPreset = useCallback(
    (presetName: "home" | "aerial" | "skyline") => {
      setActivePreset(presetName);
      if (!controlsRef.current) return;

      const preset = anchor.cameraPresets[presetName];
      const controls = controlsRef.current;

      controls.object.position.set(...preset.position);
      controls.target.set(...preset.target);
      controls.update();
    },
    [anchor]
  );

  // Automatically reset camera view to the new city when anchor coordinates change
  useEffect(() => {
    applyPreset("home");
  }, [anchor.id, applyPreset]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
    if (dx > 4 || dy > 4) {
      isDraggingRef.current = true;
    }
  };

  const handlePickCoordinate = (coords: Coordinates) => {
    // Only pick if user clicked without dragging
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
        <h3 className="text-lg font-semibold text-slate-100">WebGL2 is Not Supported on this Browser</h3>
        <p className="text-sm text-slate-400 max-w-md mt-1 mb-4">
          Hardware-accelerated 3D rendering is unavailable. You can continue using the high-resolution 2D forecast map and household planner.
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

  return (
    <div
      className="relative w-full h-[460px] sm:h-[540px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* 3D Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <Canvas
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            depth: true,
          }}
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
            maxPolarAngle={Math.PI / 2.05} // prevent going underground
            minDistance={40}
            maxDistance={3500}
            enableDamping
            dampingFactor={0.08}
          />

          <ambientLight intensity={0.8} />
          <directionalLight
            position={[400, 800, 300]}
            intensity={1.4}
            castShadow
          />
          <directionalLight position={[-400, 200, -300]} intensity={0.4} />

          {/* City geometry (Google 3D Tiles, Cesium Ion, or Procedural Mesh) */}
          <CityTiles
            anchor={anchor}
            sceneMode={sceneMode}
            onPickCoordinate={handlePickCoordinate}
            onProviderStatus={setProviderStatus}
          />

          {/* Depth-aware atmospheric smog layer: turned off if forecast unavailable */}
          <SmogPass
            hazeStyle={hazeStyle}
            visible={showHaze && currentSample != null && currentSample.pm25 != null}
          />
        </Canvas>
      </div>

      {/* Top Header Overlay: City Title, Provider Mode & Return to Map */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
              <span>{placeLabel}</span>
              {sceneMode === "procedural" ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                  <span>Illustrative city model · 3D layout</span>
                </span>
              ) : providerStatus.geometryRendered && providerStatus.ready ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  <span>3D imagery loaded · {providerStatus.provider}</span>
                </span>
              ) : providerStatus.hasCredentials && !providerStatus.error ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-700/60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block animate-ping" />
                  <span>Streaming 3D tiles · {placeLabel}...</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  <span>3D imagery unavailable</span>
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Provider feed selector */}
          <div className="flex items-center bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => setSceneMode("photorealistic")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                sceneMode === "photorealistic"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Google Photorealistic 3D Tiles"
            >
              Photorealistic
            </button>
            <button
              type="button"
              onClick={() => setSceneMode("terrain-buildings")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                sceneMode === "terrain-buildings"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Cesium Ion World Terrain & OSM Buildings"
            >
              Terrain &amp; Buildings
            </button>
            <button
              type="button"
              onClick={() => setSceneMode("procedural")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                sceneMode === "procedural"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="High-fidelity procedural illustrative 3D city layout"
            >
              Illustrative
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToMap}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-100 border border-slate-700 backdrop-blur transition shadow-lg"
          >
            <span>Back to 2D Map</span>
          </button>
        </div>
      </div>

      {/* Floating Camera Presets Bar */}
      <div className="absolute top-16 left-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
        <div className="flex flex-col bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-1 shadow-lg text-xs">
          <button
            type="button"
            onClick={() => applyPreset("home")}
            className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition flex items-center gap-2 ${
              activePreset === "home" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-300 hover:bg-slate-800/50"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset View</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("aerial")}
            className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition flex items-center gap-2 ${
              activePreset === "aerial" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-300 hover:bg-slate-800/50"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Aerial (Roofs &amp; Facades)</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("skyline")}
            className={`px-2.5 py-1.5 rounded-lg text-left font-medium transition flex items-center gap-2 ${
              activePreset === "skyline" ? "bg-slate-800 text-emerald-400 font-semibold" : "text-slate-300 hover:bg-slate-800/50"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Skyline (Roof-Height)</span>
          </button>
        </div>

        {/* Haze Toggle & Readout */}
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
            <input
              type="checkbox"
              checked={showHaze}
              onChange={(e) => setShowHaze(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500/40 bg-slate-800 cursor-pointer"
            />
            <span>Illustration of forecast pollution</span>
          </label>
        </div>
      </div>

      {/* Floating Readout: Forecast-Linked Smog Banner */}
      <div className="absolute top-16 right-3 z-10 flex flex-col items-end gap-1.5 pointer-events-auto max-w-[220px] sm:max-w-xs">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-2.5 shadow-lg text-xs flex flex-col gap-1 w-full">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold text-slate-100">Forecast Atmosphere</span>
            <span className="text-[10px] text-amber-400 font-mono">3D Haze Layer</span>
          </div>

          {currentSample && currentSample.pm25 != null ? (
            <div className="space-y-1 mt-0.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-mono text-emerald-300 font-medium">{formattedTime}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Forecast PM₂.₅:</span>
                <span className="font-mono font-bold text-amber-300">
                  {Math.round(currentSample.pm25)} µg/m³
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Smog Visual Density:</span>
                <span className="font-mono text-sky-300">
                  {hazeStyle ? `${Math.round(hazeStyle.density * 100)}%` : "--"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-amber-300 py-1 font-mono">
              Forecast unavailable for this location
            </div>
          )}

          {/* Exact required disclaimer label */}
          <div className="mt-1 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 leading-tight">
            <span className="font-semibold text-slate-300">Illustration of forecast pollution</span> —
            bounded visual effect based on regional PM₂.₅. Does not represent microclimate or localized street diffusion.
          </div>
        </div>
      </div>

      {/* Explicit Household Overlay when real imagery cannot load */}
      {sceneMode !== "procedural" && (!providerStatus.hasCredentials || providerStatus.error) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm pointer-events-auto">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              {!providerStatus.hasCredentials
                ? "Real 3D City Imagery Not Active"
                : "Unable to Stream 3D Tiles"}
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 mb-5 leading-relaxed">
              {!providerStatus.hasCredentials
                ? "Real-city 3D geometry requires a configured 3D tile provider. You can explore the city using our interactive illustrative 3D model, or stay on the 2D regional map."
                : providerStatus.error}
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
              <button
                type="button"
                onClick={() => setSceneMode("procedural")}
                className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition shadow-md flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explore illustrative city</span>
              </button>
              <button
                type="button"
                onClick={onBackToMap}
                className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition flex items-center justify-center gap-1.5"
              >
                <span>Return to 2D Map</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Picking & Planner Hint */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg text-[11px] text-slate-300 flex items-center gap-2">
          <span>Click 3D point to set planner location</span>
          {onBuildPlan && (
            <button
              type="button"
              onClick={onBuildPlan}
              className="ml-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition shadow"
            >
              Build Plan
            </button>
          )}
        </div>
      </div>

      {/* Bottom Right Required Attribution Overlay */}
      <div className="absolute bottom-2 right-3 z-10 pointer-events-none text-[10px] text-slate-400/90 bg-slate-950/70 backdrop-blur px-2 py-0.5 rounded border border-slate-800">
        Tiles &amp; Data: {sceneMode === "photorealistic" ? "Google Photorealistic 3D Tiles" : sceneMode === "terrain-buildings" ? "Cesium Ion World Terrain & OSM" : "OpenStreetMap"} · Open-Meteo
      </div>
    </div>
  );
}
