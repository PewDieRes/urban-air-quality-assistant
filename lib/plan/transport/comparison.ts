import { Forecast } from "../../forecast/types";
import { PlanInput, TransportComparison, TransportDetails, TransportMode } from "../types";
import {
  UK_DESNZ_2024_FACTORS,
  FactorGeographyDescriptor,
  describeFactorGeography,
  buildDesnzFactorMetadata,
} from "./factors";

const DEFAULT_AVAILABLE_MODES: readonly TransportMode[] = ["car", "transit", "walk", "bike", "ev"];

interface NormalizedTransportInputs {
  mode: TransportMode;
  tripDistanceKm: number | null;
  carpoolOccupants: number | null;
  avoidedVehicleKm: number | null;
  availableModes: string[];
}

interface QualitativeCarSpec {
  suggestedMode: string;
  distanceKm: number | null;
  factorSource: string;
  assumptions: string;
  missingInputs: string[];
  action: string;
  mechanism: string;
  beneficiary: string;
  explanation: string;
}

function normalizePositiveNumber(value: number | undefined | null): number | null {
  return value !== undefined && value !== null && value > 0 ? value : null;
}

function normalizeTransportInputs(
  transport: TransportDetails,
  configuredModes?: TransportMode[]
): NormalizedTransportInputs {
  const carpoolOccupants =
    transport.carpoolOccupancy !== undefined &&
    transport.carpoolOccupancy !== null &&
    transport.carpoolOccupancy >= 2
      ? Math.floor(transport.carpoolOccupancy)
      : null;

  const available = configuredModes !== undefined ? configuredModes : DEFAULT_AVAILABLE_MODES;

  return {
    mode: transport.mode,
    tripDistanceKm: normalizePositiveNumber(transport.distanceKm),
    carpoolOccupants,
    avoidedVehicleKm: normalizePositiveNumber(transport.avoidedVehicleKm),
    availableModes: [...available],
  };
}

function createQualitativeCarComparison(spec: QualitativeCarSpec): TransportComparison {
  return {
    baselineMode: "Private Passenger Car",
    suggestedMode: spec.suggestedMode,
    distanceKm: spec.distanceKm,
    estimatedCo2KgSaved: null,
    units: null,
    factorSource: spec.factorSource,
    assumptions: spec.assumptions,
    missingInputs: spec.missingInputs,
    isEstimate: false,
    impactType: "qualitative_guidance",
    action: spec.action,
    mechanism: spec.mechanism,
    beneficiary: spec.beneficiary,
    explanation: spec.explanation,
  };
}

