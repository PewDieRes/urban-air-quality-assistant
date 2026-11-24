"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { LocationPicker } from "@/components/location/location-picker";
import { ForecastSummary } from "@/components/forecast/forecast-summary";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import { AirQualityView } from "@/components/map/air-quality-view";
import { PlanPanel } from "@/components/plan/plan-panel";
import { Place, DEFAULT_PLACE, TOKYO_PLACE } from "@/lib/location/search";
import { Forecast, AirSample } from "@/lib/forecast/types";
import { Wind, Map as MapIcon, ArrowDown } from "lucide-react";

export default function HomePage() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(DEFAULT_PLACE);
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>({
    lat: DEFAULT_PLACE.lat,
    lon: DEFAULT_PLACE.lon,
  });

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState<boolean>(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [selectedInstant, setSelectedInstant] = useState<string | null>(null);

  const planRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const fetchForecast = useCallback(async () => {
    setIsLoadingForecast(true);
    setForecastError(null);
    try {
      const res = await fetch(`/api/forecast?lat=${coordinates.lat}&lon=${coordinates.lon}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to retrieve forecast data");
      }
      const data = await res.json();
      setForecast(data.forecast);
    } catch (err: unknown) {
      setForecastError(err instanceof Error ? err.message : "Unable to load forecast");
    } finally {
      setIsLoadingForecast(false);
    }
  }, [coordinates.lat, coordinates.lon]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const handleSelectLocation = (place: Place | null, coords: { lat: number; lon: number }) => {
    if (coords.lat !== coordinates.lat || coords.lon !== coordinates.lon) {
      setForecast(null);
    }
    setSelectedPlace(place);
    setCoordinates(coords);
    setSelectedInstant(null);
  };

  const handleSelectHour = (sample: AirSample) => {
    setSelectedInstant(sample.at);
  };

  const handleScrollToPlan = () => {
    planRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScrollToMap = () => {
    mapRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const locationName = selectedPlace ? selectedPlace.name : "Selected Location";

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-stone-900 pb-16">
      {/* Compact Quiet Public-Service Header */}
      <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Project Title & Navigation Shortcut */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-800 text-white flex items-center justify-center shrink-0">
              <Wind className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-stone-900 leading-none">
                  Urban Air Quality Assistant
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200/60 hidden sm:inline-block">
                  Challenge 6
                </span>
              </div>
              <p className="text-[11px] text-stone-500 leading-tight mt-0.5">
                Smog planning &amp; regional atmospheric forecast
              </p>
            </div>
          </div>

          {/* Unified City Selector (Active City, Search, Near Me, Delhi-NCR, Tokyo) */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <LocationPicker
              selectedPlace={selectedPlace}
              coordinates={coordinates}
              onSelectLocation={handleSelectLocation}
            />

            <button
              type="button"
              onClick={handleScrollToMap}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 transition shrink-0"
              title="Jump to regional 2D/3D map"
            >
              <MapIcon className="w-3.5 h-3.5 text-teal-700" />
              <span>Explore map</span>
              <ArrowDown className="w-3 h-3 text-stone-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/*
          FIRST SCREEN: Designed around the decision
          Desktop: Two columns (Left: Air today + 24-hr chart; Right: Plan my day)
          Mobile: Compact air-quality summary -> Planner -> Detailed forecast chart
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Desktop Left Column: City Air Quality Today */}
          <div className="order-1 lg:order-1 lg:col-span-6 flex flex-col gap-6">
            <ForecastSummary
              forecast={forecast}
              locationName={locationName}
              isLoading={isLoadingForecast}
              error={forecastError}
              onRefresh={fetchForecast}
              onExploreMap={handleScrollToMap}
            />

            {/* 24-Hour PM2.5 Chart on Desktop */}
            <div className="hidden lg:block">
              <ForecastChart
                forecast={forecast}
                selectedInstant={selectedInstant}
                onSelectHour={handleSelectHour}
              />
            </div>
          </div>

          {/* Desktop Right Column, Mobile Second Row: Plan My Day */}
          <div
            className="order-2 lg:order-2 lg:col-span-6"
            ref={planRef}
            id="household-plan-section"
          >
            <PlanPanel
              key={`${coordinates.lat},${coordinates.lon}`}
              forecast={forecast}
              locationName={locationName}
              lat={coordinates.lat}
              lon={coordinates.lon}
            />
          </div>

          {/* Mobile Only Third Row: 24-Hour PM2.5 Chart */}
          <div className="order-3 lg:hidden">
            <ForecastChart
              forecast={forecast}
              selectedInstant={selectedInstant}
              onSelectHour={handleSelectHour}
            />
          </div>
        </div>

        {/*
          DEDICATED SECTION: "Explore the map"
          Contains 2D MapLibre map, Immersive 3D Smog Viewer, timeline, and smoke trajectories.
          Carries selected city, coordinates, forecast, and hour.
        */}
        <section
          ref={mapRef}
          id="explore-map-section"
          aria-label="Explore the map"
          className="pt-4 border-t border-stone-200/80 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                  Regional view
                </span>
                <span className="text-xs text-stone-500 font-mono">
                  {locationName} · {coordinates.lat.toFixed(2)}°, {coordinates.lon.toFixed(2)}°
                </span>
              </div>
              <h2 className="text-lg font-bold text-stone-900 mt-0.5">
                Explore the regional map
              </h2>
              <p className="text-xs text-stone-500">
                Inspect spatial PM₂.₅ concentration contours, active NASA FIRMS fire detections, and 3D city scene.
              </p>
            </div>

            <button
              type="button"
              onClick={handleScrollToPlan}
              className="text-xs text-teal-800 hover:text-teal-950 font-medium px-2.5 py-1 rounded-lg border border-teal-200 bg-teal-50/50 hover:bg-teal-50 transition"
            >
              ↑ Back to planner
            </button>
          </div>

          <AirQualityView
            center={coordinates}
            placeLabel={locationName}
            forecast={forecast}
            selectedInstant={selectedInstant}
            onSelectInstant={(instant) => setSelectedInstant(instant)}
            onSelectCoordinate={(coords) => {
              const customPlace: Place = {
                id: `loc-${coords.lat.toFixed(4)}-${coords.lon.toFixed(4)}`,
                name: "Selected Location",
                region: `${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}°`,
                country: "",
                lat: coords.lat,
                lon: coords.lon,
                timeZone: forecast?.timeZone || "UTC",
              };
              handleSelectLocation(customPlace, coords);

              fetch(`/api/locations/reverse?lat=${coords.lat}&lon=${coords.lon}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                  if (data?.place) {
                    setSelectedPlace(data.place);
                  }
                })
                .catch(() => {});
            }}
            onBuildPlan={handleScrollToPlan}
          />
        </section>

        {/* Data Attribution & Disclaimers Footer */}
        <footer className="border-t border-stone-200 pt-6 mt-12 text-xs text-stone-500 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>
              Data sources: <strong className="text-stone-700">Open-Meteo</strong> (Copernicus CAMS atmospheric model),{" "}
              <strong className="text-stone-700">OpenFreeMap</strong> (vector basemaps),{" "}
              <strong className="text-stone-700">NASA FIRMS</strong> (MODIS / VIIRS active fires),{" "}
              <strong className="text-stone-700">NOAA HYSPLIT</strong> (atmospheric trajectory model).
            </p>
            <p className="font-mono">
              Scale: <span className="text-stone-700">US AQI</span> · Units: <span className="text-stone-700">µg/m³ PM₂.₅</span>
            </p>
          </div>
          <p className="text-[11px] text-stone-500 leading-relaxed">
            Regional model estimate represents regional atmospheric conditions. Fire detections and modeled smoke trajectories reflect possible atmospheric transport and do not establish direct source contribution or localized street-level microclimates.
          </p>
        </footer>
      </div>
    </main>
  );
}
