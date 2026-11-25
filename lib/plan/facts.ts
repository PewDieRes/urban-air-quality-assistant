import { formatHourlyTime } from "../forecast/open-meteo";
import { AirSample, Forecast } from "../forecast/types";
import { computeTransportComparison } from "./transport/comparison";
import {
  ActivityCandidate,
  ActivityFacts,
  BeforeAfterComparison,
  FixedCommitment,
  FlexibleActivity,
  PlanFacts,
  PlanInput,
} from "./types";

export { computeTransportComparison } from "./transport/comparison";

const HOUR_IN_MILLISECONDS = 3600_000;
const MINUTE_IN_MILLISECONDS = 60_000;
const PM25_TIE_EPSILON = 1e-6;

interface DurationCoverageMetrics {
  durationMeanPm25: number;
  startHourPm25: number | null;
  durationMeanUsAqi: number | null;
}

interface ScheduledInterval {
  startMs: number;
  endMs: number;
}

/**
 * Formats PM2.5 concisely: integer when whole, 1 decimal place when fractional.
 */
export function formatPm25Value(concentration: number): string {
  const roundedOneDecimal = Math.round(concentration * 10) / 10;
  return Number.isInteger(roundedOneDecimal)
    ? String(roundedOneDecimal)
    : roundedOneDecimal.toFixed(1);
}

/**
 * Checks whether two time intervals [firstStartMs, firstEndMs] and [secondStartMs, secondEndMs] overlap.
 */
function doTimeIntervalsOverlap(
  firstStartMs: number,
  firstEndMs: number,
  secondStartMs: number,
  secondEndMs: number
): boolean {
  return firstStartMs < secondEndMs && firstEndMs > secondStartMs;
}

/**
 * Computes time-weighted mean forecast PM2.5 across the full [candidateStartMs, candidateStartMs + durationMs) interval
 * using overlapping hourly forecast slots [slotStartMs, slotStartMs + 1h).
 * Returns null if any overlapping portion has missing or non-finite forecast coverage.
 */
function computeDurationCoverageMetrics(
  candidateStartMs: number,
  durationMilliseconds: number,
  hourlySamples: AirSample[]
): DurationCoverageMetrics | null {
  if (durationMilliseconds <= 0) {
    return null;
  }

  const candidateEndMs = candidateStartMs + durationMilliseconds;
  let coveredPmMilliseconds = 0;
  let weightedPmSum = 0;
  let coveredAqiMilliseconds = 0;
  let weightedAqiSum = 0;
  let startHourPm25: number | null = null;
  const seenHourStarts = new Set<number>();

  for (const sample of hourlySamples) {
    const slotStartMs = Date.parse(sample.at);
    if (!Number.isFinite(slotStartMs) || seenHourStarts.has(slotStartMs)) {
      continue;
    }
    seenHourStarts.add(slotStartMs);

    const overlapStartMs = Math.max(candidateStartMs, slotStartMs);
    const overlapEndMs = Math.min(candidateEndMs, slotStartMs + HOUR_IN_MILLISECONDS);
    if (overlapEndMs <= overlapStartMs) {
      continue;
    }

    if (sample.pm25 === null || !Number.isFinite(sample.pm25)) {
      return null;
    }

    const overlapMs = overlapEndMs - overlapStartMs;
    coveredPmMilliseconds += overlapMs;
    weightedPmSum += sample.pm25 * overlapMs;

    if (slotStartMs === candidateStartMs) {
      startHourPm25 = sample.pm25;
    }

    if (sample.usAqi !== null && Number.isFinite(sample.usAqi)) {
      coveredAqiMilliseconds += overlapMs;
      weightedAqiSum += sample.usAqi * overlapMs;
    }
  }

  if (coveredPmMilliseconds < durationMilliseconds - 1) {
    return null;
  }

  return {
    durationMeanPm25: Number((weightedPmSum / coveredPmMilliseconds).toFixed(4)),
    startHourPm25,
    durationMeanUsAqi:
      coveredAqiMilliseconds >= durationMilliseconds - 1
        ? Math.round(weightedAqiSum / coveredAqiMilliseconds)
        : null,
  };
}

