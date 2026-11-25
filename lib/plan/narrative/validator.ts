import { formatHourlyTime } from "../../forecast/open-meteo";
import { formatPm25Value } from "../facts";
import { PlanFacts, PlanInput, PlanNarrative, PlanNarrativeItem } from "../types";
import {
  AllowedFactValues,
  assumesUnavailableAirPurifier,
  assumesUnavailablePublicTransit,
  assumesUnavailableTravelOption,
  collectAllowedFactValues,
  containsUnsupportedMeasurementOrTime,
} from "./grounding-checks";
import {
  PlanNarrativeSchema,
  REQUIRED_NARRATIVE_CATEGORIES,
  ValidationFailureReason,
  ValidationResult,
} from "./schema";

function validateSummaryGrounding(
  summaryText: string,
  allowedValues: AllowedFactValues,
  input?: PlanInput
): ValidationFailureReason | null {
  if (containsUnsupportedMeasurementOrTime(summaryText, "summary", allowedValues)) {
    return "unsupported_claim";
  }
  if (input?.household?.hasAirPurifier === false && assumesUnavailableAirPurifier(summaryText)) {
    return "unsupported_household_assumption";
  }
  if (
    input?.availableTransportModes !== undefined &&
    !input.availableTransportModes.includes("transit") &&
    input.transport?.mode !== "transit" &&
    assumesUnavailablePublicTransit(summaryText)
  ) {
    return "unsupported_transport_assumption";
  }
  return null;
}

function validateEvidenceAlignment(
  item: PlanNarrativeItem,
  validActivityIds: Set<string>,
  validFactIds: Set<string>,
  facts: PlanFacts
): ValidationFailureReason | null {
  if (!item.evidenceFactId) {
    return null;
  }
  if (!validFactIds.has(item.evidenceFactId)) {
    console.warn("Validation failed: invalid_fact_id reference");
    return "invalid_fact_id";
  }
  if (item.category === "indoor" || item.category === "transport") {
    return "mismatched_category_reference";
  }
  if (!validActivityIds.has(item.evidenceFactId)) {
    return "mismatched_category_reference";
  }
  if (
    item.category === "direct_impact" &&
    facts.beforeAfterComparison &&
    item.evidenceFactId !== facts.beforeAfterComparison.activityId
  ) {
    return "mismatched_category_reference";
  }
  return null;
}

function composeVerifiedRoutineItem(
  item: PlanNarrativeItem,
  facts: PlanFacts
): PlanNarrativeItem | null {
  if (item.category !== "routine" || !item.evidenceFactId) {
    return null;
  }
  const activityFact = facts.activities.find((activity) => activity.id === item.evidenceFactId);
  if (!activityFact?.bestCandidate) {
    return null;
  }

  const verifiedTime = formatHourlyTime(activityFact.bestCandidate.at, facts.locationTimezone);
  const meanValue = activityFact.bestCandidate.durationMeanPm25 ?? activityFact.bestCandidate.pm25;
  const verifiedPm =
    meanValue !== null && meanValue !== undefined
      ? `${formatPm25Value(meanValue)} µg/m³`
      : "unmeasured";

  return {
    ...item,
    action: `Conduct ${activityFact.title} at ${verifiedTime} (lower forecast PM₂.₅: ${verifiedPm})`,
    whyItHelps: activityFact.reason,
    beneficiary: item.beneficiary,
    impactType: item.impactType || "lower_exposure",
    evidenceFactId: item.evidenceFactId,
  };
}

