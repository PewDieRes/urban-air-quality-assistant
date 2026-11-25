import { formatHourlyTime } from "../forecast/open-meteo";
import { Forecast, AirSample } from "../forecast/types";
import {
  PlanInput,
  PlanFacts,
  ActivityFacts,
  ActivityCandidate,
  FixedCommitment,
  TransportComparison,
  BeforeAfterComparison,
} from "./types";

const HOUR_MS = 3600_000;
const TIE_EPSILON = 1e-6;

// UK Department for Energy Security and Net Zero (DESNZ) / DEFRA Conversion Factors (2024)
const DESNZ_2024_CAR_UNKNOWN_KG_PER_VKM = 0.16725;
const DESNZ_2024_NATIONAL_RAIL_KG_PER_PKM = 0.03549;
const DESNZ_2024_LOCAL_BUS_KG_PER_PKM = 0.10215;

/**
 * Formats PM2.5 concisely: integer when whole, 1 decimal place when fractional.
 */
export function formatPm25Value(val: number): string {
  const oneDec = Math.round(val * 10) / 10;
  return Number.isInteger(oneDec) ? String(oneDec) : oneDec.toFixed(1);
}

/**
 * Checks whether two time intervals [startA, endA] and [startB, endB] overlap.
 */
function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

/**
 * Computes time-weighted mean forecast PM2.5 across the full [startMs, startMs + durationMs) interval
 * using overlapping hourly forecast slots [hStart, hStart + 1h).
 * Returns null if any overlapping portion has missing or non-finite forecast coverage.
 */
function computeDurationMetrics(
  startMs: number,
  durationMs: number,
  forecastHourly: AirSample[]
): {
  durationMeanPm25: number;
  startHourPm25: number | null;
  durationMeanUsAqi: number | null;
} | null {
  if (durationMs <= 0) return null;
  const endMs = startMs + durationMs;

  let coveredPmMs = 0;
  let weightedPmSum = 0;
  let coveredAqiMs = 0;
  let weightedAqiSum = 0;
  let startHourPm25: number | null = null;
  const seenHours = new Set<number>();

  for (const sample of forecastHourly) {
    const hStart = Date.parse(sample.at);
    if (!Number.isFinite(hStart) || seenHours.has(hStart)) continue;
    seenHours.add(hStart);

    const hEnd = hStart + HOUR_MS;
    const overlapStart = Math.max(startMs, hStart);
    const overlapEnd = Math.min(endMs, hEnd);

    if (overlapEnd <= overlapStart) continue;

    if (sample.pm25 === null || !Number.isFinite(sample.pm25)) {
      return null;
    }

    const overlapMs = overlapEnd - overlapStart;
    coveredPmMs += overlapMs;
    weightedPmSum += sample.pm25 * overlapMs;

    if (hStart === startMs) {
      startHourPm25 = sample.pm25;
    }

    if (sample.usAqi !== null && Number.isFinite(sample.usAqi)) {
      coveredAqiMs += overlapMs;
      weightedAqiSum += sample.usAqi * overlapMs;
    }
  }

  // Reject candidates missing forecast coverage for any portion of the activity duration
  if (coveredPmMs < durationMs - 1) {
    return null;
  }

  return {
    durationMeanPm25: Number((weightedPmSum / coveredPmMs).toFixed(4)),
    startHourPm25,
    durationMeanUsAqi:
      coveredAqiMs >= durationMs - 1 ? Math.round(weightedAqiSum / coveredAqiMs) : null,
  };
}

/**
 * Computes transport comparison strictly from user-supplied inputs and verifiable factors.
 * Omits numeric CO2e savings whenever required inputs or defensible factors are absent.
 */
