"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  Maximize2,
  Minimize2,
  Eye,
  RotateCcw,
  Building2,
  Layers,
  Sparkles,
  AlertTriangle,
  Info,
  ShieldAlert,
} from "lucide-react";
import { Forecast, AirSample } from "@/lib/forecast/types";
import { Coordinates, SceneMode, CityAnchorPreset } from "@/lib/immersive/types";
import { findAnchorForCoordinates, CITY_PRESETS } from "@/lib/immersive/presets";
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
  const [providerStatus, setProviderStatus] = useState<{
    provider: string;
    ready: boolean;
    hasCredentials: boolean;
    error: string | null;
  }>({
    provider: "3D City Renderer",
    ready: true,
    hasCredentials: true,
    error: null,
  });

  const anchor: CityAnchorPreset = useMemo(() => {
    return findAnchorForCoordinates(center);
  }, [center]);

  const [sceneMode, setSceneMode] = useState<SceneMode>(anchor.defaultMode);

  // Sync scene mode when anchor changes
  useEffect(() => {
    setSceneMode(anchor.defaultMode);
  }, [anchor]);

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

      // Animate or jump to target position
      controls.object.position.set(...preset.position);
      controls.target.set(...preset.target);
      controls.update();
    },
    [anchor]
  );

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
      <div className="relative w-full h-[540px] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
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
      className="relative w-full h-[540px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col select-none"
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

          {/* City geometry (Google 3D Tiles, Cesium ion, or Procedural Mesh) */}
          <CityTiles
            anchor={anchor}
            sceneMode={sceneMode}
            onPickCoordinate={handlePickCoordinate}
            onProviderStatus={setProviderStatus}
          />

          {/* Depth-aware atmospheric smog layer */}
          <SmogPass hazeStyle={hazeStyle} visible={showHaze} />
        </Canvas>
      </div>

      {/* Top Header Overlay: City Title, Provider Mode & Return to Map */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <span>{placeLabel}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                3D Scene · Illustrative city view
              </span>
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
              title="Cesium World Terrain & OSM Buildings"
            >
              Terrain & Buildings
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
            <span>Aerial (Roofs & Facades)</span>
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
            <span>Show haze</span>
          </label>
        </div>
      </div>

      {/* Floating Readout: Forecast-Linked Smog Banner */}
      <div className="absolute top-16 right-3 z-10 flex flex-col items-end gap-1.5 pointer-events-auto max-w-xs">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-2.5 shadow-lg text-xs flex flex-col gap-1 w-full">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold text-slate-100">Forecast Atmospheric State</span>
            <span className="text-[10px] text-amber-400 font-mono">3D Haze Layer</span>
          </div>

          {currentSample ? (
            <div className="space-y-1 mt-0.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-mono text-emerald-300 font-medium">{formattedTime}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Forecast PM₂.₅:</span>
                <span className="font-mono font-bold text-amber-300">
                  {currentSample.pm25 != null ? Math.round(currentSample.pm25) : "--"} µg/m³
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
              Forecast unavailable for this hour
            </div>
          )}

          {/* Exact required disclaimer label */}
          <div className="mt-1 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 leading-tight">
            <span className="font-semibold text-slate-300">Illustration of forecast pollution</span> —
            bounded visual effect based on regional PM₂.₅. Does not represent microclimate or localized street diffusion.
          </div>
        </div>

        {/* Provider Notice Banner (if credentials needed or offline model active) */}
        {providerStatus.error && (
          <div className="bg-amber-950/80 backdrop-blur border border-amber-800/80 rounded-xl p-2 shadow-lg text-[11px] text-amber-200 flex items-start gap-1.5 w-full">
            <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="leading-snug">
              <span className="font-semibold text-amber-300">{providerStatus.provider} notice: </span>
              {providerStatus.error}
              <div className="text-[10px] text-amber-400/80 mt-0.5">
                Displaying high-fidelity interactive 3D city mesh with real coordinates and active depth haze.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Picking & Planner Hint */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg text-[11px] text-slate-300 flex items-center gap-2">
          <span>Click any 3D building or street point to set planner location</span>
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
        Tiles &amp; Data: OpenStreetMap · Open-Meteo · Cesium / Google 3D
      </div>
    </div>
  );
}