function buildNoTravelComparison(): TransportComparison {
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

function buildElectricVehicleComparison(tripDistanceKm: number | null): TransportComparison {
  const missingInputs = tripDistanceKm === null ? ["trip distance (km)"] : undefined;
  const distanceLead =
    tripDistanceKm !== null
      ? `For this ${tripDistanceKm} km EV drive, cabin recirculation can lower outdoor particle entry inside the car.`
      : "Cabin recirculation can lower outdoor particle entry inside the EV (trip distance not provided).";

  return {
    baselineMode: "Electric Vehicle (EV) with Exterior Air Intake",
    suggestedMode: "Electric Vehicle with Cabin Air Recirculation",
    distanceKm: tripDistanceKm,
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
    explanation: `${distanceLead} Effectiveness depends on your cabin filter, and no emissions savings are credited for this cabin setting.`,
  };
}

function buildActiveTravelComparison(
  mode: "walk" | "bike",
  tripDistanceKm: number | null
): TransportComparison {
  const modeLabel = mode === "walk" ? "Walking" : "Cycling";
  return {
    baselineMode: modeLabel,
    suggestedMode: `${modeLabel} in lower-PM₂.₅ window (with fitted N95/FFP2 if air is poor)`,
    distanceKm: tripDistanceKm,
    estimatedCo2KgSaved: 0,
    units: "kg CO₂e",
    factorSource: "Zero operational tailpipe emissions",
    assumptions: "No combustion vehicle trip is displaced; operational emissions are already zero.",
    missingInputs: tripDistanceKm === null ? ["trip distance (km)"] : undefined,
    isEstimate: false,
    impactType: "lower_exposure",
    action: `Keep ${modeLabel.toLowerCase()} in the lowest-PM₂.₅ window and use a fitted N95/FFP2 mask on high-pollution days.`,
    mechanism:
      "Active travel has zero tailpipe emissions, while elevated breathing rates outdoors increase particle intake unless filtered.",
    beneficiary: "Traveler's respiratory health",
    explanation: `${modeLabel} produces zero tailpipe emissions. Choosing the lowest-PM₂.₅ window lowers ambient concentration encountered outdoors, and a fitted N95/FFP2 mask helps filter fine particles during exertion.`,
  };
}

function buildExistingTransitComparison(
  tripDistanceKm: number | null,
  geographyDescriptor: FactorGeographyDescriptor
): TransportComparison {
  return {
    baselineMode: "Public Transit",
    suggestedMode: "Public Transit timed for lower outdoor stop exposure",
    distanceKm: tripDistanceKm,
    estimatedCo2KgSaved: 0,
    units: "kg CO₂e",
    factorSource: UK_DESNZ_2024_FACTORS.shortSourceLabel,
    assumptions:
      "Passenger already uses public transit; no counterfactual solo drive is assumed. Underground/station PM₂.₅ is not modeled.",
    missingInputs: tripDistanceKm === null ? ["trip distance (km)"] : undefined,
    factorMetadata: buildDesnzFactorMetadata({
      geographyDescriptor,
      baselineModeFactor:
        "0.03549 kg CO₂e/passenger-km (National rail); 0.10215 kg CO₂e/passenger-km (Local bus)",
      alternativeModeFactor: "Unchanged (already using public transit)",
      unit: "kg CO₂e/passenger-km",
      occupancyAssumption: "Average fleet occupancy per passenger-km",
    }),
    isEstimate: geographyDescriptor.isOutsideReferenceGeography,
    impactType: "lower_exposure",
    action: "Continue using public transit and walk to outdoor stops during the lower-PM₂.₅ slot.",
    mechanism:
      "Maintains lower per-passenger emissions than solo driving and lowers ambient PM₂.₅ during outdoor walking/waiting portions.",
    beneficiary: "Commuter",
    explanation:
      "Public transit avoids single-occupant car tailpipe emissions (UK DESNZ 2024 rail reference: 0.035 kg CO₂e/passenger-km; local bus differs at 0.102 kg CO₂e/passenger-km). Scheduling stops in lower-PM₂.₅ hours reduces outdoor concentration; station and vehicle indoor air is not forecasted.",
  };
}

function buildAvoidedVehicleComparison(
  avoidedVehicleKm: number,
  tripDistanceKm: number | null,
  geographyDescriptor: FactorGeographyDescriptor
): TransportComparison {
  const savedKg = Number(
    (avoidedVehicleKm * UK_DESNZ_2024_FACTORS.carUnknownKgPerVehicleKm).toFixed(2)
  );
  return {
    baselineMode: "Private Passenger Car (average fuel)",
    suggestedMode: "Consolidate errands to avoid extra vehicle-km",
    distanceKm: tripDistanceKm,
    estimatedCo2KgSaved: savedKg,
    units: "kg CO₂e",
    factorSource: UK_DESNZ_2024_FACTORS.shortSourceLabel,
    assumptions: `Avoided ${avoidedVehicleKm} vehicle-km multiplied by 0.16725 kg CO₂e/vehicle-km (average passenger car, unknown fuel). Single-trip change does not measurably alter citywide AQI.`,
    factorMetadata: buildDesnzFactorMetadata({
      geographyDescriptor,
      baselineModeFactor: "0.16725 kg CO₂e/vehicle-km (Average car, unknown fuel)",
      alternativeModeFactor: "0 kg CO₂e/vehicle-km for avoided distance",
      unit: "kg CO₂e/vehicle-km",
      occupancyAssumption: "Vehicle-km avoided directly (independent of passenger count)",
    }),
    isEstimate: true,
    impactType: "lower_emissions",
    action: `Combine errands to avoid ${avoidedVehicleKm} vehicle-km of extra driving.`,
    mechanism:
      "Eliminating separate vehicle kilometers directly removes tailpipe CO₂e and cold-start exhaust.",
    beneficiary: "Household vehicle emissions",
    explanation: `Avoiding ${avoidedVehicleKm} vehicle-km of average passenger car travel saves approximately ${savedKg.toFixed(
      2
    )} kg CO₂e (vehicle-km basis; UK DESNZ 2024 reference factor). This reflects trip emissions only and does not noticeably alter city AQI.`,
  };
}

function buildCarToRailComparison(
  tripDistanceKm: number,
  geographyDescriptor: FactorGeographyDescriptor
): TransportComparison {
  const diffPerPassengerKm =
    UK_DESNZ_2024_FACTORS.carUnknownKgPerVehicleKm -
    UK_DESNZ_2024_FACTORS.nationalRailKgPerPassengerKm;
  const savedKg = Number((tripDistanceKm * diffPerPassengerKm).toFixed(2));

  return {
    baselineMode: "Single-Occupant Passenger Car",
    suggestedMode: "Public Transit / Rail",
    distanceKm: tripDistanceKm,
    estimatedCo2KgSaved: savedKg,
    units: "kg CO₂e",
    factorSource: UK_DESNZ_2024_FACTORS.shortSourceLabel,
    assumptions: `Assumes 1 driver/vehicle for car (0.16725 kg CO₂e/passenger-km, matching vehicle-km at occupancy=1) versus UK National Rail factor (0.03549 kg CO₂e/passenger-km) over ${tripDistanceKm} km. Local bus factor differs (0.10215 kg CO₂e/passenger-km). Assumes transit serves this route; one trip does not change city AQI.`,
    factorMetadata: buildDesnzFactorMetadata({
      geographyDescriptor,
      baselineModeFactor: "0.16725 kg CO₂e/vehicle-km (0.16725 kg CO₂e/passenger-km at 1 occupant)",
      alternativeModeFactor:
        "0.03549 kg CO₂e/passenger-km (National Rail; local bus is 0.10215 kg CO₂e/pkm)",
      unit: "kg CO₂e/passenger-km",
      occupancyAssumption: "1 occupant in private car vs per-passenger rail average",
    }),
    isEstimate: true,
    impactType: "lower_emissions",
    action: "Shift this trip to public rail or metro if a route serves your errand.",
    mechanism:
      "Replaces single-occupant car combustion emissions with shared per-passenger rail energy use.",
    beneficiary: "Household trip emissions",
    explanation: `If public rail/metro serves this ${tripDistanceKm} km trip, shifting from solo driving saves an estimated ${savedKg.toFixed(
      2
    )} kg CO₂e (per-passenger reference based on UK DESNZ 2024 factors; local bus savings would be smaller, and regional energy mixes vary). One family trip does not measurably change city AQI.`,
  };
}

function buildCarpoolComparison(
  carpoolOccupants: number,
  tripDistanceKm: number,
  geographyDescriptor: FactorGeographyDescriptor
): TransportComparison {
  const carFactor = UK_DESNZ_2024_FACTORS.carUnknownKgPerVehicleKm;
  const savedPerPerson = Number(
    (tripDistanceKm * carFactor * (1 - 1 / carpoolOccupants)).toFixed(2)
  );
  const totalVehicleKg = (tripDistanceKm * carFactor).toFixed(2);
  const perOccupantFactor = (carFactor / carpoolOccupants).toFixed(4);

  return {
    baselineMode: "Single-Occupant Passenger Car (1 occupant)",
    suggestedMode: `Shared Carpool (${carpoolOccupants} occupants)`,
    distanceKm: tripDistanceKm,
    estimatedCo2KgSaved: savedPerPerson,
    units: "kg CO₂e per person",
    factorSource: UK_DESNZ_2024_FACTORS.shortSourceLabel,
    assumptions: `Vehicle emits ~${totalVehicleKg} kg CO₂e total (0.16725 kg CO₂e/vehicle-km over ${tripDistanceKm} vehicle-km). Dividing across ${carpoolOccupants} occupants reduces per-passenger share if riders replace separate car trips.`,
    factorMetadata: buildDesnzFactorMetadata({
      geographyDescriptor,
      baselineModeFactor: "0.16725 kg CO₂e/passenger-km (1 occupant)",
      alternativeModeFactor: `${perOccupantFactor} kg CO₂e/passenger-km (${carpoolOccupants} occupants; vehicle-km stays ${tripDistanceKm} km)`,
      unit: "kg CO₂e/passenger-km",
      occupancyAssumption: `${carpoolOccupants} occupants sharing one passenger vehicle`,
    }),
    isEstimate: true,
    impactType: "lower_emissions",
    action: `Share the ${tripDistanceKm} km drive with ${carpoolOccupants} occupants if riders displace separate drives.`,
    mechanism:
      "Splits the vehicle's total fuel emissions across multiple passengers rather than separate cars.",
    beneficiary: "Shared trip emissions per traveler",
    explanation: `Sharing a ${tripDistanceKm} km car trip among ${carpoolOccupants} occupants lowers per-passenger attribution by ~${savedPerPerson.toFixed(
      2
    )} kg CO₂e (assuming riders would otherwise drive separately; total vehicle-km remains ${tripDistanceKm} km).`,
  };
}

function buildMissingCarInputsComparison(
  normalized: NormalizedTransportInputs
): TransportComparison {
  const { tripDistanceKm, availableModes } = normalized;
  const hasTransit = availableModes.includes("transit");
  const hasActive = availableModes.includes("walk") || availableModes.includes("bike");
  const hasEv = availableModes.includes("ev");
  const alternativeModes = availableModes.filter((mode) => mode !== "car" && mode !== "none");

  const missingInputs: string[] = [];
  if (tripDistanceKm === null) {
    missingInputs.push("trip distance (km)");
  }
  if (!hasTransit) {
    if (alternativeModes.length === 0) {
      missingInputs.push("available alternative travel mode");
    }
    missingInputs.push("carpool occupancy or avoided vehicle distance");
  }

  if (hasTransit && tripDistanceKm === null) {
    return createQualitativeCarComparison({
      suggestedMode: "Public Transit (if route serves errand)",
      distanceKm: null,
      factorSource: "Numeric estimate unavailable without trip distance",
      assumptions:
        "Trip distance (km) was not provided, and transit route availability is not verified.",
      missingInputs,
      action: "Consider public transit if a route serves your errand.",
      mechanism: "Shared transit generally avoids solo car tailpipe exhaust per passenger.",
      beneficiary: "Household commuter",
      explanation:
        "A numeric CO₂e comparison is unavailable because trip distance (km) is missing. If a transit route is practical, shifting from solo driving avoids personal tailpipe emissions.",
    });
  }

  if (alternativeModes.length === 0) {
    return createQualitativeCarComparison({
      suggestedMode: "No alternative travel modes selected",
      distanceKm: tripDistanceKm,
      factorSource: "Numeric estimate unavailable (missing inputs)",
      assumptions:
        "No alternative modes are selected, and neither carpool occupancy nor avoided vehicle distance was supplied.",
      missingInputs,
      action: "Combine this errand with another existing trip only if your schedule permits.",
      mechanism:
        "Avoiding an extra cold engine start reduces excess exhaust pollutants when no other travel mode is available.",
      beneficiary: "Household fuel use and cabin comfort",
      explanation: `No alternative transport modes are selected, so no numeric CO₂e reduction is estimated. Missing inputs for a calculation: ${missingInputs.join(
        ", "
      )}.`,
    });
  }

  if (hasActive) {
    return createQualitativeCarComparison({
      suggestedMode: "Active travel (only if safe for errand load)",
      distanceKm: tripDistanceKm,
      factorSource: "Numeric estimate unavailable (missing avoided-trip or carpool inputs)",
      assumptions:
        "Public transit is unselected, and no carpool occupancy or avoided vehicle distance was provided. Walking/cycling distance suitability is not assumed.",
      missingInputs,
      action:
        "Use walking or cycling only if the route is short and safe with groceries; keep windows up and use cabin recirculation if driving.",
      mechanism:
        "Cabin recirculation limits traffic particulate entry while driving; short non-motorized errands emit zero exhaust (exertion outdoors requires a fitted mask in heavy smog).",
      beneficiary: "Vehicle occupants or active traveler",
      explanation: `No numeric CO₂e comparison is shown because public transit is unavailable and neither carpool occupancy nor avoided vehicle distance was entered (missing: ${missingInputs.join(
        ", "
      )}).`,
    });
  }

  if (hasEv) {
    return createQualitativeCarComparison({
      suggestedMode: "Electric Vehicle (EV) with Cabin Recirculation (if accessible)",
      distanceKm: tripDistanceKm,
      factorSource: "Numeric estimate unavailable (regional grid electricity factors not modeled)",
      assumptions:
        "Public transit is unselected; regional grid electricity emissions and carpool/avoided-km data are not provided.",
      missingInputs: [...missingInputs, "regional electricity grid factor"],
      action:
        "If an EV is available, enable cabin air recirculation; otherwise batch errands carefully.",
      mechanism:
        "EVs produce zero tailpipe exhaust on urban streets, and cabin recirculation limits outside PM₂.₅ ingress.",
      beneficiary: "Cabin occupants",
      explanation: `No numeric CO₂e savings figure is computed because public transit is unselected, electricity grid factors vary by region, and carpool/avoided-km inputs are missing (missing: ${missingInputs.join(
        ", "
      )}).`,
    });
  }

  return createQualitativeCarComparison({
    suggestedMode: "Consolidate errands or share rides when confirmed",
    distanceKm: tripDistanceKm,
    factorSource: "Numeric estimate unavailable (missing inputs)",
    assumptions:
      "Public transit is unselected, and no carpool occupancy or avoided vehicle distance was provided.",
    missingInputs,
    action:
      "Check whether errands can be combined into one drive, and use cabin recirculation in traffic.",
    mechanism:
      "Limiting cold starts cuts excess exhaust while cabin recirculation lowers particle entry inside the car.",
    beneficiary: "Household vehicle occupants",
    explanation: `No numeric CO₂e comparison is computed because ${missingInputs.join(
      " and "
    )} are missing. Never assume an available transit route or carpool seat.`,
  });
}

/**
 * Computes transport comparison strictly from user-supplied inputs and verifiable DESNZ factors.
 * Omits numeric CO2e savings whenever required inputs or defensible factors are absent.
 */
export function computeTransportComparison(
  input: PlanInput,
  forecast: Forecast
): TransportComparison | null {
  if (!input.transport) {
    return null;
  }

  const normalized = normalizeTransportInputs(input.transport, input.availableTransportModes);
  const geographyDescriptor = describeFactorGeography(forecast);

  if (normalized.mode === "none") {
    return buildNoTravelComparison();
  }
  if (normalized.mode === "ev") {
    return buildElectricVehicleComparison(normalized.tripDistanceKm);
  }
  if (normalized.mode === "walk" || normalized.mode === "bike") {
    return buildActiveTravelComparison(normalized.mode, normalized.tripDistanceKm);
  }
  if (normalized.mode === "transit") {
    return buildExistingTransitComparison(normalized.tripDistanceKm, geographyDescriptor);
  }

  if (normalized.avoidedVehicleKm !== null) {
    return buildAvoidedVehicleComparison(
      normalized.avoidedVehicleKm,
      normalized.tripDistanceKm,
      geographyDescriptor
    );
  }
  if (normalized.availableModes.includes("transit") && normalized.tripDistanceKm !== null) {
    return buildCarToRailComparison(normalized.tripDistanceKm, geographyDescriptor);
  }
  if (normalized.carpoolOccupants !== null && normalized.tripDistanceKm !== null) {
    return buildCarpoolComparison(
      normalized.carpoolOccupants,
      normalized.tripDistanceKm,
      geographyDescriptor
    );
  }

  return buildMissingCarInputsComparison(normalized);
}
