import { PlanFacts } from "./types";
import { formatHourlyTime } from "../forecast/open-meteo";

export interface PlanDecision {
  headline: string;
  explanation: string;
}

/**
 * Pure, deterministic function deriving the primary decision headline and explanation
 * from verified plan facts.
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
        ? `${firstCommitment.title} stays at ${formatHourlyTime(firstCommitment.start, timeZone).replace(":00 ", " ")}. No available hour in your requested window fits your activity around it. Try widening your time window.`
        : `No available hour in your requested window fits your activity duration. Try widening your time window.`,
    };
  }

  const bestTime = formatHourlyTime(primaryAct.bestCandidate.at, timeZone);
  const cleanBestTime = bestTime.replace(":00 ", " ");
  const bestPm = primaryAct.bestCandidate.pm25 !== null ? Math.round(primaryAct.bestCandidate.pm25) : null;
  const pickupTime = firstCommitment ? formatHourlyTime(firstCommitment.start, timeZone).replace(":00 ", " ") : "";
  const pickupStay = firstCommitment
    ? `${firstCommitment.title} stays at ${pickupTime}. `
    : "";
  const isGrocery = /grocer/i.test(primaryAct.title);
  const actLabel = isGrocery ? "grocery trip" : primaryAct.title.toLowerCase();
  const durationLabel = primaryAct.durationMinutes === 60 ? "one-hour" : `${primaryAct.durationMinutes}-minute`;

  // Earliest eligible hour was already best
  if (primaryAct.isEarliestAlreadyBest) {
    const headline = isGrocery
      ? `Keep your original time: Buy groceries at ${cleanBestTime}`
      : `Keep your original time: ${cleanBestTime}`;
    return {
      headline,
      explanation: `${pickupStay}For your ${durationLabel} ${actLabel}, the earliest slot at ${cleanBestTime} already offers the lowest forecast pollution (${bestPm} µg/m³).`,
    };
  }

  // Two hours tied
  if (primaryAct.tiedCandidates && primaryAct.tiedCandidates.length > 0) {
    const tiedTime = formatHourlyTime(primaryAct.tiedCandidates[0].at, timeZone).replace(":00 ", " ");
    const headline = isGrocery
      ? `Buy groceries at ${cleanBestTime}`
      : `${primaryAct.title} at ${cleanBestTime}`;
    return {
      headline,
      explanation: `${pickupStay}Both ${cleanBestTime} and ${tiedTime} have the same lowest forecast PM₂.₅ (${bestPm} µg/m³).`,
    };
  }

  // Rescheduled to lower-pollution hour
  if (facts.beforeAfterComparison) {
    const baselineTime = formatHourlyTime(facts.beforeAfterComparison.baselineTime, timeZone).replace(":00 ", " ");
    const baselinePm = facts.beforeAfterComparison.baselinePm25 !== null
      ? Math.round(facts.beforeAfterComparison.baselinePm25)
      : null;
    const reduction = facts.beforeAfterComparison.exposureReductionPercent;
    const headline = isGrocery
      ? `Buy groceries at ${cleanBestTime}`
      : `${primaryAct.title} at ${cleanBestTime}`;
    return {
      headline,
      explanation: `${pickupStay}For your ${durationLabel} ${actLabel}, the forecast is ${bestPm} µg/m³ at ${cleanBestTime}, compared with ${baselinePm} µg/m³ at ${baselineTime} (${reduction}% lower forecast PM₂.₅).`,
    };
  }

  const headline = isGrocery
    ? `Buy groceries at ${cleanBestTime}`
    : `${primaryAct.title} at ${cleanBestTime}`;
  return {
    headline,
    explanation: `${pickupStay}Forecast PM₂.₅ is ${bestPm} µg/m³ at ${cleanBestTime}, fitting within your schedule.`,
  };
}
