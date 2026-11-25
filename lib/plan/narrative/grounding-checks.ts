import { formatHourlyTime } from "../../forecast/open-meteo";
import { formatPm25Value } from "../facts";
import { PlanFacts, PlanInput } from "../types";
import { NarrativeCategory } from "./schema";

export type ValidationScope = NarrativeCategory | "summary";

export interface AllowedFactValues {
  pmStrings: Set<string>;
  aqiStrings: Set<string>;
  percentStrings: Set<string>;
  co2Strings: Set<string>;
  timeStrings: Set<string>;
}

function normalizeClockToken(timeLabel: string): string {
  return timeLabel.trim().toLowerCase().replace(":00 ", " ");
}

function registerPmValue(target: Set<string>, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return;
  }
  target.add(String(value));
  target.add(String(Math.round(value)));
  target.add(value.toFixed(1));
  target.add(formatPm25Value(value));
}

function registerLocalTime(target: Set<string>, isoInstant: string | undefined, timeZone: string): void {
  if (!isoInstant) {
    return;
  }
  const formatted = formatHourlyTime(isoInstant, timeZone);
  target.add(formatted.toLowerCase());
  target.add(normalizeClockToken(formatted));
}

/**
 * Collects all verified numbers and local clock times present in computed PlanFacts.
 */
export function collectAllowedFactValues(facts: PlanFacts): AllowedFactValues {
  const pmStrings = new Set<string>();
  const aqiStrings = new Set<string>();
  const percentStrings = new Set<string>();
  const co2Strings = new Set<string>();
  const timeStrings = new Set<string>();

  for (const commitment of facts.fixedCommitments) {
    registerLocalTime(timeStrings, commitment.start, facts.locationTimezone);
    registerLocalTime(timeStrings, commitment.end, facts.locationTimezone);
  }

  for (const activity of facts.activities) {
    if (activity.bestCandidate) {
      const candidate = activity.bestCandidate;
      registerPmValue(pmStrings, candidate.durationMeanPm25);
      registerPmValue(pmStrings, candidate.startHourPm25);
      registerPmValue(pmStrings, candidate.pm25);
      registerLocalTime(timeStrings, candidate.at, facts.locationTimezone);

      const activityEndIso = new Date(
        Date.parse(candidate.at) + (activity.durationMinutes || 60) * 60000
      ).toISOString();
      registerLocalTime(timeStrings, activityEndIso, facts.locationTimezone);

      if (candidate.durationMeanUsAqi !== null && candidate.durationMeanUsAqi !== undefined) {
        aqiStrings.add(String(candidate.durationMeanUsAqi));
      }
      if (candidate.usAqi !== null && candidate.usAqi !== undefined) {
        aqiStrings.add(String(candidate.usAqi));
      }
    }

    for (const candidate of activity.eligibleCandidates) {
      registerPmValue(pmStrings, candidate.durationMeanPm25);
      registerPmValue(pmStrings, candidate.startHourPm25);
      registerPmValue(pmStrings, candidate.pm25);
      registerLocalTime(timeStrings, candidate.at, facts.locationTimezone);
    }
  }

  if (facts.beforeAfterComparison) {
    const comparison = facts.beforeAfterComparison;
    registerPmValue(pmStrings, comparison.baselinePm25);
    registerPmValue(pmStrings, comparison.optimizedPm25);
    registerPmValue(pmStrings, comparison.baselineStartHourPm25);
    registerPmValue(pmStrings, comparison.optimizedStartHourPm25);
    registerLocalTime(timeStrings, comparison.baselineTime, facts.locationTimezone);
    registerLocalTime(timeStrings, comparison.optimizedTime, facts.locationTimezone);

    const reductionPercent =
      comparison.concentrationReductionPercent ?? comparison.exposureReductionPercent;
    if (reductionPercent !== null && reductionPercent !== undefined) {
      percentStrings.add(String(reductionPercent));
    }
  }

  const savedCo2 = facts.transportComparison?.estimatedCo2KgSaved;
  if (savedCo2 !== null && savedCo2 !== undefined && savedCo2 > 0) {
    co2Strings.add(String(savedCo2));
    co2Strings.add(savedCo2.toFixed(1));
    co2Strings.add(savedCo2.toFixed(2));
  }

  return { pmStrings, aqiStrings, percentStrings, co2Strings, timeStrings };
}

