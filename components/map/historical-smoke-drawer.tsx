import React from "react";
import { Info, Wind, X } from "lucide-react";

interface HistoricalSmokeDrawerProps {
  onClose: () => void;
}

/**
 * Attribution and uncertainty disclosure drawer for the historical Nov 3, 2024 HYSPLIT trajectory.
 */
export function HistoricalSmokeDrawer({ onClose }: HistoricalSmokeDrawerProps) {
  return (
    <div className="absolute bottom-28 left-4 right-4 md:left-auto md:right-4 md:w-96 z-20 bg-slate-900/95 border border-sky-500/40 rounded-xl p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
          <Wind className="w-4 h-4" />
          <span>Possible smoke paths</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close historical smoke details"
          className="p-1 text-slate-300 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2.5 space-y-1.5 text-xs text-slate-300">
        <div>
          <span className="text-slate-400">Date &amp; Case:</span>{" "}
          <strong>November 3, 2024 (08:00 UTC)</strong>
        </div>
        <div>
          <span className="text-slate-400">Model:</span> NOAA HYSPLIT (Forward Trajectory)
        </div>
        <div>
          <span className="text-slate-400">Starting Heights:</span>{" "}
          <span className="font-mono text-sky-300">100m, 500m, 1000m AGL</span>
        </div>
        <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <span>
            Path estimates where air may travel. It does not establish smoke concentrations or
            source contribution. Citywide PM₂.₅ is displayed separately in the forecast.
          </span>
        </div>
      </div>
    </div>
  );
}
