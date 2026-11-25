import React from "react";

/**
 * Scientific data source attribution and model limitation footer.
 */
export function AttributionFooter() {
  return (
    <footer className="border-t border-stone-200 pt-6 mt-12 text-xs text-stone-500 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p>
          Data sources: <strong className="text-stone-700">Open-Meteo</strong> (Copernicus CAMS
          atmospheric model), <strong className="text-stone-700">OpenFreeMap</strong> (vector
          basemaps), <strong className="text-stone-700">NASA FIRMS</strong> (MODIS / VIIRS active
          fires), <strong className="text-stone-700">NOAA HYSPLIT</strong> (atmospheric trajectory
          model).
        </p>
        <p className="font-mono">
          Scale: <span className="text-stone-700">US AQI</span> · Units:{" "}
          <span className="text-stone-700">µg/m³ PM₂.₅</span>
        </p>
      </div>
      <p className="text-[11px] text-stone-500 leading-relaxed">
        Regional model estimate represents regional atmospheric conditions. Fire detections and
        modeled smoke trajectories reflect possible atmospheric transport and do not establish
        direct source contribution or localized street-level microclimates.
      </p>
    </footer>
  );
}