function collectEligibleActivityCandidates(
  activity: FlexibleActivity,
  hourlySamples: AirSample[],
  fixedCommitments: FixedCommitment[],
  scheduledIntervals: ScheduledInterval[],
  durationMilliseconds: number
): ActivityCandidate[] {
  const windowStartMs = new Date(activity.windowStart).getTime();
  const windowEndMs = new Date(activity.windowEnd).getTime();

  const samplesInsideWindow = hourlySamples.filter((sample) => {
    const sampleStartMs = new Date(sample.at).getTime();
    return sampleStartMs >= windowStartMs && sampleStartMs + durationMilliseconds <= windowEndMs;
  });

  const eligibleCandidates: ActivityCandidate[] = [];

  for (const sample of samplesInsideWindow) {
    const candidateStartMs = new Date(sample.at).getTime();
    const candidateEndMs = candidateStartMs + durationMilliseconds;

    const coverageMetrics = computeDurationCoverageMetrics(
      candidateStartMs,
      durationMilliseconds,
      hourlySamples
    );
    if (!coverageMetrics) {
      continue;
    }

    const conflictsWithCommitment = fixedCommitments.some((commitment) =>
      doTimeIntervalsOverlap(
        candidateStartMs,
        candidateEndMs,
        new Date(commitment.start).getTime(),
        new Date(commitment.end).getTime()
      )
    );
    const conflictsWithScheduledActivity = scheduledIntervals.some((slot) =>
      doTimeIntervalsOverlap(candidateStartMs, candidateEndMs, slot.startMs, slot.endMs)
    );

    if (!conflictsWithCommitment && !conflictsWithScheduledActivity) {
      eligibleCandidates.push({
        at: sample.at,
        pm25: sample.pm25,
        usAqi: sample.usAqi,
        durationMeanPm25: coverageMetrics.durationMeanPm25,
        startHourPm25: coverageMetrics.startHourPm25,
        durationMeanUsAqi: coverageMetrics.durationMeanUsAqi,
        rankingMetric: "duration_weighted_mean_pm25",
      });
    }
  }

  return eligibleCandidates;
}

function selectOptimalActivitySchedule(
  activity: FlexibleActivity,
  eligibleCandidates: ActivityCandidate[],
  durationMinutes: number,
  durationMilliseconds: number,
  timeZone: string,
  scheduledIntervals: ScheduledInterval[]
): ActivityFacts {
  if (eligibleCandidates.length === 0) {
    return {
      id: activity.id,
      title: activity.title,
      durationMinutes,
      eligibleCandidates: [],
      bestCandidate: null,
      reason:
        "Unscheduled. No candidate with complete forecast coverage fits the full activity duration around your other commitments.",
    };
  }

  const rankedCandidates = [...eligibleCandidates].sort((first, second) => {
    const pmDifference = first.durationMeanPm25 - second.durationMeanPm25;
    if (Math.abs(pmDifference) > PM25_TIE_EPSILON) {
      return pmDifference;
    }
    return new Date(first.at).getTime() - new Date(second.at).getTime();
  });

  const bestCandidate = rankedCandidates[0];
  const tiedCandidates = eligibleCandidates.filter(
    (candidate) =>
      candidate.at !== bestCandidate.at &&
      Math.abs(candidate.durationMeanPm25 - bestCandidate.durationMeanPm25) <= PM25_TIE_EPSILON
  );
  const isEarliestAlreadyBest = eligibleCandidates[0].at === bestCandidate.at;

  const chosenStartMs = Date.parse(bestCandidate.at);
  scheduledIntervals.push({ startMs: chosenStartMs, endMs: chosenStartMs + durationMilliseconds });

  const localSlotTime = formatHourlyTime(bestCandidate.at, timeZone);
  const formattedMeanPm25 = formatPm25Value(bestCandidate.durationMeanPm25);
  const aqiSuffix =
    bestCandidate.durationMeanUsAqi !== null && bestCandidate.durationMeanUsAqi !== undefined
      ? `, US AQI: ${bestCandidate.durationMeanUsAqi}`
      : "";
  const tiePhrase =
    tiedCandidates.length > 0
      ? ` (ties with ${tiedCandidates
          .map((candidate) => formatHourlyTime(candidate.at, timeZone))
          .join(", ")})`
      : "";

  const reason = `Available slot at ${localSlotTime} with lower forecast PM₂.₅ (${formattedMeanPm25} µg/m³ ${durationMinutes}-min mean${aqiSuffix})${tiePhrase}, fitting completely within forecast coverage and avoiding fixed commitments.`;

  return {
    id: activity.id,
    title: activity.title,
    durationMinutes,
    eligibleCandidates,
    bestCandidate,
    tiedCandidates,
    isEarliestAlreadyBest,
    reason,
  };
}