function computeTransportComparison(input: PlanInput, forecast: Forecast): TransportComparison | null {
  if (!input.transport) {
    return null;
  }

  const mode = input.transport.mode;
  const km =
    input.transport.distanceKm !== undefined &&
    input.transport.distanceKm !== null &&
    input.transport.distanceKm > 0
      ? input.transport.distanceKm
      : null;
  const carpoolOccupancy =
    input.transport.carpoolOccupancy !== undefined &&
    input.transport.carpoolOccupancy !== null &&
    input.transport.carpoolOccupancy >= 2
      ? Math.floor(input.transport.carpoolOccupancy)
      : null;
  const avoidedVehicleKm =
    input.transport.avoidedVehicleKm !== undefined &&
    input.transport.avoidedVehicleKm !== null &&
    input.transport.avoidedVehicleKm > 0
      ? input.transport.avoidedVehicleKm
      : null;

  const available =
    input.availableTransportModes !== undefined
      ? input.availableTransportModes
      : (["car", "transit", "walk", "bike", "ev"] as const);
  const availableList: string[] = [...available];

  const isUk =
    forecast.timeZone === "Europe/London" ||
    (forecast.lat >= 49.5 && forecast.lat <= 61 && forecast.lon >= -8.5 && forecast.lon <= 2);
  const geography = isUk
    ? "United Kingdom"
    : "United Kingdom reference factor (applied outside UK; regional vehicle fleets differ)";

  if (mode === "none") {
    return {
      baselineMode: "No travel needed",
      suggestedMode: "Stay home during higher outdoor PM₂.₅ hours",
      distanceKm: 0,
      estimatedCo2KgSaved: null,
      units: null,
      factorSource: "No vehicle trip assumed",
      assumptions: "Activity requires no road travel; no counterfactual drive is assumed.",
      isEstimate: false,
      impactType: "lower_exposure",
      action: "Complete this activity without road travel.",
      mechanism: "Avoids outdoor traffic corridors and produces zero operational trip emissions.",
      beneficiary: "Household members",
      explanation:
        "No travel is needed for this activity, producing zero trip emissions and avoiding roadside PM₂.₅.",
    };
  }

  if (mode === "ev") {
    const missingInputs = km === null ? ["trip distance (km)"] : undefined;
    return {
      baselineMode: "Electric Vehicle (EV) with Exterior Air Intake",
      suggestedMode: "Electric Vehicle with Cabin Air Recirculation",
      distanceKm: km,
      estimatedCo2KgSaved: 0,
      units: "kg CO₂e",
      factorSource: "Same-vehicle cabin setting comparison",
      assumptions:
        "Distance and vehicle drivetrain are unchanged; zero emissions reduction is credited for cabin recirculation.",
      missingInputs,
      isEstimate: true,
      impactType: "lower_exposure",
      action: "Enable cabin air recirculation inside the EV while driving.",
      mechanism:
        "Reduces outside PM₂.₅ entering the cabin air stream (effectiveness depends on cabin filter condition).",
      beneficiary: "Vehicle occupants",
      explanation:
        (km !== null
          ? `For this ${km} km EV drive, cabin recirculation can lower outdoor particle entry inside the car.`
          : "Cabin recirculation can lower outdoor particle entry inside the EV (trip distance not provided).") +
        " Effectiveness depends on your cabin filter, and no emissions savings are credited for this cabin setting.",
    };
  }

  if (mode === "walk" || mode === "bike") {
    const modeLabel = mode === "walk" ? "Walking" : "Cycling";
    return {
      baselineMode: modeLabel,
      suggestedMode: `${modeLabel} in lower-PM₂.₅ window (with fitted N95/FFP2 if air is poor)`,
      distanceKm: km,
      estimatedCo2KgSaved: 0,
      units: "kg CO₂e",
      factorSource: "Zero operational tailpipe emissions",
      assumptions: "No combustion vehicle trip is displaced; operational emissions are already zero.",
      missingInputs: km === null ? ["trip distance (km)"] : undefined,
      isEstimate: false,
      impactType: "lower_exposure",
      action: `Keep ${modeLabel.toLowerCase()} in the lowest-PM₂.₅ window and use a fitted N95/FFP2 mask on high-pollution days.`,
      mechanism:
        "Active travel has zero tailpipe emissions, while elevated breathing rates outdoors increase particle intake unless filtered.",
      beneficiary: "Traveler's respiratory health",
      explanation: `${modeLabel} produces zero tailpipe emissions. Choosing the lowest-PM₂.₅ window lowers ambient concentration encountered outdoors, and a fitted N95/FFP2 mask helps filter fine particles during exertion.`,
    };
  }

  if (mode === "transit") {
    return {
      baselineMode: "Public Transit",
      suggestedMode: "Public Transit timed for lower outdoor stop exposure",
      distanceKm: km,
      estimatedCo2KgSaved: 0,
      units: "kg CO₂e",
      factorSource: "UK DESNZ / DEFRA Greenhouse Gas Reporting Conversion Factors (2024)",
      assumptions:
        "Passenger already uses public transit; no counterfactual solo drive is assumed. Underground/station PM₂.₅ is not modeled.",
      missingInputs: km === null ? ["trip distance (km)"] : undefined,
      factorMetadata: {
        publication: "UK DESNZ / DEFRA Greenhouse Gas Reporting: Conversion Factors",
        year: 2024,
        geography,
        baselineModeFactor: "0.03549 kg CO₂e/passenger-km (National rail); 0.10215 kg CO₂e/passenger-km (Local bus)",
        alternativeModeFactor: "Unchanged (already using public transit)",
        unit: "kg CO₂e/passenger-km",
        occupancyAssumption: "Average fleet occupancy per passenger-km",
        isOutsideReferenceGeography: !isUk,
      },
      isEstimate: !isUk,
      impactType: "lower_exposure",
      action: "Continue using public transit and walk to outdoor stops during the lower-PM₂.₅ slot.",
      mechanism:
        "Maintains lower per-passenger emissions than solo driving and lowers ambient PM₂.₅ during outdoor walking/waiting portions.",
      beneficiary: "Commuter",
      explanation:
        "Public transit avoids single-occupant car tailpipe emissions (UK DESNZ 2024 rail reference: 0.035 kg CO₂e/passenger-km; local bus differs at 0.102 kg CO₂e/passenger-km). Scheduling stops in lower-PM₂.₅ hours reduces outdoor concentration; station and vehicle indoor air is not forecasted.",
    };
  }

  // Primary mode === "car"
  const hasTransit = availableList.includes("transit");
  const hasActive = availableList.includes("walk") || availableList.includes("bike");
  const hasEv = availableList.includes("ev");

  // 1. Explicit avoided vehicle distance (e.g. combining/eliminating a separate car trip)
  if (avoidedVehicleKm !== null) {
    const saved = Number((avoidedVehicleKm * DESNZ_2024_CAR_UNKNOWN_KG_PER_VKM).toFixed(2));
    return {
      baselineMode: "Private Passenger Car (average fuel)",
      suggestedMode: "Consolidate errands to avoid extra vehicle-km",
      distanceKm: km,
      estimatedCo2KgSaved: saved,
      units: "kg CO₂e",
      factorSource: "UK DESNZ / DEFRA Greenhouse Gas Reporting Conversion Factors (2024)",
      assumptions: `Avoided ${avoidedVehicleKm} vehicle-km multiplied by 0.16725 kg CO₂e/vehicle-km (average passenger car, unknown fuel). Single-trip change does not measurably alter citywide AQI.`,
      factorMetadata: {
        publication: "UK DESNZ / DEFRA Greenhouse Gas Reporting: Conversion Factors",
        year: 2024,
        geography,
        baselineModeFactor: "0.16725 kg CO₂e/vehicle-km (Average car, unknown fuel)",
        alternativeModeFactor: "0 kg CO₂e/vehicle-km for avoided distance",
        unit: "kg CO₂e/vehicle-km",
        occupancyAssumption: "Vehicle-km avoided directly (independent of passenger count)",
        isOutsideReferenceGeography: !isUk,
      },
      isEstimate: true,
      impactType: "lower_emissions",
      action: `Combine errands to avoid ${avoidedVehicleKm} vehicle-km of extra driving.`,
      mechanism:
        "Eliminating separate vehicle kilometers directly removes tailpipe CO₂e and cold-start exhaust.",
      beneficiary: "Household vehicle emissions",
      explanation: `Avoiding ${avoidedVehicleKm} vehicle-km of average passenger car travel saves approximately ${saved.toFixed(
        2
      )} kg CO₂e (vehicle-km basis; UK DESNZ 2024 reference factor). This reflects trip emissions only and does not noticeably alter city AQI.`,
    };
  }

  // 2. Car -> Public Transit when transit is available AND distanceKm is known
  if (hasTransit && km !== null) {
    const diffPerPkm = DESNZ_2024_CAR_UNKNOWN_KG_PER_VKM - DESNZ_2024_NATIONAL_RAIL_KG_PER_PKM;
    const saved = Number((km * diffPerPkm).toFixed(2));
    return {
      baselineMode: "Single-Occupant Passenger Car",
      suggestedMode: "Public Transit / Rail",
      distanceKm: km,
      estimatedCo2KgSaved: saved,
      units: "kg CO₂e",
      factorSource: "UK DESNZ / DEFRA Greenhouse Gas Reporting Conversion Factors (2024)",
      assumptions: `Assumes 1 driver/vehicle for car (0.16725 kg CO₂e/passenger-km, matching vehicle-km at occupancy=1) versus UK National Rail factor (0.03549 kg CO₂e/passenger-km) over ${km} km. Local bus factor differs (0.10215 kg CO₂e/passenger-km). Assumes transit serves this route; one trip does not change city AQI.`,
      factorMetadata: {
        publication: "UK DESNZ / DEFRA Greenhouse Gas Reporting: Conversion Factors",
        year: 2024,
        geography,
        baselineModeFactor: "0.16725 kg CO₂e/vehicle-km (0.16725 kg CO₂e/passenger-km at 1 occupant)",
        alternativeModeFactor: "0.03549 kg CO₂e/passenger-km (National Rail; local bus is 0.10215 kg CO₂e/pkm)",
        unit: "kg CO₂e/passenger-km",
        occupancyAssumption: "1 occupant in private car vs per-passenger rail average",
        isOutsideReferenceGeography: !isUk,
      },
      isEstimate: true,
      impactType: "lower_emissions",
      action: "Shift this trip to public rail or metro if a route serves your errand.",
      mechanism:
        "Replaces single-occupant car combustion emissions with shared per-passenger rail energy use.",
      beneficiary: "Household trip emissions",
      explanation: `If public rail/metro serves this ${km} km trip, shifting from solo driving saves an estimated ${saved.toFixed(
        2
      )} kg CO₂e (per-passenger reference based on UK DESNZ 2024 factors; local bus savings would be smaller, and regional energy mixes vary). One family trip does not measurably change city AQI.`,
    };
  }

  // 3. Carpool with explicit occupancy >= 2 AND distanceKm known
  if (carpoolOccupancy !== null && km !== null) {
    const savedPerPerson = Number(
      (km * DESNZ_2024_CAR_UNKNOWN_KG_PER_VKM * (1 - 1 / carpoolOccupancy)).toFixed(2)
    );
    return {
      baselineMode: "Single-Occupant Passenger Car (1 occupant)",
      suggestedMode: `Shared Carpool (${carpoolOccupancy} occupants)`,
      distanceKm: km,
      estimatedCo2KgSaved: savedPerPerson,
      units: "kg CO₂e per person",
      factorSource: "UK DESNZ / DEFRA Greenhouse Gas Reporting Conversion Factors (2024)",
      assumptions: `Vehicle emits ~${(km * DESNZ_2024_CAR_UNKNOWN_KG_PER_VKM).toFixed(
        2
      )} kg CO₂e total (0.16725 kg CO₂e/vehicle-km over ${km} vehicle-km). Dividing across ${carpoolOccupancy} occupants reduces per-passenger share if riders replace separate car trips.`,
      factorMetadata: {
        publication: "UK DESNZ / DEFRA Greenhouse Gas Reporting: Conversion Factors",
        year: 2024,
        geography,
        baselineModeFactor: "0.16725 kg CO₂e/passenger-km (1 occupant)",
        alternativeModeFactor: `${(DESNZ_2024_CAR_UNKNOWN_KG_PER_VKM / carpoolOccupancy).toFixed(
          4
        )} kg CO₂e/passenger-km (${carpoolOccupancy} occupants; vehicle-km stays ${km} km)`,
        unit: "kg CO₂e/passenger-km",
        occupancyAssumption: `${carpoolOccupancy} occupants sharing one passenger vehicle`,
        isOutsideReferenceGeography: !isUk,
      },
      isEstimate: true,
      impactType: "lower_emissions",
      action: `Share the ${km} km drive with ${carpoolOccupancy} occupants if riders displace separate drives.`,
      mechanism:
        "Splits the vehicle's total fuel emissions across multiple passengers rather than separate cars.",
      beneficiary: "Shared trip emissions per traveler",
      explanation: `Sharing a ${km} km car trip among ${carpoolOccupancy} occupants lowers per-passenger attribution by ~${savedPerPerson.toFixed(
        2
      )} kg CO₂e (assuming riders would otherwise drive separately; total vehicle-km remains ${km} km).`,
    };
  }

  // 4. Missing inputs / unsupported comparison: NEVER invent 50% or assume unavailable modes
  const alternativeModes = availableList.filter((m) => m !== "car" && m !== "none");
  const missingInputs: string[] = [];
  if (km === null) {
    missingInputs.push("trip distance (km)");
  }
  if (!hasTransit) {
    if (alternativeModes.length === 0) {
      missingInputs.push("available alternative travel mode");
    }
    missingInputs.push("carpool occupancy or avoided vehicle distance");
  }

  if (hasTransit && km === null) {
    return {
      baselineMode: "Private Passenger Car",
      suggestedMode: "Public Transit (if route serves errand)",
      distanceKm: null,
      estimatedCo2KgSaved: null,
      units: null,
      factorSource: "Numeric estimate unavailable without trip distance",
      assumptions: "Trip distance (km) was not provided, and transit route availability is not verified.",
      missingInputs,
      isEstimate: false,
      impactType: "qualitative_guidance",
      action: "Consider public transit if a route serves your errand.",
      mechanism: "Shared transit generally avoids solo car tailpipe exhaust per passenger.",
      beneficiary: "Household commuter",
      explanation:
        "A numeric CO₂e comparison is unavailable because trip distance (km) is missing. If a transit route is practical, shifting from solo driving avoids personal tailpipe emissions.",
    };
  }

  if (alternativeModes.length === 0) {
    return {
      baselineMode: "Private Passenger Car",
      suggestedMode: "No alternative travel modes selected",
      distanceKm: km,
      estimatedCo2KgSaved: null,
      units: null,
      factorSource: "Numeric estimate unavailable (missing inputs)",
      assumptions:
        "No alternative modes are selected, and neither carpool occupancy nor avoided vehicle distance was supplied.",
      missingInputs,
      isEstimate: false,
      impactType: "qualitative_guidance",
      action: "Combine this errand with another existing trip only if your schedule permits.",
      mechanism:
        "Avoiding an extra cold engine start reduces excess exhaust pollutants when no other travel mode is available.",
      beneficiary: "Household fuel use and cabin comfort",
      explanation: `No alternative transport modes are selected, so no numeric CO₂e reduction is estimated. Missing inputs for a calculation: ${missingInputs.join(
        ", "
      )}.`,
    };
  }

  if (hasActive) {
    return {
      baselineMode: "Private Passenger Car",
      suggestedMode: "Active travel (only if safe for errand load)",
      distanceKm: km,
      estimatedCo2KgSaved: null,
      units: null,
      factorSource: "Numeric estimate unavailable (missing avoided-trip or carpool inputs)",
      assumptions:
        "Public transit is unselected, and no carpool occupancy or avoided vehicle distance was provided. Walking/cycling distance suitability is not assumed.",
      missingInputs,
      isEstimate: false,
      impactType: "qualitative_guidance",
      action:
        "Use walking or cycling only if the route is short and safe with groceries; keep windows up and use cabin recirculation if driving.",
      mechanism:
        "Cabin recirculation limits traffic particulate entry while driving; short non-motorized errands emit zero exhaust (exertion outdoors requires a fitted mask in heavy smog).",
      beneficiary: "Vehicle occupants or active traveler",
      explanation: `No numeric CO₂e comparison is shown because public transit is unavailable and neither carpool occupancy nor avoided vehicle distance was entered (missing: ${missingInputs.join(
        ", "
      )}).`,
    };
  }

  if (hasEv) {
    return {
      baselineMode: "Private Passenger Car",
      suggestedMode: "Electric Vehicle (EV) with Cabin Recirculation (if accessible)",
      distanceKm: km,
      estimatedCo2KgSaved: null,
      units: null,
      factorSource: "Numeric estimate unavailable (regional grid electricity factors not modeled)",
      assumptions:
        "Public transit is unselected; regional grid electricity emissions and carpool/avoided-km data are not provided.",
      missingInputs: [...missingInputs, "regional electricity grid factor"],
      isEstimate: false,
      impactType: "qualitative_guidance",
      action: "If an EV is available, enable cabin air recirculation; otherwise batch errands carefully.",
      mechanism:
        "EVs produce zero tailpipe exhaust on urban streets, and cabin recirculation limits outside PM₂.₅ ingress.",
      beneficiary: "Cabin occupants",
      explanation: `No numeric CO₂e savings figure is computed because public transit is unselected, electricity grid factors vary by region, and carpool/avoided-km inputs are missing (missing: ${missingInputs.join(
        ", "
      )}).`,
    };
  }

  return {
    baselineMode: "Private Passenger Car",
    suggestedMode: "Consolidate errands or share rides when confirmed",
    distanceKm: km,
    estimatedCo2KgSaved: null,
    units: null,
    factorSource: "Numeric estimate unavailable (missing inputs)",
    assumptions:
      "Public transit is unselected, and no carpool occupancy or avoided vehicle distance was provided.",
    missingInputs,
    isEstimate: false,
    impactType: "qualitative_guidance",
    action: "Check whether errands can be combined into one drive, and use cabin recirculation in traffic.",
    mechanism:
      "Limiting cold starts cuts excess exhaust while cabin recirculation lowers particle entry inside the car.",
    beneficiary: "Household vehicle occupants",
    explanation: `No numeric CO₂e comparison is computed because ${missingInputs.join(
      " and "
    )} are missing. Never assume an available transit route or carpool seat.`,
  };
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

    // Candidate starts are forecast hourly instants whose full duration fits inside [windowStart, windowEnd]
    const candidatesInWindow = forecast.hourly.filter((sample) => {
      const sampleStartMs = new Date(sample.at).getTime();
      const sampleEndMs = sampleStartMs + durationMs;
      return sampleStartMs >= winStartMs && sampleEndMs <= winEndMs;
    });

    const validCandidates: ActivityCandidate[] = [];

    for (const sample of candidatesInWindow) {
      const sampleStartMs = new Date(sample.at).getTime();
      const sampleEndMs = sampleStartMs + durationMs;

      // Check full duration coverage against hourly forecast intervals
      const metrics = computeDurationMetrics(sampleStartMs, durationMs, forecast.hourly);
      if (!metrics) {
        continue;
      }

      // Check overlap against all fixed commitments
      const hasConflict = fixedCommitments.some((commitment) => {
        const commStartMs = new Date(commitment.start).getTime();
        const commEndMs = new Date(commitment.end).getTime();
        return intervalsOverlap(sampleStartMs, sampleEndMs, commStartMs, commEndMs);
      });

      const alreadyUsed = scheduledIntervals.some((slot) =>
        intervalsOverlap(sampleStartMs, sampleEndMs, slot.start, slot.end)
      );

      if (!hasConflict && !alreadyUsed) {
        validCandidates.push({
          at: sample.at,
          pm25: sample.pm25,
          usAqi: sample.usAqi,
          durationMeanPm25: metrics.durationMeanPm25,
          startHourPm25: metrics.startHourPm25,
          durationMeanUsAqi: metrics.durationMeanUsAqi,
          rankingMetric: "duration_weighted_mean_pm25",
        });
      }
    }

    if (validCandidates.length === 0) {
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

    // Rank by time-weighted mean PM2.5 ascending; break ties with earliest timestamp
    const sorted = [...validCandidates].sort((a, b) => {
      const pmDiff = a.durationMeanPm25 - b.durationMeanPm25;
      if (Math.abs(pmDiff) > TIE_EPSILON) return pmDiff;
      return new Date(a.at).getTime() - new Date(b.at).getTime();
    });

    const chosenCandidate = sorted[0];
    const tiedCandidates = validCandidates.filter(
      (c) =>
        c.at !== chosenCandidate.at &&
        Math.abs(c.durationMeanPm25 - chosenCandidate.durationMeanPm25) <= TIE_EPSILON
    );
    const isEarliestAlreadyBest =
      validCandidates.length > 0 && validCandidates[0].at === chosenCandidate.at;

    const start = Date.parse(chosenCandidate.at);
    scheduledIntervals.push({ start, end: start + durationMs });
    const localTime = formatHourlyTime(chosenCandidate.at, forecast.timeZone);
    const meanStr = formatPm25Value(chosenCandidate.durationMeanPm25);

    const tiePhrase =
      tiedCandidates.length > 0
        ? ` (ties with ${tiedCandidates
            .map((t) => formatHourlyTime(t.at, forecast.timeZone))
            .join(", ")})`
        : "";

    const reason = `Available slot at ${localTime} with lower forecast PM₂.₅ (${meanStr} µg/m³ ${durationMinutes}-min mean${
      chosenCandidate.durationMeanUsAqi !== null && chosenCandidate.durationMeanUsAqi !== undefined
        ? `, US AQI: ${chosenCandidate.durationMeanUsAqi}`
        : ""
    })${tiePhrase}, fitting completely within forecast coverage and avoiding fixed commitments.`;

    return {
      id: activity.id,
      title: activity.title,
      durationMinutes,
      eligibleCandidates: validCandidates,
      bestCandidate: chosenCandidate,
      tiedCandidates,
      isEarliestAlreadyBest,
      reason,
    };
  });

  // Calculate Before-and-After comparison using the EXACT same duration-weighted mean metric
  let beforeAfterComparison: BeforeAfterComparison | null = null;
  const primaryActivity = activityFactsList[0];
  if (
    primaryActivity &&
    primaryActivity.bestCandidate &&
    primaryActivity.eligibleCandidates.length > 1
  ) {
    const baseline = primaryActivity.eligibleCandidates[0];
    const best = primaryActivity.bestCandidate;

    if (baseline.at !== best.at && baseline.durationMeanPm25 > 0) {
      const reduction = Math.max(
        0,
        Math.round(
          ((baseline.durationMeanPm25 - best.durationMeanPm25) / baseline.durationMeanPm25) * 100
        )
      );
      const basePmOut = Number(baseline.durationMeanPm25.toFixed(2));
      const bestPmOut = Number(best.durationMeanPm25.toFixed(2));

      beforeAfterComparison = {
        activityId: primaryActivity.id,
        activityTitle: primaryActivity.title,
        metric: "duration_weighted_mean_pm25",
        baselineTime: baseline.at,
        baselinePm25: basePmOut,
        baselineStartHourPm25: baseline.startHourPm25,
        optimizedTime: best.at,
        optimizedPm25: bestPmOut,
        optimizedStartHourPm25: best.startHourPm25,
        concentrationReductionPercent: reduction,
        exposureReductionPercent: reduction,
        justification: `Across the full ${primaryActivity.durationMinutes}-minute window starting at ${formatHourlyTime(
          best.at,
          forecast.timeZone
        )}, time-weighted mean forecast PM₂.₅ concentration is ${reduction}% lower than at ${formatHourlyTime(
          baseline.at,
          forecast.timeZone
        )} (${formatPm25Value(best.durationMeanPm25)} vs ${formatPm25Value(
          baseline.durationMeanPm25
        )} µg/m³). Personal inhaled dose is not modeled.`,
      };
    }
  }

  const transportComparison = computeTransportComparison(input, forecast);

  // Tailored indoor recommendations (action, mechanism, beneficiary — no unsupported inversion claims)
  const indoorRecommendations: string[] = [];
  const budget = input.budget || "medium";

  if (input.household?.hasAirPurifier) {
    indoorRecommendations.push(
      "Operate HEPA air purifier on medium/high speed in primary living areas and bedrooms with windows closed during forecast peak PM₂.₅ hours."
    );
  } else if (budget === "low") {
    indoorRecommendations.push(
      "Low-budget indoor protection: Seal window and door gaps with damp towels or draft stoppers, and damp-dust rather than dry-sweeping to keep fine particles out of the breathing zone."
    );
  } else {
    indoorRecommendations.push(
      "Consider a DIY Corsi-Rosenthal box (box fan with MERV-13 filter) or portable HEPA purifier in sleeping areas, and keep exterior windows closed during forecast peak PM₂.₅ hours."
    );
  }

  if (input.household?.sensitiveMembers) {
    indoorRecommendations.push(
      "High-priority care for children, older adults, and people with asthma or heart conditions: minimize strenuous outdoor exertion and stay in filtered or closed rooms during high PM₂.₅ hours."
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