function hasUnsupportedPm25Concentration(
  text: string,
  scope: ValidationScope,
  allowedPmStrings: Set<string>
): boolean {
  const pmMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*(?:µg\/m³|ug\/m³|ug\/m3|µg\/m3|mcg\/m3)/gi);
  for (const match of pmMatches) {
    if (scope === "indoor" || !allowedPmStrings.has(match[1])) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedAqiScore(
  text: string,
  scope: ValidationScope,
  allowedAqiStrings: Set<string>
): boolean {
  const afterMatches = text.matchAll(/\b(?:us\s*)?aqi\s*(?:is|of|above|over|exceeds|:|=)?\s*(\d+)\b/gi);
  for (const match of afterMatches) {
    if (scope === "indoor" || !allowedAqiStrings.has(match[1])) {
      return true;
    }
  }
  const beforeMatches = text.matchAll(/\b(\d+)\s*(?:us\s*)?aqi\b/gi);
  for (const match of beforeMatches) {
    if (scope === "indoor" || !allowedAqiStrings.has(match[1])) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedCo2Savings(
  text: string,
  scope: ValidationScope,
  allowedCo2Strings: Set<string>
): boolean {
  const co2Matches = text.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:co2e?|co₂e?)/gi);
  for (const match of co2Matches) {
    if (scope === "indoor" || !allowedCo2Strings.has(match[1])) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedPercentage(
  text: string,
  scope: ValidationScope,
  allowedPercentStrings: Set<string>
): boolean {
  const percentMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
  for (const match of percentMatches) {
    if (scope === "indoor" || scope === "transport" || !allowedPercentStrings.has(match[1])) {
      return true;
    }
  }
  return false;
}

function hasUnsupportedClockTime(
  text: string,
  scope: ValidationScope,
  allowedTimeStrings: Set<string>
): boolean {
  const timeMatches = text.matchAll(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/gi);
  for (const match of timeMatches) {
    const normalized = normalizeClockToken(match[1]);
    if (scope === "indoor" || scope === "transport") {
      return true;
    }
    if (!allowedTimeStrings.has(normalized) && !allowedTimeStrings.has(match[1].toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether narrative text cites ungrounded concentrations, AQI scores, percentages, CO2 savings, or clock times.
 */
export function containsUnsupportedMeasurementOrTime(
  text: string,
  scope: ValidationScope,
  allowedValues: AllowedFactValues
): boolean {
  return (
    hasUnsupportedPm25Concentration(text, scope, allowedValues.pmStrings) ||
    hasUnsupportedAqiScore(text, scope, allowedValues.aqiStrings) ||
    hasUnsupportedCo2Savings(text, scope, allowedValues.co2Strings) ||
    hasUnsupportedPercentage(text, scope, allowedValues.percentStrings) ||
    hasUnsupportedClockTime(text, scope, allowedValues.timeStrings)
  );
}

/**
 * Detects instructions assuming the household owns an existing HEPA purifier.
 */
export function assumesUnavailableAirPurifier(text: string): boolean {
  const negatedContext =
    /\b(no|not|without|don't|do not|lack|missing)\s+(?:a\s+|an\s+|any\s+|mechanical\s+)?(?:hepa|air\s*purifier|particle\s*filter)/i;
  if (negatedContext.test(text) || /\bconsider\b|\bdiy\b|\bcorsi-rosenthal\b/i.test(text)) {
    return false;
  }
  const assumeUse =
    /\b(?:run|operate|turn on|keep|set|use)\s+(?:your\s+|the\s+|a\s+)?(?:bedroom\s+|living room\s+|portable\s+|existing\s+)?(?:hepa(?:\s+air)?\s*(?:purifier|filter|unit)?|air\s*purifier|particle\s*filter)\b/i;
  const assumePossession = /\byour\s+(?:hepa|air\s*purifier|particle\s*filter)\b/i;
  return assumeUse.test(text) || assumePossession.test(text);
}

/**
 * Detects instructions recommending public transit when public transit is not marked available.
 */
export function assumesUnavailablePublicTransit(text: string): boolean {
  const negatedTransit =
    /\b(no|without|unavailable|not available|lack)\s+(?:public\s+)?(?:transit|metro|bus|rail|subway|train)/i;
  if (negatedTransit.test(text)) {
    return false;
  }
  return /\b(public transit|transit rail|metro|subway|bus|commuter rail|train|tram|light rail)\b/i.test(
    text
  );
}

/**
 * Detects travel directives incompatible with mode="none" or empty alternative transport lists.
 */
export function assumesUnavailableTravelOption(text: string, input: PlanInput): boolean {
  const mode = input.transport?.mode;
  const availableModes = input.availableTransportModes;

  if (mode === "none") {
    const travelDirective =
      /\b(drive|driving|carpool|take the metro|public transit|switch commute|shift commute|bike|cycling|commute)\b/i;
    const negatedNoTravel =
      /\bno\s+(?:road\s+)?travel\b|\bwithout\s+(?:road\s+)?travel\b|\bno\s+commute\b/i;
    if (travelDirective.test(text) && !negatedNoTravel.test(text)) {
      return true;
    }
  }

  if (availableModes && availableModes.length === 0 && mode === "car") {
    const assumesOtherOption =
      /\b(carpool|share a ride|take transit|take the metro|public transit|switch to|use (?:ev|electric vehicle|public)|walk instead|bike instead|cycle instead)\b/i;
    if (assumesOtherOption.test(text)) {
      return true;
    }
  }

  return false;
}