function buildBeforeAfterComparison(
  primaryActivity: ActivityFacts | undefined,
  timeZone: string
): BeforeAfterComparison | null {
  if (
    !primaryActivity ||
    !primaryActivity.bestCandidate ||
    primaryActivity.eligibleCandidates.length <= 1
  ) {
    return null;
  }

  const baselineCandidate = primaryActivity.eligibleCandidates[0];
  const optimizedCandidate = primaryActivity.bestCandidate;

  if (baselineCandidate.at === optimizedCandidate.at || baselineCandidate.durationMeanPm25 <= 0) {
    return null;
  }

  const reductionPercent = Math.max(
    0,
    Math.round(
      ((baselineCandidate.durationMeanPm25 - optimizedCandidate.durationMeanPm25) /
        baselineCandidate.durationMeanPm25) *
        100
    )
  );

  return {
    activityId: primaryActivity.id,
    activityTitle: primaryActivity.title,
    metric: "duration_weighted_mean_pm25",
    baselineTime: baselineCandidate.at,
    baselinePm25: Number(baselineCandidate.durationMeanPm25.toFixed(2)),
    baselineStartHourPm25: baselineCandidate.startHourPm25,
    optimizedTime: optimizedCandidate.at,
    optimizedPm25: Number(optimizedCandidate.durationMeanPm25.toFixed(2)),
    optimizedStartHourPm25: optimizedCandidate.startHourPm25,
    concentrationReductionPercent: reductionPercent,
    exposureReductionPercent: reductionPercent,
    justification: `Across the full ${primaryActivity.durationMinutes}-minute window starting at ${formatHourlyTime(
      optimizedCandidate.at,
      timeZone
    )}, time-weighted mean forecast PM₂.₅ concentration is ${reductionPercent}% lower than at ${formatHourlyTime(
      baselineCandidate.at,
      timeZone
    )} (${formatPm25Value(optimizedCandidate.durationMeanPm25)} vs ${formatPm25Value(
      baselineCandidate.durationMeanPm25
    )} µg/m³). Personal inhaled dose is not modeled.`,
  };
}

function buildIndoorRecommendations(input: PlanInput): string[] {
  const recommendations: string[] = [];
  const budgetTier = input.budget || "medium";

  if (input.household?.hasAirPurifier) {
    recommendations.push(
      "Operate HEPA air purifier on medium/high speed in primary living areas and bedrooms with windows closed during forecast peak PM₂.₅ hours."
    );
  } else if (budgetTier === "low") {
    recommendations.push(
      "Low-budget indoor protection: Seal window and door gaps with damp towels or draft stoppers, and damp-dust rather than dry-sweeping to keep fine particles out of the breathing zone."
    );
  } else {
    recommendations.push(
      "Consider a DIY Corsi-Rosenthal box (box fan with MERV-13 filter) or portable HEPA purifier in sleeping areas, and keep exterior windows closed during forecast peak PM₂.₅ hours."
    );
  }

  if (input.household?.sensitiveMembers) {
    recommendations.push(
      "High-priority care for children, older adults, and people with asthma or heart conditions: minimize strenuous outdoor exertion and stay in filtered or closed rooms during high PM₂.₅ hours."
    );
  }

  return recommendations;
}

/**
 * Deterministically computes verified planning facts based on forecast data and user constraints.
 */
export function computePlanFacts(input: PlanInput, forecast: Forecast): PlanFacts {
  const fixedCommitments: FixedCommitment[] = input.fixedCommitments || [];
  const scheduledIntervals: ScheduledInterval[] = [];

  const activities: ActivityFacts[] = (input.activities || []).map((activity) => {
    const durationMinutes = activity.durationMinutes || 60;
    const durationMilliseconds = durationMinutes * MINUTE_IN_MILLISECONDS;
    const eligibleCandidates = collectEligibleActivityCandidates(
      activity,
      forecast.hourly,
      fixedCommitments,
      scheduledIntervals,
      durationMilliseconds
    );
    return selectOptimalActivitySchedule(
      activity,
      eligibleCandidates,
      durationMinutes,
      durationMilliseconds,
      forecast.timeZone,
      scheduledIntervals
    );
  });

  return {
    fixedCommitments,
    activities,
    transportComparison: computeTransportComparison(input, forecast),
    beforeAfterComparison: buildBeforeAfterComparison(activities[0], forecast.timeZone),
    indoorRecommendations: buildIndoorRecommendations(input),
    generatedAt: new Date().toISOString(),
    locationTimezone: forecast.timeZone,
  };
}
