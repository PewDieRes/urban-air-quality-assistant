import { AirSample } from "../forecast/types";

export interface FlexibleActivity {
  id: string;
  title: string;
  windowStart: string; // ISO 8601 UTC
  windowEnd: string;   // ISO 8601 UTC
  durationMinutes: number;
}

export interface FixedCommitment {
  id: string;
  title: string;
  start: string; // ISO 8601 UTC
  end: string;   // ISO 8601 UTC
}

export type TransportMode = "car" | "transit" | "walk" | "bike" | "ev" | "none";

export interface TransportDetails {
  mode: TransportMode;
  distanceKm?: number;
  /** Explicit carpool occupants (>= 2) when sharing a vehicle trip */
  carpoolOccupancy?: number;
  /** Explicit avoided vehicle-km from eliminating or combining a trip */
  avoidedVehicleKm?: number;
}

export interface HouseholdDetails {
  sensitiveMembers?: boolean;
  hasAirPurifier?: boolean;
  indoorVentilation?: "closed" | "filtered" | "open";
}

export interface PlanInput {
  activities: FlexibleActivity[];
  fixedCommitments?: FixedCommitment[];
  transport?: TransportDetails;
  availableTransportModes?: TransportMode[];
  household?: HouseholdDetails;
  budget?: "low" | "medium" | "high";
}

export interface ActivityCandidate extends AirSample {
  /** Time-weighted mean forecast PM2.5 across the full activity duration (µg/m³) */
  durationMeanPm25: number;
  /** Forecast PM2.5 for the start hour interval only (µg/m³) */
  startHourPm25: number | null;
  /** Time-weighted mean US AQI across the activity duration */
  durationMeanUsAqi?: number | null;
  /** Explicit metric used to rank candidates */
  rankingMetric: "duration_weighted_mean_pm25";
}

export interface ActivityFacts {
  id: string;
  title: string;
  durationMinutes: number;
  eligibleCandidates: ActivityCandidate[];
  bestCandidate: ActivityCandidate | null;
  tiedCandidates?: ActivityCandidate[];
  isEarliestAlreadyBest?: boolean;
  reason: string;
}

export interface EmissionsFactorMetadata {
  publication: string;
  year: number;
  geography: string;
  baselineModeFactor: string;
  alternativeModeFactor: string;
  unit: "kg CO₂e/passenger-km" | "kg CO₂e/vehicle-km" | "kg CO₂e";
  occupancyAssumption: string;
  isOutsideReferenceGeography: boolean;
}

export interface TransportComparison {
  baselineMode: string;
  suggestedMode: string;
  distanceKm: number | null;
  estimatedCo2KgSaved: number | null;
  units: string | null;
  factorSource: string;
  assumptions: string;
  missingInputs?: string[];
  factorMetadata?: EmissionsFactorMetadata;
  isEstimate: boolean;
  impactType: "lower_exposure" | "lower_emissions" | "both" | "qualitative_guidance";
  action?: string;
  mechanism?: string;
  beneficiary?: string;
  explanation: string;
}

export interface BeforeAfterComparison {
  activityId: string;
  activityTitle: string;
  metric: "duration_weighted_mean_pm25";
  baselineTime: string;
  baselinePm25: number | null;
  baselineStartHourPm25?: number | null;
  optimizedTime: string;
  optimizedPm25: number | null;
  optimizedStartHourPm25?: number | null;
  concentrationReductionPercent: number | null;
  /** Alias preserved for compatibility; measures outdoor forecast PM2.5 concentration difference */
  exposureReductionPercent: number | null;
  justification: string;
}

export interface PlanFacts {
  fixedCommitments: FixedCommitment[];
  activities: ActivityFacts[];
  transportComparison: TransportComparison | null;
  beforeAfterComparison: BeforeAfterComparison | null;
  indoorRecommendations: string[];
  generatedAt: string;
  locationTimezone: string;
}

export interface PlanNarrativeItem {
  id: string;
  category: "routine" | "indoor" | "transport" | "direct_impact";
  action: string;
  whyItHelps: string;
  beneficiary: string;
  impactType: "lower_exposure" | "lower_emissions" | "health_protection";
  evidenceFactId?: string;
}

export interface PlanNarrative {
  summary: string;
  items: PlanNarrativeItem[];
  cautionNotes?: string[];
}
