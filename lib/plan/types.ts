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
  household?: HouseholdDetails;
  budget?: "low" | "medium" | "high";
}

export interface ActivityFacts {
  id: string;
  title: string;
  eligibleCandidates: AirSample[];
  bestCandidate: AirSample | null;
  reason: string;
}

export interface TransportComparison {
  baselineMode: string;
  suggestedMode: string;
  estimatedCo2KgSaved: number | null;
  explanation: string;
}

export interface PlanFacts {
  fixedCommitments: FixedCommitment[];
  activities: ActivityFacts[];
  transportComparison: TransportComparison | null;
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