function validateAndSanitizeItem(
  item: PlanNarrativeItem,
  facts: PlanFacts,
  allowedValues: AllowedFactValues,
  validActivityIds: Set<string>,
  validFactIds: Set<string>,
  input?: PlanInput
): { ok: true; item: PlanNarrativeItem } | { ok: false; reason: ValidationFailureReason } {
  const referenceFailure = validateEvidenceAlignment(item, validActivityIds, validFactIds, facts);
  if (referenceFailure) {
    return { ok: false, reason: referenceFailure };
  }

  const composedRoutineItem = composeVerifiedRoutineItem(item, facts);
  if (composedRoutineItem) {
    return { ok: true, item: composedRoutineItem };
  }

  if (
    containsUnsupportedMeasurementOrTime(item.action, item.category, allowedValues) ||
    containsUnsupportedMeasurementOrTime(item.whyItHelps, item.category, allowedValues)
  ) {
    return { ok: false, reason: "unsupported_claim" };
  }

  if (item.category === "indoor" && input?.household?.hasAirPurifier === false) {
    if (assumesUnavailableAirPurifier(item.action) || assumesUnavailableAirPurifier(item.whyItHelps)) {
      return { ok: false, reason: "unsupported_household_assumption" };
    }
  }

  if (item.category === "transport" && input) {
    const hasTransit =
      input.availableTransportModes === undefined
        ? true
        : input.availableTransportModes.includes("transit") || input.transport?.mode === "transit";

    if (
      (!hasTransit &&
        (assumesUnavailablePublicTransit(item.action) ||
          assumesUnavailablePublicTransit(item.whyItHelps))) ||
      assumesUnavailableTravelOption(item.action, input) ||
      assumesUnavailableTravelOption(item.whyItHelps, input)
    ) {
      return { ok: false, reason: "unsupported_transport_assumption" };
    }
  }

  if (item.category === "direct_impact" && item.evidenceFactId && facts.beforeAfterComparison) {
    return {
      ok: true,
      item: {
        ...item,
        whyItHelps: facts.beforeAfterComparison.justification,
      },
    };
  }

  return { ok: true, item };
}

/**
 * Validates generated JSON against schema, enforces category-appropriate fact references,
 * rejects ungrounded measurements or incompatible household/transport assumptions,
 * and composes verified schedule/metric facts in code.
 */
export function validatePlanNarrative(
  rawNarrative: unknown,
  facts: PlanFacts,
  input?: PlanInput
): ValidationResult {
  const parseResult = PlanNarrativeSchema.safeParse(rawNarrative);
  if (!parseResult.success) {
    return { success: false, reason: "invalid_structure" };
  }

  const categoriesPresent = new Set(parseResult.data.items.map((item) => item.category));
  for (const requiredCategory of REQUIRED_NARRATIVE_CATEGORIES) {
    if (!categoriesPresent.has(requiredCategory)) {
      return { success: false, reason: "missing_categories" };
    }
  }

  const allowedValues = collectAllowedFactValues(facts);
  const summaryFailure = validateSummaryGrounding(parseResult.data.summary, allowedValues, input);
  if (summaryFailure) {
    return { success: false, reason: summaryFailure };
  }

  const validActivityIds = new Set(facts.activities.map((activity) => activity.id));
  const validCommitmentIds = new Set(facts.fixedCommitments.map((commitment) => commitment.id));
  const validFactIds = new Set<string>([...validActivityIds, ...validCommitmentIds]);

  const sanitizedItems: PlanNarrativeItem[] = [];
  for (const item of parseResult.data.items) {
    const itemValidation = validateAndSanitizeItem(
      item,
      facts,
      allowedValues,
      validActivityIds,
      validFactIds,
      input
    );
    if (!itemValidation.ok) {
      return { success: false, reason: itemValidation.reason };
    }
    sanitizedItems.push(itemValidation.item);
  }

  return {
    success: true,
    narrative: {
      summary: parseResult.data.summary,
      items: sanitizedItems,
      cautionNotes: parseResult.data.cautionNotes,
    },
  };
}

/**
 * Backward-compatible wrapper returning PlanNarrative | null.
 */
export function validateAndSanitizePlanNarrative(
  rawNarrative: unknown,
  facts: PlanFacts,
  input?: PlanInput
): PlanNarrative | null {
  const validationResult = validatePlanNarrative(rawNarrative, facts, input);
  return validationResult.success ? validationResult.narrative : null;
}
