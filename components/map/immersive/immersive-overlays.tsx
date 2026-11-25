import React, { useEffect, useRef } from "react";
import { Building2, Eye, RotateCcw, Sparkles } from "lucide-react";
import { AirSample } from "@/lib/forecast/types";
import { HazeStyle, ProviderStatus, SceneMode } from "@/lib/immersive/types";

export type CameraPresetKey = "home" | "aerial" | "skyline";

const SCENE_MODE_OPTIONS: ReadonlyArray<{
  mode: SceneMode;
  label: string;
  title: string;
}> = [
  { mode: "photorealistic", label: "Photorealistic", title: "Google Photorealistic 3D Tiles" },
  {
    mode: "terrain-buildings",
    label: "Terrain & Buildings",
    title: "Cesium Ion World Terrain & OSM Buildings",
  },
  {
    mode: "procedural",
    label: "Illustrative",
    title: "High-fidelity procedural illustrative 3D city layout",
  },
];

function ProviderBadge({
  sceneMode,
  placeLabel,
  providerStatus,
}: {
  sceneMode: SceneMode;
  placeLabel: string;
  providerStatus: ProviderStatus;
}) {
  if (sceneMode === "procedural") {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
        <span>Illustrative city model · 3D layout</span>
      </span>
    );
  }
  if (providerStatus.geometryRendered && providerStatus.ready) {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
        <span>3D imagery loaded · {providerStatus.provider}</span>
      </span>
    );
  }
  if (providerStatus.hasCredentials && !providerStatus.error) {
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-700/60 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block animate-ping" />
        <span>Streaming 3D tiles · {placeLabel}...</span>
      </span>
    );
  }
  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      <span>3D imagery unavailable</span>
    </span>
  );
}

export function ImmersiveHeaderBar({
  placeLabel,
  sceneMode,
  providerStatus,
  onChangeSceneMode,
  onBackToMap,
}: {
  placeLabel: string;
  sceneMode: SceneMode;
  providerStatus: ProviderStatus;
  onChangeSceneMode: (mode: SceneMode) => void;
  onBackToMap: () => void;
}) {
  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg">
        <Building2 className="w-4 h-4 text-emerald-400" />
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
            <span>{placeLabel}</span>
            <ProviderBadge
              sceneMode={sceneMode}
              placeLabel={placeLabel}
              providerStatus={providerStatus}
            />
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-1 text-xs">
          {SCENE_MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={sceneMode === option.mode}
              onClick={() => onChangeSceneMode(option.mode)}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                sceneMode === option.mode
                  ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/70"
              }`}
              title={option.title}
            >
              {option.label}
            </button>
          ))}
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
  );
}

export function ImmersiveCameraControls({
  activePreset,
  showHaze,
  onApplyPreset,
  onToggleHaze,
}: {
  activePreset: CameraPresetKey;
  showHaze: boolean;
  onApplyPreset: (preset: CameraPresetKey) => void;
  onToggleHaze: (checked: boolean) => void;
}) {
  const presetButtonClass = (preset: CameraPresetKey) =>
    `px-2.5 py-1.5 rounded-lg text-left font-medium transition flex items-center gap-2 ${
      activePreset === preset
        ? "bg-slate-800 text-emerald-400 font-semibold"
        : "text-slate-300 hover:bg-slate-800/50"
    }`;

  return (
    <div className="absolute top-16 left-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
      <div className="flex flex-col bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl p-1 shadow-lg text-xs">
        <button
          type="button"
          aria-pressed={activePreset === "home"}
          onClick={() => onApplyPreset("home")}
          className={presetButtonClass("home")}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset View</span>
        </button>
        <button
          type="button"
          aria-pressed={activePreset === "aerial"}
          onClick={() => onApplyPreset("aerial")}
          className={presetButtonClass("aerial")}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Aerial (Roofs &amp; Facades)</span>
        </button>
        <button
          type="button"
          aria-pressed={activePreset === "skyline"}
          onClick={() => onApplyPreset("skyline")}
          className={presetButtonClass("skyline")}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Skyline (Roof-Height)</span>
        </button>
      </div>

      <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg text-xs">
        <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
          <input
            type="checkbox"
            checked={showHaze}
            onChange={(event) => onToggleHaze(event.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500/40 bg-slate-800 cursor-pointer"
          />
          <span>Illustration of forecast pollution</span>
        </label>
      </div>
    </div>
  );
}

export function ImmersiveAtmosphereBanner({
  currentSample,
  formattedTime,
  hazeStyle,
}: {
  currentSample: AirSample | null;
  formattedTime: string | null;
  hazeStyle: HazeStyle | null;
}) {
  return (
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

        <div className="mt-1 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 leading-tight">
          <span className="font-semibold text-slate-300">Illustration of forecast pollution</span> —
          bounded visual effect based on regional PM₂.₅. Does not represent microclimate or
          localized street diffusion.
        </div>
      </div>
    </div>
  );
}

export function ImmersiveFallbackModal({
  providerStatus,
  onChooseIllustrative,
  onBackToMap,
}: {
  providerStatus: ProviderStatus;
  onChooseIllustrative: () => void;
  onBackToMap: () => void;
}) {
  const exploreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    exploreButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBackToMap();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBackToMap]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="immersive-fallback-title"
      aria-describedby="immersive-fallback-desc"
      className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm pointer-events-auto"
    >
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
          <Building2 className="w-6 h-6" />
        </div>
        <h3 id="immersive-fallback-title" className="text-base font-semibold text-slate-100">
          {!providerStatus.hasCredentials
            ? "Real 3D City Imagery Not Active"
            : "Unable to Stream 3D Tiles"}
        </h3>
        <p id="immersive-fallback-desc" className="text-xs text-slate-300 mt-1.5 mb-5 leading-relaxed">
          {!providerStatus.hasCredentials
            ? "Real-city 3D geometry requires a configured 3D tile provider. You can explore the city using our interactive illustrative 3D model, or stay on the 2D regional map."
            : providerStatus.error}
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
          <button
            ref={exploreButtonRef}
            type="button"
            onClick={onChooseIllustrative}
            className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs transition shadow-md flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explore illustrative city</span>
          </button>
          <button
            type="button"
            onClick={onBackToMap}
            className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <span>Return to 2D Map</span>
          </button>
        </div>
      </div>
    </div>
  );
}
