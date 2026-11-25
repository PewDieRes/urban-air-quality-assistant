"use client";

import React, { useRef } from "react";
import { ArrowDown, Map as MapIcon, Wind } from "lucide-react";
import { ForecastChart } from "@/components/forecast/forecast-chart";
import { ForecastSummary } from "@/components/forecast/forecast-summary";
import { AttributionFooter } from "@/components/layout/attribution-footer";
import { LocationPicker } from "@/components/location/location-picker";
import { AirQualityView } from "@/components/map/air-quality-view";
import { PlanPanel } from "@/components/plan/plan-panel";
import { useForecastLoader } from "@/hooks/use-forecast-loader";
import { AirSample } from "@/lib/forecast/types";
import { getPreferredScrollBehavior } from "@/lib/ui/scroll";

/**
 * Main Urban Air Quality Assistant page uniting forecast visualization,
 * household smog activity planning, and regional 2D/3D atmospheric mapping.
 */
export default function HomePage() {
  const planSectionRef = useRef<HTMLDivElement>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

  const {
    selectedPlace,
    coordinates,
    forecast,
    isLoadingForecast,
    forecastError,
    selectedInstant,
    setSelectedInstant,
    fetchForecast,
    selectLocation,
    selectMapCoordinate,
  } = useForecastLoader();

  const handleSelectHour = (sample: AirSample) => {
    setSelectedInstant(sample.at);
  };

  const scrollToPlan = () => {
    planSectionRef.current?.scrollIntoView({ behavior: getPreferredScrollBehavior() });
  };

  const scrollToMap = () => {
    mapSectionRef.current?.scrollIntoView({ behavior: getPreferredScrollBehavior() });
  };

  const locationName = selectedPlace ? selectedPlace.name : "Selected Location";

  return (
    <main className="min-h-screen bg-[#fbfaf8] text-stone-900 pb-16">
      <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex items-center gap-2 w-full md:w-auto">
            <LocationPicker
              selectedPlace={selectedPlace}
              coordinates={coordinates}
              onSelectLocation={selectLocation}
            />

            <button
              type="button"
              onClick={scrollToMap}
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

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="order-1 lg:order-1 lg:col-span-6 flex flex-col gap-6">
            <ForecastSummary
              forecast={forecast}
              locationName={locationName}
              isLoading={isLoadingForecast}
              error={forecastError}
              onRefresh={fetchForecast}
              onExploreMap={scrollToMap}
            />

            <div className="hidden lg:block">
              <ForecastChart
                forecast={forecast}
                selectedInstant={selectedInstant}
                onSelectHour={handleSelectHour}
              />
            </div>
          </div>

          <div
            className="order-2 lg:order-2 lg:col-span-6"
            ref={planSectionRef}
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

          <div className="order-3 lg:hidden">
            <ForecastChart
              forecast={forecast}
              selectedInstant={selectedInstant}
              onSelectHour={handleSelectHour}
            />
          </div>
        </div>

        <section
          ref={mapSectionRef}
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
              <h2 className="text-lg font-bold text-stone-900 mt-0.5">Explore the regional map</h2>
              <p className="text-xs text-stone-500">
                Inspect spatial PM₂.₅ concentration contours, active NASA FIRMS fire detections, and
                3D city scene.
              </p>
            </div>

            <button
              type="button"
              onClick={scrollToPlan}
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
            onSelectInstant={setSelectedInstant}
            onSelectCoordinate={selectMapCoordinate}
            onBuildPlan={scrollToPlan}
          />
        </section>

        <AttributionFooter />
      </div>
    </main>
  );
}
