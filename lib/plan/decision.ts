import { PlanFacts } from "./types";
import { formatHourlyTime } from "../forecast/open-meteo";
import { formatPm25Value } from "./facts";

export interface PlanDecision {
  headline: string;
  explanation: string;
}

/**
 * Pure, deterministic function deriving the primary decision headline and explanation
 * from verified plan facts using the duration-weighted mean forecast PM2.5 metric.
 */
export function derivePlanDecision(
  facts: PlanFacts | null | undefined,
  timeZone: string = "UTC"
): PlanDecision | null {
  if (!facts) return null;

  const primaryAct = facts.activities[0];
  const firstCommitment = facts.fixedCommitments[0];

  if (!primaryAct) {
    return {
      headline: "No activities scheduled",
      explanation: "Add a flexible activity to find the lowest-pollution hour.",
    };
  }

  if (!primaryAct.bestCandidate) {
    return {
      headline: `No eligible slot for ${primaryAct.title}`,
      explanation: firstCommitment
        ? `${firstCommitment.title} stays at ${formatHourlyTime(firstCommitment.start, timeZone).replace(":00 ", " ")}. No available slot with complete forecast coverage fits your activity around it. Try widening your time window.`
        : `No available slot with complete forecast coverage fits your activity duration. Try widening your time window.`,
    };
  }

  const bestTime = formatHourlyTime(primaryAct.bestCandidate.at, timeZone);
  const cleanBestTime = bestTime.replace(":00 ", " ");
  const rawMean = primaryAct.bestCandidate.durationMeanPm25 ?? primaryAct.bestCandidate.pm25;
  const bestPmStr = rawMean !== null && rawMean !== undefined ? formatPm25Value(rawMean) : null;
  const pickupTime = firstCommitment
    ? formatHourlyTime(firstCommitment.start, timeZone).replace(":00 ", " ")
    : "";
  const pickupStay = firstCommitment ? `${firstCommitment.title} stays at ${pickupTime}. ` : "";
  const isGrocery = /grocer/i.test(primaryAct.title);
  const actLabel = isGrocery ? "grocery trip" : primaryAct.title.toLowerCase();
  const durationLabel =
    primaryAct.durationMinutes === 60 ? "one-hour" : `${primaryAct.durationMinutes}-minute`;

  // Earliest eligible hour was already best (moving adds no benefit)
  if (primaryAct.isEarliestAlreadyBest) {
    const headline = isGrocery
      ? `Keep your original time: Buy groceries at ${cleanBestTime}`
      : `Keep your original time: ${cleanBestTime}`;
    return {
      headline,
      explanation: `${pickupStay}Moving your ${durationLabel} ${actLabel} adds no forecast benefit: the earliest slot at ${cleanBestTime} already has the lowest ${durationLabel} mean forecast PM₂.₅ (${bestPmStr} µg/m³).`,
    };
  }

  // Two later hours tied
  if (primaryAct.tiedCandidates && primaryAct.tiedCandidates.length > 0) {
    const tiedTime = formatHourlyTime(primaryAct.tiedCandidates[0].at, timeZone).replace(":00 ", " ");
    const headline = isGrocery
      ? `Buy groceries at ${cleanBestTime}`
      : `${primaryAct.title} at ${cleanBestTime}`;
    return {
      headline,
      explanation: `${pickupStay}Both ${cleanBestTime} and ${tiedTime} tie for the lowest ${durationLabel} mean forecast PM₂.₅ (${bestPmStr} µg/m³).`,
    };
  }

  // Rescheduled to lower-pollution window
  if (facts.beforeAfterComparison) {
    const baselineTime = formatHourlyTime(
      facts.beforeAfterComparison.baselineTime,
      timeZone
    ).replace(":00 ", " ");
    const rawBasePm = facts.beforeAfterComparison.baselinePm25;
    const baselinePmStr =
      rawBasePm !== null && rawBasePm !== undefined ? formatPm25Value(rawBasePm) : null;
    const reduction =
      facts.beforeAfterComparison.concentrationReductionPercent ??
      facts.beforeAfterComparison.exposureReductionPercent;
    const headline = isGrocery
      ? `Buy groceries at ${cleanBestTime}`
      : `${primaryAct.title} at ${cleanBestTime}`;

    if (reduction === 0) {
      return {
        headline,
        explanation: `${pickupStay}Across your ${durationLabel} ${actLabel} at ${cleanBestTime}, the ${durationLabel} mean forecast PM₂.₅ (${bestPmStr} µg/m³) is virtually unchanged from ${baselineTime} (${baselinePmStr} µg/m³), adding negligible forecast benefit.`,
      };
    }

    return {
      headline,
      explanation: `${pickupStay}For your ${durationLabel} ${actLabel}, the ${durationLabel} mean forecast PM₂.₅ is ${bestPmStr} µg/m³ at ${cleanBestTime}, vs ${baselinePmStr} µg/m³ at ${baselineTime} (${reduction}% lower outdoor forecast concentration; personal inhaled dose is not measured).`,
    };
  }

  const headline = isGrocery
    ? `Buy groceries at ${cleanBestTime}`
    : `${primaryAct.title} at ${cleanBestTime}`;
  return {
    headline,
    explanation: `${pickupStay}For your ${durationLabel} ${actLabel}, the ${durationLabel} mean forecast PM₂.₅ is ${bestPmStr} µg/m³ at ${cleanBestTime}.`,
  };
}
