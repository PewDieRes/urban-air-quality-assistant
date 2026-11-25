import { Forecast } from "../../forecast/types";
import { EmissionsFactorMetadata } from "../types";

/**
 * UK Department for Energy Security and Net Zero (DESNZ) / DEFRA Conversion Factors (2024).
 */
export const UK_DESNZ_2024_FACTORS = {
  publication: "UK DESNZ / DEFRA Greenhouse Gas Reporting: Conversion Factors",
  shortSourceLabel: "UK DESNZ / DEFRA Greenhouse Gas Reporting Conversion Factors (2024)",
  year: 2024,
  carUnknownKgPerVehicleKm: 0.16725,
  nationalRailKgPerPassengerKm: 0.03549,
  localBusKgPerPassengerKm: 0.10215,
} as const;

export interface FactorGeographyDescriptor {
  geography: string;
  isOutsideReferenceGeography: boolean;
}

/**
 * Determines whether the forecast location falls within UK reference factor boundaries.
 */
export function describeFactorGeography(forecast: Forecast): FactorGeographyDescriptor {
  const isUnitedKingdom =
    forecast.timeZone === "Europe/London" ||
    (forecast.lat >= 49.5 && forecast.lat <= 61 && forecast.lon >= -8.5 && forecast.lon <= 2);

  return {
    geography: isUnitedKingdom
      ? "United Kingdom"
      : "United Kingdom reference factor (applied outside UK; regional vehicle fleets differ)",
    isOutsideReferenceGeography: !isUnitedKingdom,
  };
}

/**
 * Builds structured DESNZ conversion factor metadata using a shared publication header.
 */
export function buildDesnzFactorMetadata(params: {
  geographyDescriptor: FactorGeographyDescriptor;
  baselineModeFactor: string;
  alternativeModeFactor: string;
  unit: EmissionsFactorMetadata["unit"];
  occupancyAssumption: string;
}): EmissionsFactorMetadata {
  return {
    publication: UK_DESNZ_2024_FACTORS.publication,
    year: UK_DESNZ_2024_FACTORS.year,
    geography: params.geographyDescriptor.geography,
    baselineModeFactor: params.baselineModeFactor,
    alternativeModeFactor: params.alternativeModeFactor,
    unit: params.unit,
    occupancyAssumption: params.occupancyAssumption,
    isOutsideReferenceGeography: params.geographyDescriptor.isOutsideReferenceGeography,
  };
}
