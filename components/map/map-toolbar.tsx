import React from "react";
import { ArrowUpRight, Box, Flame, Wind } from "lucide-react";

interface MapToolbarProps {
  currentDisplayTime: string;
  showFires: boolean;
  showHistoricalSmoke: boolean;
  is3D: boolean;
  onToggleFires: () => void;
  onToggleHistoricalSmoke: () => void;
  onToggle3D: () => void;
  onOpenPlan?: () => void;
}

/**
 * Floating map toolbar exposing overlay toggles, 2D/3D building toggle, and planner jump action.
 */
export function MapToolbar({
  currentDisplayTime,
  showFires,
  showHistoricalSmoke,
  is3D,
  onToggleFires,
  onToggleHistoricalSmoke,
  onToggle3D,
  onOpenPlan,
}: MapToolbarProps) {
  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-700 shadow-md">
        <span className="text-xs font-semibold text-slate-200">Regional PM₂.₅ Overlay</span>
        <span className="text-[11px] font-mono text-emerald-400">{currentDisplayTime}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto pr-12 md:pr-0">
        <button
          type="button"
          onClick={onToggleFires}
          aria-label="Toggle NASA FIRMS active fire detections"
          className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border backdrop-blur transition shadow-sm ${
            showFires
              ? "bg-amber-700 hover:bg-amber-800 text-white border-amber-500 shadow-amber-950"
              : "bg-slate-900/95 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-300" />
          <span>Fires</span>
        </button>

        <button
          type="button"
          onClick={onToggleHistoricalSmoke}
          aria-label="Toggle historical smoke case"
          className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border backdrop-blur transition shadow-sm ${
            showHistoricalSmoke
              ? "bg-sky-700 hover:bg-sky-800 text-white border-sky-400 shadow-sky-950"
              : "bg-slate-900/95 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Wind className="w-3.5 h-3.5 text-sky-300" />
          <span>Historical Smoke</span>
        </button>

        <button
          type="button"
          onClick={onToggle3D}
          aria-label={
            is3D ? "Switch to 2D flat view" : "Switch to 3D perspective with extruded buildings"
          }
          className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold border backdrop-blur transition shadow-sm ${
            is3D
              ? "bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-500 shadow-emerald-950"
              : "bg-slate-900/95 text-slate-200 border-slate-700 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>{is3D ? "2D Flat View" : "3D Buildings"}</span>
        </button>

        {onOpenPlan && (
          <button
            type="button"
            onClick={onOpenPlan}
            className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-500/40 backdrop-blur shadow-sm transition"
          >
            <span>Build my smog plan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
