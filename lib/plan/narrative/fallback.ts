import { formatHourlyTime } from "../../forecast/open-meteo";
import { formatPm25Value } from "../facts";
import { PlanFacts, PlanInput, PlanNarrative, PlanNarrativeItem, TransportMode } from "../types";

const DEFAULT_AVAILABLE_MODES: readonly TransportMode[] = ["car", "transit", "walk", "bike", "ev"];

function buildFallbackRoutineItems(input: PlanInput, facts: PlanFacts): PlanNarrativeItem[] {
  const routineItems: PlanNarrativeItem[] = [];

  for (const activity of facts.activities) {
    if (!activity.bestCandidate) {
      continue;
    }
    const localTime = formatHourlyTime(activity.bestCandidate.at, facts.locationTimezone);
    const meanValue = activity.bestCandidate.durationMeanPm25 ?? activity.bestCandidate.pm25;
    const pmDisplay =
      meanValue !== null && meanValue !== undefined ? `${formatPm25Value(meanValue)} µg/m³` : "—";

    routineItems.push({
      id: `routine-${activity.id}`,
      category: "routine",
      action: `Conduct ${activity.title} at ${localTime} (lower forecast PM₂.₅: ${pmDisplay})`,
      whyItHelps: activity.reason,
      beneficiary: input.household?.sensitiveMembers
        ? "Vulnerable household members"
        : "General household",
      impactType: "lower_exposure",
      evidenceFactId: activity.id,
    });
  }

  if (routineItems.length === 0) {
    routineItems.push({
      id: "routine-default",
      category: "routine",
      action: "Review the forecast or widen your activity window",
      whyItHelps:
        "No eligible activity slot with complete forecast coverage was found in the current window.",
      beneficiary: "All household members",
      impactType: "lower_exposure",
    });
  }

  return routineItems;
}

function buildFallbackIndoorItem(input: PlanInput, facts: PlanFacts): PlanNarrativeItem {
  const primaryTip =
    facts.indoorRecommendations[0] ||
    "Keep windows sealed and use damp dusting during high forecast PM₂.₅ hours.";

  return {
    id: "indoor-rec",
    category: "indoor",
    action: primaryTip,
    whyItHelps: "Limits fine particulate matter (PM₂.₅) infiltration into indoor breathing zones.",
    beneficiary: input.household?.sensitiveMembers
      ? "Children, older adults, and individuals with asthma"
      : "All household occupants",
    impactType: "health_protection",
  };
}

function buildFallbackTransportItem(input: PlanInput, facts: PlanFacts): PlanNarrativeItem {
  const comparison = facts.transportComparison;
  if (comparison) {
    return {
      id: "transport-rec",
      category: "transport",
      action: comparison.action || `Consider ${comparison.suggestedMode}`,
      whyItHelps: comparison.explanation,
      beneficiary: comparison.beneficiary || "Household commuter",
      impactType:
        comparison.impactType === "lower_emissions" ? "lower_emissions" : "lower_exposure",
    };
  }

  const configuredModes =
    input.availableTransportModes !== undefined ? input.availableTransportModes : DEFAULT_AVAILABLE_MODES;
  const availableList: string[] = [...configuredModes];
  const hasTransit = availableList.includes("transit");
  const hasActive = availableList.includes("walk") || availableList.includes("bike");
  const hasElectricVehicle = availableList.includes("ev");

  let action = "Verify whether errands can share a trip without assuming alternative modes.";
  let whyItHelps =
    "Quantitative CO₂e savings are unavailable without trip distance and alternative mode or carpool inputs.";

  if (hasTransit) {
    action = "Consider public transit if a route serves your errand.";
    whyItHelps =
      "Quantitative CO₂e savings are unavailable without trip distance (km); shared transit avoids solo driving exhaust.";
  } else if (hasElectricVehicle) {
    action = "Use EV cabin air recirculation if driving an electric vehicle.";
    whyItHelps =
      "Helps reduce outdoor particle entry inside the cabin without assuming unavailable transit or emissions data.";
  } else if (hasActive) {
    action =
      "Consider short-distance active travel with a fitted N95 mask only if practical for your load.";
    whyItHelps =
      "Active travel emits zero exhaust, while higher breathing rates outdoors merit filtration on polluted days.";
  }

  return {
    id: "transport-rec",
    category: "transport",
    action,
    whyItHelps,
    beneficiary: "Household traveler",
    impactType: hasTransit ? "lower_emissions" : "health_protection",
  };
}

function buildFallbackImpactItem(facts: PlanFacts): PlanNarrativeItem {
  const comparison = facts.beforeAfterComparison;
  if (comparison) {
    return {
      id: "impact-rec",
      category: "direct_impact",
      action: `Reschedule ${comparison.activityTitle} from ${formatHourlyTime(
        comparison.baselineTime,
        facts.locationTimezone
      )} to ${formatHourlyTime(comparison.optimizedTime, facts.locationTimezone)}`,
      whyItHelps: comparison.justification,
      beneficiary: "Household respiratory health",
      impactType: "lower_exposure",
      evidenceFactId: comparison.activityId,
    };
  }

  return {
    id: "impact-rec",
    category: "direct_impact",
    action:
      "Keep the earliest schedule slot when moving adds no forecast PM₂.₅ benefit, and avoid strenuous exertion during peak hours",
    whyItHelps:
      "Heavy exertion raises deep-lung breathing volume during elevated ambient PM₂.₅ concentration.",
    beneficiary: "Household cardiopulmonary health",
    impactType: "lower_exposure",
  };
}

/**
 * Constructs a deterministic narrative strictly from verified planning facts.
 */
export function buildDeterministicNarrative(input: PlanInput, facts: PlanFacts): PlanNarrative {
  return {
    summary: `Verified activity schedule for ${facts.locationTimezone}: prioritizes hours with lower duration-weighted mean forecast PM₂.₅, preserves fixed commitments, and separates outdoor concentration from emissions estimates.`,
    items: [
      ...buildFallbackRoutineItems(input, facts),
      buildFallbackIndoorItem(input, facts),
      buildFallbackTransportItem(input, facts),
      buildFallbackImpactItem(facts),
    ],
    cautionNotes: [
      "Forecast PM₂.₅ concentrations can shift with local wind changes. Personal inhaled dose depends on exertion and indoor/cabin filtration.",
    ],
  };
}
