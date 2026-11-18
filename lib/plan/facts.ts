import { Forecast, AirSample } from "../forecast/types";
import {
  PlanInput,
  PlanFacts,
  ActivityFacts,
  FixedCommitment,
  TransportComparison,
  BeforeAfterComparison,
} from "./types";

/**
 * Checks whether two time intervals [startA, endA] and [startB, endB] overlap.
 */
function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

/**
 * Deterministically computes verified planning facts based on forecast data and user constraints.
 */
export function computePlanFacts(input: PlanInput, forecast: Forecast): PlanFacts {
  const fixedCommitments: FixedCommitment[] = input.fixedCommitments || [];
  const scheduledIntervals: Array<{ start: number; end: number }> = [];

  const activityFactsList: ActivityFacts[] = (input.activities || []).map((activity) => {
    const winStartMs = new Date(activity.windowStart).getTime();
    const winEndMs = new Date(activity.windowEnd).getTime();
    const durationMinutes = activity.durationMinutes || 60;
    const durationMs = durationMinutes * 60 * 1000;

    // Filter hourly samples where the entire activity duration fits inside the allowed window
    // sampleStartMs >= winStartMs AND sampleStartMs + durationMs <= winEndMs
    const candidatesInWindow = forecast.hourly.filter((sample) => {
      const sampleStartMs = new Date(sample.at).getTime();
      const sampleEndMs = sampleStartMs + durationMs;
      return sampleStartMs >= winStartMs && sampleEndMs <= winEndMs;
    });

    // Filter out missing measurements (nulls) and slots that overlap with fixed commitments
    const validCandidates: AirSample[] = [];

    for (const sample of candidatesInWindow) {
      if (sample.pm25 === null || isNaN(sample.pm25)) {
        continue;
      }

      const sampleStartMs = new Date(sample.at).getTime();
      const sampleEndMs = sampleStartMs + durationMs;

      // Check overlap against all fixed commitments
      const hasConflict = fixedCommitments.some((commitment) => {
        const commStartMs = new Date(commitment.start).getTime();
        const commEndMs = new Date(commitment.end).getTime();
        return intervalsOverlap(sampleStartMs, sampleEndMs, commStartMs, commEndMs);
      });

      if (!hasConflict) {
        validCandidates.push(sample);
      }
    }

    if (validCandidates.length === 0) {
      return {
        id: activity.id,
        title: activity.title,
        durationMinutes,
        eligibleCandidates: [],
        bestCandidate: null,
        reason: "No eligible hours without schedule conflicts or missing data found in the selected window.",
      };
    }

    // Sort valid candidates by PM2.5 ascending; break ties with earliest timestamp
    const sorted = [...validCandidates].sort((a, b) => {
      const pmDiff = (a.pm25 ?? Infinity) - (b.pm25 ?? Infinity);
      if (pmDiff !== 0) return pmDiff;
      return new Date(a.at).getTime() - new Date(b.at).getTime();
    });

    // Select the candidate with lower forecast PM₂.₅ that does not overlap with previously scheduled activities
    let chosenCandidate = sorted.find((cand) => {
      const startMs = new Date(cand.at).getTime();
      const endMs = startMs + durationMs;
      return !scheduledIntervals.some((slot) => intervalsOverlap(startMs, endMs, slot.start, slot.end));
    });

    // Fall back to best independent candidate if no non-overlapping slot exists
    if (!chosenCandidate) {
      chosenCandidate = sorted[0];
    } else {
      const startMs = new Date(chosenCandidate.at).getTime();
      scheduledIntervals.push({ start: startMs, end: startMs + durationMs });
    }

    const reason = `Optimal slot at ${chosenCandidate.at} with lower forecast PM₂.₅ (${chosenCandidate.pm25?.toFixed(
      0
    )} µg/m³, US AQI: ${chosenCandidate.usAqi ?? "—"}), fitting entirely within the allowed window and avoiding fixed commitments.`;

    return {
      id: activity.id,
      title: activity.title,
      durationMinutes,
      eligibleCandidates: validCandidates,
      bestCandidate: chosenCandidate,
      reason,
    };
  });

  // Calculate Before-and-After comparison for the primary activity if eligible candidates exist
  let beforeAfterComparison: BeforeAfterComparison | null = null;
  const primaryActivity = activityFactsList[0];
  if (primaryActivity && primaryActivity.bestCandidate && primaryActivity.eligibleCandidates.length > 1) {
    // Baseline is the earliest eligible slot (when a user might typically leave)
    const baseline = primaryActivity.eligibleCandidates[0];
    const best = primaryActivity.bestCandidate;

    if (baseline.at !== best.at && baseline.pm25 !== null && best.pm25 !== null) {
      const reduction = Math.max(
        0,
        Math.round(((baseline.pm25 - best.pm25) / Math.max(baseline.pm25, 1)) * 100)
      );
      beforeAfterComparison = {
        activityId: primaryActivity.id,
        activityTitle: primaryActivity.title,
        baselineTime: baseline.at,
        baselinePm25: baseline.pm25,
        optimizedTime: best.at,
        optimizedPm25: best.pm25,
        exposureReductionPercent: reduction,
        justification: `Rescheduling ${primaryActivity.title} from ${baseline.at} (${baseline.pm25} µg/m³) to ${best.at} (${best.pm25} µg/m³) shifts the routine to an hour with lower forecast PM₂.₅, achieving a ${reduction}% reduction in peak particulate exposure without altering emissions.`,
      };
    }
  }

  // Transport calculation: only produce numeric quantities if distanceKm is known and > 0
  let transportComparison: TransportComparison | null = null;
  if (
    input.transport &&
    input.transport.distanceKm !== undefined &&
    input.transport.distanceKm !== null &&
    input.transport.distanceKm > 0
  ) {
    const km = input.transport.distanceKm;
    const mode = input.transport.mode;
    const available = input.availableTransportModes || ["car", "transit", "walk", "bike", "ev"];

    if (mode === "ev") {
      // Cabin air recirculation changes exposure, not emissions!
      transportComparison = {
        baselineMode: "Electric Vehicle (EV) with Exterior Air Intake",
        suggestedMode: "Electric Vehicle with Cabin Recirculation",
        distanceKm: km,
        estimatedCo2KgSaved: 0,
        units: "kg CO₂e",
        factorSource: "Vehicle cabin air filtration studies (EPA / ASHRAE)",
        assumptions: "Cabin recirculation filters in-cabin air and blocks outdoor smog infiltration. The vehicle powertrain energy consumption and grid emissions remain identical.",
        isEstimate: false,
        impactType: "lower_exposure",
        explanation: `For an EV driving ${km} km, engaging HVAC cabin recirculation cuts in-cabin particulate exposure by up to 80% while producing exactly 0.00 kg CO₂e emissions change.`,
      };
    } else if (mode === "car") {
      const carCo2 = km * 0.17; // DEFRA average passenger car ~0.170 kg/km
      const hasTransit = available.includes("transit");
      const transitCo2 = km * 0.04; // Rail/bus average ~0.040 kg/km
      const saved = Math.max(0, carCo2 - (hasTransit ? transitCo2 : carCo2 * 0.5));
      const targetMode = hasTransit ? "Public Transit / Metro" : "Carpooling / Trip Consolidation";

      transportComparison = {
        baselineMode: "Private Petrol/Diesel Car",
        suggestedMode: targetMode,
        distanceKm: km,
        estimatedCo2KgSaved: Number(saved.toFixed(2)),
        units: "kg CO₂e",
        factorSource: "Regional DEFRA/IPCC passenger transport conversion factors (2024)",
        assumptions: `Combustion car ~0.170 kg CO₂e/km; public rail/bus ~0.040 kg CO₂e/km over a ${km} km journey.`,
        isEstimate: true,
        impactType: "both",
        explanation: `Switching a ${km} km commute from private car to ${targetMode} saves approximately ${saved.toFixed(
          2
        )} kg CO₂e in tailpipe emissions and reduces personal roadway exposure during peak traffic.`,
      };
    } else if (mode === "transit") {
      transportComparison = {
        baselineMode: "Public Transit",
        suggestedMode: "Public Transit (Off-peak)",
        distanceKm: km,
        estimatedCo2KgSaved: 0,
        units: "kg CO₂e",
        factorSource: "Regional transit baseline",
        assumptions: "Passenger is already using low-emissions public transit.",
        isEstimate: false,
        impactType: "lower_exposure",
        explanation: `Public transit already keeps personal emissions low (~0.040 kg CO₂e/km). Traveling off-peak minimizes underground and platform particulate inhalation.`,
      };
    } else if (mode === "walk" || mode === "bike") {
      transportComparison = {
        baselineMode: mode === "walk" ? "Walking" : "Cycling",
        suggestedMode: "Active Transit with Well-Fitted N95 Mask",
        distanceKm: km,
        estimatedCo2KgSaved: 0,
        units: "kg CO₂e",
        factorSource: "Zero tailpipe emissions baseline",
        assumptions: "Active transport produces zero operational emissions.",
        isEstimate: false,
        impactType: "lower_exposure",
        explanation: `Zero tailpipe emissions. On elevated smog days, wearing a certified N95/FFP2 respirator reduces respiratory intake during elevated exertion.`,
      };
    }
  }

  // Tailored indoor recommendations based on household needs, budget, and ventilation
  const indoorRecommendations: string[] = [];
  const budget = input.budget || "medium";

  if (input.household?.hasAirPurifier) {
    indoorRecommendations.push(
      "Operate HEPA air purifier on medium/high speed in primary living areas and bedrooms, keeping doors and windows sealed during forecast peak hours."
    );
  } else if (budget === "low") {
    indoorRecommendations.push(
      "Low-budget indoor protection: Seal window and door gaps using damp towels or draft stoppers; avoid sweeping or vacuuming without HEPA filtration to prevent re-suspending settled fine dust."
    );
  } else {
    indoorRecommendations.push(
      "Consider a DIY Corsi-Rosenthal box or portable HEPA unit in sleeping areas; keep exterior windows firmly closed during morning thermal inversion hours."
    );
  }

  if (input.household?.sensitiveMembers) {
    indoorRecommendations.push(
      "High priority household care: Keep children, older adults, and individuals with asthma or cardiovascular conditions indoors with clean air when outdoor US AQI exceeds 150."
    );
  }

  return {
    fixedCommitments,
    activities: activityFactsList,
    transportComparison,
    beforeAfterComparison,
    indoorRecommendations,
    generatedAt: new Date().toISOString(),
    locationTimezone: forecast.timeZone,
  };
}
