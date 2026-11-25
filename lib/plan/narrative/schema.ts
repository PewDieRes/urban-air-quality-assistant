import { z } from "zod";
import { PlanNarrative } from "../types";

export type NarrativeCategory = "routine" | "indoor" | "transport" | "direct_impact";

export const NarrativeItemSchema = z.object({
  id: z.string(),
  category: z.enum(["routine", "indoor", "transport", "direct_impact"]),
  action: z.string().min(3),
  whyItHelps: z.string().min(3),
  beneficiary: z.string().min(2),
  impactType: z.enum(["lower_exposure", "lower_emissions", "health_protection"]),
  evidenceFactId: z.string().optional(),
});

export const PlanNarrativeSchema = z.object({
  summary: z.string().min(5),
  items: z.array(NarrativeItemSchema).min(1),
  cautionNotes: z.array(z.string()).optional(),
});

export type ValidationFailureReason =
  | "invalid_structure"
  | "missing_categories"
  | "invalid_fact_id"
  | "mismatched_category_reference"
  | "unsupported_claim"
  | "unsupported_household_assumption"
  | "unsupported_transport_assumption";

export type ValidationResult =
  | { success: true; narrative: PlanNarrative }
  | { success: false; reason: ValidationFailureReason };

export interface PlanGenerationResult {
  status: "gemini_generated" | "deterministic_fallback";
  modelUsed: string | null;
  narrative: PlanNarrative;
  fallbackReason?: "missing_key" | "provider_error" | "invalid_output" | ValidationFailureReason;
}

export const REQUIRED_NARRATIVE_CATEGORIES: readonly NarrativeCategory[] = [
  "routine",
  "indoor",
  "transport",
  "direct_impact",
];
