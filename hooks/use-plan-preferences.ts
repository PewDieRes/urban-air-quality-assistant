import { useEffect, useMemo, useState } from "react";
import { TransportMode } from "@/lib/plan/types";

const PREFERENCES_STORAGE_KEY = "uaqa_household_prefs";

export type BudgetTier = "low" | "medium" | "high";

interface StoredPreferences {
  transportMode?: TransportMode;
  distanceKm?: string | number;
  carpoolOccupancy?: string | number;
  avoidedVehicleKm?: string | number;
  availableModes?: TransportMode[];
  sensitiveMembers?: boolean;
  hasAirPurifier?: boolean;
  budgetLevel?: BudgetTier;
}

export interface PlanPreferencesState {
  transportMode: TransportMode;
  setTransportMode: (mode: TransportMode) => void;
  distanceKm: string;
  setDistanceKm: (value: string) => void;
  carpoolOccupancy: string;
  setCarpoolOccupancy: (value: string) => void;
  avoidedVehicleKm: string;
  setAvoidedVehicleKm: (value: string) => void;
  availableModes: TransportMode[];
  toggleAvailableMode: (mode: TransportMode) => void;
  sensitiveMembers: boolean;
  setSensitiveMembers: (checked: boolean) => void;
  hasAirPurifier: boolean;
  setHasAirPurifier: (checked: boolean) => void;
  budgetLevel: BudgetTier;
  setBudgetLevel: (level: BudgetTier) => void;
  savePreferences: () => void;
  defaultTransportAdvice: string;
}

/**
 * Manages persisted household, budget, and transport preferences in localStorage.
 */
export function usePlanPreferences(): PlanPreferencesState {
  const [transportMode, setTransportMode] = useState<TransportMode>("car");
  const [distanceKm, setDistanceKm] = useState<string>("8");
  const [carpoolOccupancy, setCarpoolOccupancy] = useState<string>("");
  const [avoidedVehicleKm, setAvoidedVehicleKm] = useState<string>("");
  const [availableModes, setAvailableModes] = useState<TransportMode[]>([
    "car",
    "transit",
    "walk",
    "bike",
    "ev",
  ]);
  const [sensitiveMembers, setSensitiveMembers] = useState<boolean>(true);
  const [hasAirPurifier, setHasAirPurifier] = useState<boolean>(true);
  const [budgetLevel, setBudgetLevel] = useState<BudgetTier>("medium");

  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (!savedRaw) {
        return;
      }
      const parsed = JSON.parse(savedRaw) as StoredPreferences;
      if (parsed.transportMode) setTransportMode(parsed.transportMode);
      if (parsed.distanceKm !== undefined) setDistanceKm(String(parsed.distanceKm));
      if (parsed.carpoolOccupancy !== undefined) {
        setCarpoolOccupancy(String(parsed.carpoolOccupancy));
      }
      if (parsed.avoidedVehicleKm !== undefined) {
        setAvoidedVehicleKm(String(parsed.avoidedVehicleKm));
      }
      if (parsed.availableModes) setAvailableModes(parsed.availableModes);
      if (parsed.sensitiveMembers !== undefined) setSensitiveMembers(parsed.sensitiveMembers);
      if (parsed.hasAirPurifier !== undefined) setHasAirPurifier(parsed.hasAirPurifier);
      if (parsed.budgetLevel) setBudgetLevel(parsed.budgetLevel);
    } catch (storageError: unknown) {
      console.warn("Unable to restore saved planner preferences:", storageError);
    }
  }, []);

  const savePreferences = () => {
    try {
      const payload = {
        transportMode,
        distanceKm,
        carpoolOccupancy,
        avoidedVehicleKm,
        availableModes,
        sensitiveMembers,
        hasAirPurifier,
        budgetLevel,
      };
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
    } catch (storageError: unknown) {
      console.warn("Unable to save planner preferences:", storageError);
    }
  };

  const toggleAvailableMode = (mode: TransportMode) => {
    setAvailableModes((previousModes) =>
      previousModes.includes(mode)
        ? previousModes.filter((existing) => existing !== mode)
        : [...previousModes, mode]
    );
  };

  const defaultTransportAdvice = useMemo(() => {
    if (transportMode === "none") {
      return "No road travel needed; focus on indoor air protection during peak hours.";
    }
    if (availableModes.includes("transit")) {
      return "Consider public transit if a route serves your errand; enter trip distance (km) to estimate CO₂e difference.";
    }
    if (availableModes.includes("walk") || availableModes.includes("bike")) {
      return "Consider short-distance active travel only if safe for errand loads; higher exertion warrants a fitted N95 mask on smog days.";
    }
    if (availableModes.includes("ev")) {
      return "If driving an EV, use cabin air recirculation to reduce outdoor particle entry.";
    }
    return "No alternative travel modes selected. Quantified emissions estimates require trip distance and transit, carpool occupancy, or avoided vehicle-km inputs.";
  }, [availableModes, transportMode]);

  return {
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
    savePreferences,
    defaultTransportAdvice,
  };
}
