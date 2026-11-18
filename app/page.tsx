"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { LocationPicker } from "@/components/location/location-picker";
import { ForecastPanel } from "@/components/forecast/forecast-panel";
import { AirQualityMap } from "@/components/map/air-quality-map";
import { PlanPanel } from "@/components/plan/plan-panel";
import { Place, DEFAULT_PLACE, TOKYO_PLACE } from "@/lib/location/search";
import { Forecast, AirSample } from "@/lib/forecast/types";
import { Wind, Shield, Globe2, Sparkles, Flame, Navigation2, MapPin } from "lucide-react";

export default function HomePage() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(DEFAULT_PLACE);
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>({
    lat: DEFAULT_PLACE.lat,
    lon: DEFAULT_PLACE.lon,
  });

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [selectedInstant, setSelectedInstant] = useState<string | null>(null);
  const [detectedPlace, setDetectedPlace] = useState<Place | null>(null);

  const planRef = useRef<HTMLDivElement>(null);

  // Background auto-detect user's location to provide instant "My Location" option
  useEffect(() => {
    fetch("/api/locations/detect")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.place) {
          setDetectedPlace(data.place);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch forecast whenever coordinates change
  const refreshForecast = useCallback(async () => {
    try {
      const res = await fetch(`/api/forecast?lat=${coordinates.lat}&lon=${coordinates.lon}`);
      if (res.ok) {
        const data = await res.json();
        setForecast(data.forecast);
      }
    } catch (err) {
      // ForecastPanel handles its own retry state
    }
  }, [coordinates.lat, coordinates.lon]);

  useEffect(() => {
    refreshForecast();
  }, [refreshForecast]);

  const handleSelectLocation = (place: Place | null, coords: { lat: number; lon: number }) => {
    setSelectedPlace(place);
    setCoordinates(coords);
    setSelectedInstant(null);
  };

  const handleSelectHour = (sample: AirSample) => {
    setSelectedInstant(sample.at);
  };

  const handleOpenPlan = () => {
    planRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const switchToTokyo = () => {
    handleSelectLocation(TOKYO_PLACE, { lat: TOKYO_PLACE.lat, lon: TOKYO_PLACE.lon });
  };

  const switchToDelhi = () => {
    handleSelectLocation(DEFAULT_PLACE, { lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon });
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Wind className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg leading-tight tracking-tight text-white">
                  Urban Air Quality Assistant
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  GenAI · Worldwide
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Smog planning, regional modeling & smoke transport
              </p>
            </div>
          </div>

          {/* Location Picker & Demo Quick Switches */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={switchToDelhi}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  selectedPlace?.name === DEFAULT_PLACE.name
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Delhi-NCR
              </button>
              <button
                type="button"
                onClick={switchToTokyo}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  selectedPlace?.name === TOKYO_PLACE.name
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Tokyo Demo
              </button>
              {detectedPlace &&
                detectedPlace.name !== DEFAULT_PLACE.name &&
                detectedPlace.name !== TOKYO_PLACE.name && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectLocation(detectedPlace, {
                        lat: detectedPlace.lat,
                        lon: detectedPlace.lon,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                      selectedPlace?.id === detectedPlace.id ||
                      selectedPlace?.name === detectedPlace.name
                        ? "bg-emerald-600 text-white shadow"
                        : "text-sky-400 hover:text-sky-200"
                    }`}
                    title={`Switch to detected location: ${detectedPlace.name}`}
                  >
                    <MapPin className="w-3 h-3 text-sky-400" />
                    <span>{detectedPlace.name} (My Location)</span>
                  </button>
                )}
            </div>

            <div className="flex-1 min-w-[260px]">
              <LocationPicker
                selectedPlace={selectedPlace}
                coordinates={coordinates}
                onSelectLocation={handleSelectLocation}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Forecast Overview Panel */}
        <ForecastPanel
          lat={coordinates.lat}
          lon={coordinates.lon}
          locationName={selectedPlace ? selectedPlace.name : "Selected Location"}
          onOpenPlan={handleOpenPlan}
          onSelectHour={handleSelectHour}
          selectedInstant={selectedInstant}
        />

        {/* Interactive 2D / 3D Map */}
        <section aria-label="Interactive air quality map">
          <AirQualityMap
            center={coordinates}
            forecast={forecast}
            onOpenPlan={handleOpenPlan}
            onSelectCoordinate={(coords) => {
              const customPlace: Place = {
                id: `map-${coords.lat.toFixed(4)}-${coords.lon.toFixed(4)}`,
                name: "Map Selection",
                region: `${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}°`,
                country: "",
                lat: coords.lat,
                lon: coords.lon,
                timeZone: forecast?.timeZone || "UTC",
              };
              handleSelectLocation(customPlace, coords);

              // Background reverse geocode to give the user the real area name
              fetch(`/api/locations/reverse?lat=${coords.lat}&lon=${coords.lon}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                  if (data?.place) {
                    setSelectedPlace(data.place);
                  }
                })
                .catch(() => {});
            }}
            selectedInstant={selectedInstant}
            onSelectInstant={(instant) => setSelectedInstant(instant)}
          />
        </section>

        {/* Household Planner Anchor & Panel */}
        <div ref={planRef} id="household-plan-section">
          <PlanPanel
            forecast={forecast}
            locationName={selectedPlace ? selectedPlace.name : "Selected Location"}
            lat={coordinates.lat}
            lon={coordinates.lon}
          />
        </div>

        {/* Data Attribution & Disclaimers Footer */}
        <footer className="border-t border-slate-800/80 pt-6 mt-12 text-xs text-slate-500 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>
              Data sources: <strong className="text-slate-400">Open-Meteo</strong> (Copernicus CAMS regional air quality model),{" "}
              <strong className="text-slate-400">OpenFreeMap</strong> (vector basemaps),{" "}
              <strong className="text-slate-400">NASA FIRMS</strong> (MODIS / VIIRS active fires),{" "}
              <strong className="text-slate-400">NOAA HYSPLIT</strong> (atmospheric trajectory model).
            </p>
            <p className="font-mono">
              Scale: <span className="text-slate-400">US AQI</span> · Units: <span className="text-slate-400">µg/m³ PM₂.₅</span>
            </p>
          </div>
          <p className="text-[11px] text-slate-600">
            Regional model estimate represents regional atmospheric conditions. Fire detections and modeled smoke trajectories reflect possible atmospheric transport and do not establish direct source contribution or localized street-level microclimates.
          </p>
        </footer>
      </div>
    </main>
  );
}
