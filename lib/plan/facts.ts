import { Forecast, AirSample } from "../forecast/types";
import {
  PlanInput,
  PlanFacts,
  ActivityFacts,
  FixedCommitment,
  TransportComparison,
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

  const activityFactsList: ActivityFacts[] = (input.activities || []).map((activity) => {
    const winStartMs = new Date(activity.windowStart).getTime();
    const winEndMs = new Date(activity.windowEnd).getTime();
    const durationMs = (activity.durationMinutes || 60) * 60 * 1000;

    // Filter hourly samples falling strictly within the activity window and having valid PM2.5 readings
    const candidatesInWindow = forecast.hourly.filter((sample) => {
      const sampleMs = new Date(sample.at).getTime();
      return sampleMs >= winStartMs && sampleMs <= winEndMs;
    });

    // Filter out missing measurements (nulls) and slots that overlap with fixed commitments
    const validCandidates: AirSample[] = [];

    for (const sample of candidatesInWindow) {
      if (sample.pm25 === null || isNaN(sample.pm25)) {
        continue; // Exclude missing sensor values
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
        eligibleCandidates: [],
        bestCandidate: null,
        reason: "No eligible hours without schedule conflicts or missing data found in the selected window.",
      };
    }

    // Sort by PM2.5 ascending; resolve ties with earliest timestamp
    const sorted = [...validCandidates].sort((a, b) => {
      const pmDiff = (a.pm25 ?? Infinity) - (b.pm25 ?? Infinity);
      if (pmDiff !== 0) return pmDiff;
      return new Date(a.at).getTime() - new Date(b.at).getTime();
    });

    const best = sorted[0];
    const reason = `Optimal slot at ${best.at} with estimated PM₂.₅ of ${best.pm25?.toFixed(
      0
    )} µg/m³ (US AQI: ${best.usAqi ?? "—"}), avoiding fixed commitments.`;

    return {
      id: activity.id,
      title: activity.title,
      eligibleCandidates: validCandidates,
      bestCandidate: best,
      reason,
    };
  });

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

    // Defensible average emission factors (kg CO2 per passenger-km):
    // Car: ~0.170 kg/km
    // Public Transit (Metro/Bus): ~0.040 kg/km
    if (mode === "car") {
      const carCo2 = km * 0.17;
      const transitCo2 = km * 0.04;
      const saved = Math.max(0, carCo2 - transitCo2);

      transportComparison = {
        baselineMode: "Private Car",
        suggestedMode: "Public Transit / Metro",
        estimatedCo2KgSaved: Number(saved.toFixed(2)),
        explanation: `Switching a ${km} km trip from private car to public transit saves approximately ${saved.toFixed(
          2
        )} kg CO₂ and reduces local roadside particulate exposure.`,
      };
    } else if (mode === "transit") {
      transportComparison = {
        baselineMode: "Public Transit",
        suggestedMode: "Public Transit",
        estimatedCo2KgSaved: 0,
        explanation: `Using public transit already maintains low per-passenger emissions compared to private combustion vehicles.`,
      };
    } else if (mode === "walk" || mode === "bike") {
      transportComparison = {
        baselineMode: mode === "walk" ? "Walking" : "Cycling",
        suggestedMode: "Active Transit (Off-peak)",
        estimatedCo2KgSaved: 0,
        explanation: `Zero direct tailpipe emissions. On high smog days, choose indoor alternatives or wear a fitted N95 respirator during active travel.`,
      };
    } else if (mode === "ev") {
      const saved = km * (0.17 - 0.05);
      transportComparison = {
        baselineMode: "Electric Vehicle (EV)",
        suggestedMode: "Electric Vehicle with Cabin Recirculation",
        estimatedCo2KgSaved: Number(saved.toFixed(2)),
        explanation: `Zero tailpipe emissions. Set vehicle HVAC to internal recirculation to prevent smog infiltration into the cabin.`,
      };
    }
  }

  // Grounded indoor recommendations
  const indoorRecommendations: string[] = [];
  if (input.household?.hasAirPurifier) {
    indoorRecommendations.push(
      "Operate HEPA air purifier on medium/high speed in primary living areas and bedrooms during forecast peak hours."
    );
  } else {
    indoorRecommendations.push(
      "Keep exterior windows and balcony doors sealed during peak smog hours; use damp cloths to clean surfaces and prevent dust re-suspension."
    );
  }

  if (input.household?.sensitiveMembers) {
    indoorRecommendations.push(
      "High priority protection: Keep children, elderly, and respiratory-sensitive individuals indoors with filtered air when outdoor US AQI exceeds 150."
    );
  }

  return {
    fixedCommitments,
    activities: activityFactsList,
    transportComparison,
    indoorRecommendations,
    generatedAt: new Date().toISOString(),
    locationTimezone: forecast.timeZone,
  };
}
