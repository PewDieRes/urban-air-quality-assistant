import React from "react";
import { Home } from "lucide-react";
import { TransportMode } from "@/lib/plan/types";
import { BudgetTier, PlanPreferencesState } from "@/hooks/use-plan-preferences";

const ALTERNATIVE_MODE_OPTIONS: readonly TransportMode[] = ["transit", "walk", "bike", "ev"];

interface HouseholdTransportSettingsProps {
  preferences: PlanPreferencesState;
}

/**
 * Collapsible household health, budget, and transport inputs disclosure panel.
 */
export function HouseholdTransportSettings({ preferences }: HouseholdTransportSettingsProps) {
  const {
    transportMode,
    setTransportMode,
    distanceKm,
    setDistanceKm,
    carpoolOccupancy,
    setCarpoolOccupancy,
    avoidedVehicleKm,
    setAvoidedVehicleKm,
    availableModes,
    toggleAvailableMode,
    sensitiveMembers,
    setSensitiveMembers,
    hasAirPurifier,
    setHasAirPurifier,
    budgetLevel,
    setBudgetLevel,
  } = preferences;

  return (
    <details className="border border-stone-200 rounded-xl p-3 bg-white text-xs group">
      <summary className="cursor-pointer font-medium text-stone-700 flex items-center justify-between select-none">
        <span className="flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5 text-stone-500" />
          Optional household, budget &amp; transport settings
        </span>
        <span className="text-stone-600 text-[11px] group-open:rotate-180 transition-transform">
          ▼
        </span>
      </summary>

      <div className="pt-3 mt-3 border-t border-stone-100 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="primary-transport-mode" className="block text-stone-600 mb-1 font-medium">
              Primary Travel Mode
            </label>
            <select
              id="primary-transport-mode"
              value={transportMode}
              onChange={(event) => setTransportMode(event.target.value as TransportMode)}
              className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
            >
              <option value="car">Gasoline / Diesel Car</option>
              <option value="transit">Public Transit / Metro</option>
              <option value="ev">Electric Vehicle (EV)</option>
              <option value="walk">Walking</option>
              <option value="bike">Bicycle</option>
              <option value="none">No Travel Needed</option>
            </select>
          </div>

          <div>
            <label htmlFor="trip-distance-km" className="block text-stone-600 mb-1 font-medium">
              Trip Distance (km, for emissions estimate)
            </label>
            <input
              id="trip-distance-km"
              type="number"
              min="0"
              max="150"
              step="0.5"
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
              placeholder="e.g. 8"
              className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
            />
          </div>
        </div>

        {transportMode === "car" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="carpool-occupancy" className="block text-stone-600 mb-1 font-medium">
                Carpool Occupants (optional, ≥ 2)
              </label>
              <input
                id="carpool-occupancy"
                type="number"
                min="1"
                max="10"
                step="1"
                value={carpoolOccupancy}
                onChange={(event) => setCarpoolOccupancy(event.target.value)}
                placeholder="e.g. 2"
                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
              />
            </div>
            <div>
              <label htmlFor="avoided-vehicle-km" className="block text-stone-600 mb-1 font-medium">
                Avoided Driving Distance (km, optional)
              </label>
              <input
                id="avoided-vehicle-km"
                type="number"
                min="0"
                max="150"
                step="0.5"
                value={avoidedVehicleKm}
                onChange={(event) => setAvoidedVehicleKm(event.target.value)}
                placeholder="e.g. 4"
                className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
              />
            </div>
          </div>
        )}

        <div>
          <span className="block text-stone-600 mb-1.5 font-medium">
            Available transport alternatives
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            {ALTERNATIVE_MODE_OPTIONS.map((mode) => (
              <label
                key={mode}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-50 border border-stone-200 cursor-pointer text-stone-700"
              >
                <input
                  type="checkbox"
                  checked={availableModes.includes(mode)}
                  onChange={() => toggleAvailableMode(mode)}
                  className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5"
                />
                <span className="capitalize">{mode === "transit" ? "Public Transit" : mode}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sensitiveMembers}
                onChange={(event) => setSensitiveMembers(event.target.checked)}
                className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5"
              />
              <span>Sensitive members (children, asthmatics)</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAirPurifier}
                onChange={(event) => setHasAirPurifier(event.target.checked)}
                className="rounded border-stone-300 text-teal-700 w-3.5 h-3.5"
              />
              <span>Equipped with particle filter (HEPA)</span>
            </label>
          </div>

          <div>
            <label htmlFor="budget-level-select" className="block text-stone-600 mb-1 font-medium">
              Indoor Protection Budget
            </label>
            <select
              id="budget-level-select"
              value={budgetLevel}
              onChange={(event) => setBudgetLevel(event.target.value as BudgetTier)}
              className="w-full bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs text-stone-900"
            >
              <option value="low">Low budget (Damp cleaning, draught sealing)</option>
              <option value="medium">Medium budget (Portable filter)</option>
              <option value="high">High budget (Multi-room HEPA)</option>
            </select>
          </div>
        </div>
      </div>
    </details>
  );
}
