import { z } from "zod";
import { PlanInput, PlanFacts, PlanNarrative, PlanNarrativeItem } from "./types";
import { formatHourlyTime } from "../forecast/open-meteo";
import { formatPm25Value } from "./facts";

export const NarrativeItemSchema = z.object({
  id: z.string(),
  category: z.enum(["routine", "indoor", "transport", "direct_impact"]),
  action: z.string().min(3),
  whyItHelps: z.string().min(3),
  beneficiary: z.string().min(2),
  impactType: z.enum(["lower_exposure", "lower_emissions", "health_protection"]),
  evidenceFactId: z.string().optional(),
});

export const PlanNarrativeSchema = z.object({
  summary: z.string().min(5),
  items: z.array(NarrativeItemSchema).min(1),
  cautionNotes: z.array(z.string()).optional(),
});

export type ValidationFailureReason =
  | "invalid_structure"
  | "missing_categories"
  | "invalid_fact_id"
  | "mismatched_category_reference"
  | "unsupported_claim"
  | "unsupported_household_assumption"
  | "unsupported_transport_assumption";

export type ValidationResult =
  | { success: true; narrative: PlanNarrative }
  | { success: false; reason: ValidationFailureReason };

export interface PlanGenerationResult {
  status: "gemini_generated" | "deterministic_fallback";
  modelUsed: string | null;
  narrative: PlanNarrative;
  fallbackReason?: "missing_key" | "provider_error" | "invalid_output" | ValidationFailureReason;
}

const REQUIRED_CATEGORIES: Array<"routine" | "indoor" | "transport" | "direct_impact"> = [
  "routine",
  "indoor",
  "transport",
  "direct_impact",
];

function normalizeTimeStr(t: string): string {
  return t.trim().toLowerCase().replace(":00 ", " ");
}

function collectAllowedFactValues(facts: PlanFacts) {
  const pmStrings = new Set<string>();
  const aqiStrings = new Set<string>();
  const pctStrings = new Set<string>();
  const co2Strings = new Set<string>();
  const timeStrings = new Set<string>();

  const addPm = (v: number | null | undefined) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    pmStrings.add(String(v));
    pmStrings.add(String(Math.round(v)));
    pmStrings.add(v.toFixed(1));
    pmStrings.add(formatPm25Value(v));
  };

  const addTime = (iso: string | undefined) => {
    if (!iso) return;
    const formatted = formatHourlyTime(iso, facts.locationTimezone);
    timeStrings.add(formatted.toLowerCase());
    timeStrings.add(normalizeTimeStr(formatted));
  };

  for (const fix of facts.fixedCommitments) {
    addTime(fix.start);
    addTime(fix.end);
  }

  for (const act of facts.activities) {
    if (act.bestCandidate) {
      addPm(act.bestCandidate.durationMeanPm25);
      addPm(act.bestCandidate.startHourPm25);
      addPm(act.bestCandidate.pm25);
      addTime(act.bestCandidate.at);
      addTime(new Date(Date.parse(act.bestCandidate.at) + (act.durationMinutes || 60) * 60000).toISOString());
      if (act.bestCandidate.durationMeanUsAqi !== null && act.bestCandidate.durationMeanUsAqi !== undefined) {
        aqiStrings.add(String(act.bestCandidate.durationMeanUsAqi));
      }
      if (act.bestCandidate.usAqi !== null && act.bestCandidate.usAqi !== undefined) {
        aqiStrings.add(String(act.bestCandidate.usAqi));
      }
    }
    for (const c of act.eligibleCandidates) {
      addPm(c.durationMeanPm25);
      addPm(c.startHourPm25);
      addPm(c.pm25);
      addTime(c.at);
    }
  }

  if (facts.beforeAfterComparison) {
    addPm(facts.beforeAfterComparison.baselinePm25);
    addPm(facts.beforeAfterComparison.optimizedPm25);
    addPm(facts.beforeAfterComparison.baselineStartHourPm25);
    addPm(facts.beforeAfterComparison.optimizedStartHourPm25);
    addTime(facts.beforeAfterComparison.baselineTime);
    addTime(facts.beforeAfterComparison.optimizedTime);
    const pct =
      facts.beforeAfterComparison.concentrationReductionPercent ??
      facts.beforeAfterComparison.exposureReductionPercent;
    if (pct !== null && pct !== undefined) {
      pctStrings.add(String(pct));
    }
  }

  if (
    facts.transportComparison?.estimatedCo2KgSaved !== null &&
    facts.transportComparison?.estimatedCo2KgSaved !== undefined &&
    facts.transportComparison.estimatedCo2KgSaved > 0
  ) {
    const saved = facts.transportComparison.estimatedCo2KgSaved;
    co2Strings.add(String(saved));
    co2Strings.add(saved.toFixed(1));
    co2Strings.add(saved.toFixed(2));
  }

  return { pmStrings, aqiStrings, pctStrings, co2Strings, timeStrings };
}

function hasUnsupportedMeasurementOrTime(
  text: string,
  category: "summary" | "routine" | "indoor" | "transport" | "direct_impact",
  allowed: ReturnType<typeof collectAllowedFactValues>
): boolean {
  // 1. Check PM2.5 concentrations (in indoor or transport, indoor/cabin concentrations are unmeasured; elsewhere must match facts)
  const pmMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*(?:µg\/m³|ug\/m³|ug\/m3|µg\/m3|mcg\/m3)/gi);
  for (const m of pmMatches) {
    const numStr = m[1];
    if (category === "indoor") {
      return true;
    }
    if (!allowed.pmStrings.has(numStr)) {
      return true;
    }
  }

  // 2. Check AQI values
  const aqiAfterMatches = text.matchAll(/\b(?:us\s*)?aqi\s*(?:is|of|above|over|exceeds|:|=)?\s*(\d+)\b/gi);
  for (const m of aqiAfterMatches) {
    if (category === "indoor" || !allowed.aqiStrings.has(m[1])) {
      return true;
    }
  }
  const aqiBeforeMatches = text.matchAll(/\b(\d+)\s*(?:us\s*)?aqi\b/gi);
  for (const m of aqiBeforeMatches) {
    if (category === "indoor" || !allowed.aqiStrings.has(m[1])) {
      return true;
    }
  }

  // 3. Check CO2 emissions quantities
  const co2Matches = text.matchAll(/(\d+(?:\.\d+)?)\s*kg\s*(?:co2e?|co₂e?)/gi);
  for (const m of co2Matches) {
    if (category === "indoor" || !allowed.co2Strings.has(m[1])) {
      return true;
    }
  }

  // 4. Check percentages (indoor/transport should not claim ungrounded % figures)
  const pctMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
  for (const m of pctMatches) {
    if (category === "indoor" || category === "transport" || !allowed.pctStrings.has(m[1])) {
      return true;
    }
  }

  // 5. Check clock times (indoor/transport should not invent schedule clocks; summary/direct_impact must match facts)
  const timeMatches = text.matchAll(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/gi);
  for (const m of timeMatches) {
    const norm = normalizeTimeStr(m[1]);
    if (category === "indoor" || category === "transport") {
      return true;
    }
    if (!allowed.timeStrings.has(norm) && !allowed.timeStrings.has(m[1].toLowerCase())) {
      return true;
    }
  }

  return false;
}

function assumesUnavailablePurifier(text: string): boolean {
  const negatedContext = /\b(no|not|without|don't|do not|lack|missing)\s+(?:a\s+|an\s+|any\s+|mechanical\s+)?(?:hepa|air\s*purifier|particle\s*filter)/i;
  if (negatedContext.test(text)) {
    return false;
  }
  if (/\bconsider\b|\bdiy\b|\bcorsi-rosenthal\b/i.test(text)) {
    return false;
  }
  const assumeUse =
    /\b(?:run|operate|turn on|keep|set|use)\s+(?:your\s+|the\s+|a\s+)?(?:bedroom\s+|living room\s+|portable\s+|existing\s+)?(?:hepa(?:\s+air)?\s*(?:purifier|filter|unit)?|air\s*purifier|particle\s*filter)\b/i;
  const assumePossession = /\byour\s+(?:hepa|air\s*purifier|particle\s*filter)\b/i;
  return assumeUse.test(text) || assumePossession.test(text);
}

function assumesUnavailableTransit(text: string): boolean {
  const negatedTransit =
    /\b(no|without|unavailable|not available|lack)\s+(?:public\s+)?(?:transit|metro|bus|rail|subway|train)/i;
  if (negatedTransit.test(text)) {
    return false;
  }
  return /\b(public transit|transit rail|metro|subway|bus|commuter rail|train|tram|light rail)\b/i.test(
    text
  );
}

function assumesUnavailableTravelOption(text: string, input: PlanInput): boolean {
  const mode = input.transport?.mode;
  const available = input.availableTransportModes;

  if (mode === "none") {
    const travelDirective =
      /\b(drive|driving|carpool|take the metro|public transit|switch commute|shift commute|bike|cycling|commute)\b/i;
    const negatedNoTravel = /\bno\s+(?:road\s+)?travel\b|\bwithout\s+(?:road\s+)?travel\b|\bno\s+commute\b/i;
    if (travelDirective.test(text) && !negatedNoTravel.test(text)) {
      return true;
    }
  }

  if (available && available.length === 0 && mode === "car") {
    const assumesOtherOption =
      /\b(carpool|share a ride|take transit|take the metro|public transit|switch to|use (?:ev|electric vehicle|public)|walk instead|bike instead|cycle instead)\b/i;
    if (assumesOtherOption.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates generated JSON against schema, enforces category-appropriate fact references,
 * rejects ungrounded measurements or incompatible household/transport assumptions,
 * and composes verified schedule/metric facts in code.
 */
export function validatePlanNarrative(
  raw: unknown,
  facts: PlanFacts,
  input?: PlanInput
): ValidationResult {
  const result = PlanNarrativeSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, reason: "invalid_structure" };
  }

  const validActivityIds = new Set(facts.activities.map((a) => a.id));
  const validCommitmentIds = new Set(facts.fixedCommitments.map((f) => f.id));
  const validFactIds = new Set<string>([...validActivityIds, ...validCommitmentIds]);

  // Verify all 4 required categories are present
  const categoriesPresent = new Set(result.data.items.map((i) => i.category));
  for (const reqCat of REQUIRED_CATEGORIES) {
    if (!categoriesPresent.has(reqCat)) {
      return { success: false, reason: "missing_categories" };
    }
  }

  const allowedValues = collectAllowedFactValues(facts);

  // Check summary for unsupported measurements or invalid household/transit assumptions
  if (hasUnsupportedMeasurementOrTime(result.data.summary, "summary", allowedValues)) {
    return { success: false, reason: "unsupported_claim" };
  }
  if (input?.household?.hasAirPurifier === false && assumesUnavailablePurifier(result.data.summary)) {
    return { success: false, reason: "unsupported_household_assumption" };
  }
  if (
    input?.availableTransportModes !== undefined &&
    !input.availableTransportModes.includes("transit") &&
    input.transport?.mode !== "transit" &&
    assumesUnavailableTransit(result.data.summary)
  ) {
    return { success: false, reason: "unsupported_transport_assumption" };
  }

  // Validate and compose each item
  const sanitizedItems: PlanNarrativeItem[] = [];

  for (const item of result.data.items) {
    // 1. Validate evidenceFactId and category alignment
    if (item.evidenceFactId) {
      if (!validFactIds.has(item.evidenceFactId)) {
        console.warn("Validation failed: invalid_fact_id reference");
        return { success: false, reason: "invalid_fact_id" };
      }

      if (item.category === "indoor" || item.category === "transport") {
        // Indoor and transport guidance must NEVER silently turn into activity advice
        return { success: false, reason: "mismatched_category_reference" };
      }

      if (!validActivityIds.has(item.evidenceFactId)) {
        return { success: false, reason: "mismatched_category_reference" };
      }

      if (
        item.category === "direct_impact" &&
        facts.beforeAfterComparison &&
        item.evidenceFactId !== facts.beforeAfterComparison.activityId
      ) {
        return { success: false, reason: "mismatched_category_reference" };
      }
    }

    // 2. Compose routine item deterministically from typed activity fact
    if (item.category === "routine" && item.evidenceFactId) {
      const activityFact = facts.activities.find((a) => a.id === item.evidenceFactId);
      if (activityFact && activityFact.bestCandidate) {
        const verifiedTime = formatHourlyTime(activityFact.bestCandidate.at, facts.locationTimezone);
        const meanVal = activityFact.bestCandidate.durationMeanPm25 ?? activityFact.bestCandidate.pm25;
        const verifiedPm =
          meanVal !== null && meanVal !== undefined ? `${formatPm25Value(meanVal)} µg/m³` : "unmeasured";

        const sanitizedAction = `Conduct ${activityFact.title} at ${verifiedTime} (lower forecast PM₂.₅: ${verifiedPm})`;

        sanitizedItems.push({
          ...item,
          action: sanitizedAction,
          whyItHelps: activityFact.reason,
          beneficiary: item.beneficiary,
          impactType: item.impactType || "lower_exposure",
          evidenceFactId: item.evidenceFactId,
        });
        continue;
      }
    }

    // 3. Check uncomposed fields for made-up numbers or times
    if (
      hasUnsupportedMeasurementOrTime(item.action, item.category, allowedValues) ||
      hasUnsupportedMeasurementOrTime(item.whyItHelps, item.category, allowedValues)
    ) {
      return { success: false, reason: "unsupported_claim" };
    }

    // 4. Check indoor purifier assumption when household hasAirPurifier === false
    if (item.category === "indoor" && input?.household?.hasAirPurifier === false) {
      if (assumesUnavailablePurifier(item.action) || assumesUnavailablePurifier(item.whyItHelps)) {
        return { success: false, reason: "unsupported_household_assumption" };
      }
    }

    // 5. Check transport availability assumptions
    if (item.category === "transport" && input) {
      const hasTransit =
        input.availableTransportModes === undefined
          ? true
          : input.availableTransportModes.includes("transit") || input.transport?.mode === "transit";

      if (!hasTransit && (assumesUnavailableTransit(item.action) || assumesUnavailableTransit(item.whyItHelps))) {
        return { success: false, reason: "unsupported_transport_assumption" };
      }
      if (assumesUnavailableTravelOption(item.action, input) || assumesUnavailableTravelOption(item.whyItHelps, input)) {
        return { success: false, reason: "unsupported_transport_assumption" };
      }
    }

    // 6. Compose direct_impact explanation strictly when grounded by beforeAfterComparison
    if (item.category === "direct_impact" && item.evidenceFactId && facts.beforeAfterComparison) {
      sanitizedItems.push({
        ...item,
        whyItHelps: facts.beforeAfterComparison.justification,
      });
      continue;
    }

    sanitizedItems.push(item);
  }

  return {
    success: true,
    narrative: {
      summary: result.data.summary,
      items: sanitizedItems,
      cautionNotes: result.data.cautionNotes,
    },
  };
}

/**
 * Backward compatible wrapper returning PlanNarrative | null
 */
export function validateAndSanitizePlanNarrative(
  raw: unknown,
  facts: PlanFacts,
  input?: PlanInput
): PlanNarrative | null {
  const res = validatePlanNarrative(raw, facts, input);
  return res.success ? res.narrative : null;
}

/**
 * Deterministic fallback narrative constructed strictly from verified facts.
 */
export function buildDeterministicNarrative(input: PlanInput, facts: PlanFacts): PlanNarrative {
  const items: PlanNarrativeItem[] = [];

  // 1. Routine items for activities
  facts.activities.forEach((act) => {
    if (act.bestCandidate) {
      const localTime = formatHourlyTime(act.bestCandidate.at, facts.locationTimezone);
      const meanVal = act.bestCandidate.durationMeanPm25 ?? act.bestCandidate.pm25;
      const pmStr = meanVal !== null && meanVal !== undefined ? `${formatPm25Value(meanVal)} µg/m³` : "—";
      items.push({
        id: `routine-${act.id}`,
        category: "routine",
        action: `Conduct ${act.title} at ${localTime} (lower forecast PM₂.₅: ${pmStr})`,
        whyItHelps: act.reason,
        beneficiary: input.household?.sensitiveMembers ? "Vulnerable household members" : "General household",
        impactType: "lower_exposure",
        evidenceFactId: act.id,
      });
    }
  });

  if (items.length === 0) {
    items.push({
      id: "routine-default",
      category: "routine",
      action: "Review the forecast or widen your activity window",
      whyItHelps: "No eligible activity slot with complete forecast coverage was found in the current window.",
      beneficiary: "All household members",
      impactType: "lower_exposure",
    });
  }

  // 2. Indoor air recommendations
  const indoorTip =
    facts.indoorRecommendations[0] ||
    "Keep windows sealed and use damp dusting during high forecast PM₂.₅ hours.";
  items.push({
    id: "indoor-rec",
    category: "indoor",
    action: indoorTip,
    whyItHelps: "Limits fine particulate matter (PM₂.₅) infiltration into indoor breathing zones.",
    beneficiary: input.household?.sensitiveMembers
      ? "Children, older adults, and individuals with asthma"
      : "All household occupants",
    impactType: "health_protection",
  });

  // 3. Transport alternative
  if (facts.transportComparison) {
    items.push({
      id: "transport-rec",
      category: "transport",
      action: facts.transportComparison.action || `Consider ${facts.transportComparison.suggestedMode}`,
      whyItHelps: facts.transportComparison.explanation,
      beneficiary: facts.transportComparison.beneficiary || "Household commuter",
      impactType:
        facts.transportComparison.impactType === "lower_emissions"
          ? "lower_emissions"
          : "lower_exposure",
    });
  } else {
    const available =
      input.availableTransportModes !== undefined
        ? input.availableTransportModes
        : (["car", "transit", "walk", "bike", "ev"] as const);
    const availableList: string[] = [...available];
    const hasTransit = availableList.includes("transit");
    const hasActive = availableList.includes("walk") || availableList.includes("bike");
    const hasEv = availableList.includes("ev");

    let action = "Verify whether errands can share a trip without assuming alternative modes.";
    let why =
      "Quantitative CO₂e savings are unavailable without trip distance and alternative mode or carpool inputs.";

    if (hasTransit) {
      action = "Consider public transit if a route serves your errand.";
      why =
        "Quantitative CO₂e savings are unavailable without trip distance (km); shared transit avoids solo driving exhaust.";
    } else if (hasEv) {
      action = "Use EV cabin air recirculation if driving an electric vehicle.";
      why =
        "Helps reduce outdoor particle entry inside the cabin without assuming unavailable transit or emissions data.";
    } else if (hasActive) {
      action = "Consider short-distance active travel with a fitted N95 mask only if practical for your load.";
      why =
        "Active travel emits zero exhaust, while higher breathing rates outdoors merit filtration on polluted days.";
    }

    items.push({
      id: "transport-rec",
      category: "transport",
      action,
      whyItHelps: why,
      beneficiary: "Household traveler",
      impactType: hasTransit ? "lower_emissions" : "health_protection",
    });
  }

  // 4. Direct impact recommendation
  if (facts.beforeAfterComparison) {
    items.push({
      id: "impact-rec",
      category: "direct_impact",
      action: `Reschedule ${facts.beforeAfterComparison.activityTitle} from ${formatHourlyTime(
        facts.beforeAfterComparison.baselineTime,
        facts.locationTimezone
      )} to ${formatHourlyTime(facts.beforeAfterComparison.optimizedTime, facts.locationTimezone)}`,
      whyItHelps: facts.beforeAfterComparison.justification,
      beneficiary: "Household respiratory health",
      impactType: "lower_exposure",
      evidenceFactId: facts.beforeAfterComparison.activityId,
    });
  } else {
    items.push({
      id: "impact-rec",
      category: "direct_impact",
      action: "Keep the earliest schedule slot when moving adds no forecast PM₂.₅ benefit, and avoid strenuous exertion during peak hours",
      whyItHelps: "Heavy exertion raises deep-lung breathing volume during elevated ambient PM₂.₅ concentration.",
      beneficiary: "Household cardiopulmonary health",
      impactType: "lower_exposure",
    });
  }

  return {
    summary: `Verified activity schedule for ${facts.locationTimezone}: prioritizes hours with lower duration-weighted mean forecast PM₂.₅, preserves fixed commitments, and separates outdoor concentration from emissions estimates.`,
    items,
    cautionNotes: [
      "Forecast PM₂.₅ concentrations can shift with local wind changes. Personal inhaled dose depends on exertion and indoor/cabin filtration.",
    ],
  };
}

/**
 * Calls Gemini API with structured output and verified factual inputs,
 * attempting primary and retry models confirmed available to the project,
 * parsing and validating inside the retry loop, keeping the abort timer active
 * until the response body has been read, and enforcing an overall deadline.
 * Falls back gracefully to deterministic facts if unconfigured, invalid, or timed out.
 */
export async function generatePlan(
  input: PlanInput,
  facts: PlanFacts,
  apiKey?: string,
  overallTimeoutMs: number = 35000,
  requestId?: string,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<PlanGenerationResult> {
  const reqId = requestId || crypto.randomUUID();
  const key = apiKey || process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const retryModel = primaryModel === "gemini-3.5-flash-lite" ? "gemini-flash-lite-latest" : "gemini-3.5-flash-lite";

  if (!key || key === "your-gemini-api-key") {
    console.log(
      `[plan:${reqId}] Plan result: status=deterministic_fallback, modelUsed=none, reason=missing_key`
    );
    return {
      status: "deterministic_fallback",
      modelUsed: null,
      narrative: buildDeterministicNarrative(input, facts),
      fallbackReason: "missing_key",
    };
  }

  const validActivityIds = facts.activities.map((a) => a.id);

  const prompt = `You are an expert urban environmental health planner.
Based ONLY on the verified factual inputs below, generate practical, concise qualitative household guidance and trade-off explanations.

Facts:
${JSON.stringify(facts, null, 2)}

User preferences:
${JSON.stringify(input, null, 2)}

Strict output contract:
1. You MUST include recommendations in ALL FOUR categories: "routine", "indoor", "transport", and "direct_impact".
2. NEVER invent clock times, dates, PM2.5 numbers, AQI values, percentages, or CO2 kg savings. Leave numeric claims and clock times to the application; focus your free-text guidance on clear qualitative actions, mechanisms, beneficiaries, and household trade-offs.
3. Keep concentration vs dose honest: any percent difference compares outdoor forecast PM2.5 concentration across the full activity duration; personal inhaled dose requires unmeasured factors. Do not claim a single household changes citywide AQI or mention unverified morning inversions or underground platforms.
4. Category-appropriate evidenceFactId rules:
   - Only "routine" and "direct_impact" items may set evidenceFactId, and ONLY to an ID from: ${JSON.stringify(validActivityIds)}.
   - "indoor" and "transport" items MUST omit evidenceFactId.
5. Indoor constraint: hasAirPurifier is ${Boolean(input.household?.hasAirPurifier)} and budget is "${input.budget || "medium"}". If hasAirPurifier is false, NEVER tell the user to run or turn on their air purifier; recommend budget-appropriate low-cost measures instead.
6. Transport constraint: primary mode is "${input.transport?.mode || "car"}", availableTransportModes is ${JSON.stringify(input.availableTransportModes || ["car", "transit", "walk", "bike", "ev"])}, and estimatedCo2KgSaved is ${facts.transportComparison?.estimatedCo2KgSaved ?? null}. If 'transit' is NOT available, NEVER suggest public transit, bus, metro, or rail. If primary mode is "none", acknowledge no travel is needed. Never assume an open carpool seat, safe walking route, or avoided trip exists.
7. Return JSON matching the schema.`;

  const modelsToTry = [primaryModel, retryModel];
  const overallDeadline = Date.now() + overallTimeoutMs;
  let lastFallbackReason: "provider_error" | "invalid_output" | ValidationFailureReason = "provider_error";

  let attempt = 0;
  for (const currentModel of modelsToTry) {
    attempt++;
    const remainingMs = overallDeadline - Date.now();
    if (remainingMs <= 20) {
      console.log(
        `[plan:${reqId}] Overall request deadline reached (${remainingMs}ms remaining), falling back to deterministic plan`
      );
      break;
    }
    const modelsRemaining = modelsToTry.length - (attempt - 1);
    const attemptBudget = modelsRemaining > 1 ? Math.floor(remainingMs / modelsRemaining) : remainingMs;
    const attemptTimeout = Math.min(10000, Math.max(50, attemptBudget));
    const startTime = new Date().toISOString();
    const t0 = Date.now();

    const controller = new AbortController();
    let headersReceived = false;
    let timedOutPhase: "before_headers" | "reading_body" | null = null;

    const timeoutId = setTimeout(() => {
      timedOutPhase = headersReceived ? "reading_body" : "before_headers";
      controller.abort();
    }, attemptTimeout);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            responseSchema: {
              type: "OBJECT",
              properties: {
                summary: { type: "STRING" },
                items: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: { type: "STRING" },
                      category: {
                        type: "STRING",
                        enum: ["routine", "indoor", "transport", "direct_impact"],
                      },
                      action: { type: "STRING" },
                      whyItHelps: { type: "STRING" },
                      beneficiary: { type: "STRING" },
                      impactType: {
                        type: "STRING",
                        enum: ["lower_exposure", "lower_emissions", "health_protection"],
                      },
                      evidenceFactId: {
                        type: "STRING",
                      },
                    },
                    required: ["id", "category", "action", "whyItHelps", "beneficiary", "impactType"],
                  },
                },
                cautionNotes: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["summary", "items"],
            },
          },
        }),
        signal: controller.signal,
      });

      headersReceived = true;

      let rawText: string;
      if (typeof res.text === "function") {
        rawText = await res.text();
      } else if (typeof res.json === "function") {
        const jsonBody = await res.json();
        rawText = typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody);
      } else {
        rawText = "";
      }

      clearTimeout(timeoutId);
      const elapsedMs = Date.now() - t0;

      if (!res.ok) {
        let googleErrorStatus: string | undefined;
        try {
          const errData = JSON.parse(rawText);
          googleErrorStatus = errData?.error?.status;
        } catch {
          // ignore error body parse failure
        }

        console.log(
          `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=http_error status=${res.status}${googleErrorStatus ? ` googleStatus=${googleErrorStatus}` : ""}`
        );
        lastFallbackReason = "provider_error";

        const hasNextAttempt = attempt < modelsToTry.length && overallDeadline - Date.now() > 1000;
        if ((res.status === 503 || res.status === 429) && hasNextAttempt) {
          const backoffMs = Math.min(1500, Math.max(0, overallDeadline - Date.now() - 500));
          if (backoffMs > 0) {
            await sleepFn(backoffMs);
          }
        }
        continue;
      }

      let parsedJson: unknown;
      try {
        const data = JSON.parse(rawText);
        const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textPart) {
          console.log(
            `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=empty_output`
          );
          lastFallbackReason = "invalid_output";
          continue;
        }
        parsedJson = JSON.parse(textPart);
      } catch {
        console.log(
          `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=invalid_output`
        );
        lastFallbackReason = "invalid_output";
        continue;
      }

      // Validate candidate output inside retry loop with full household and transport constraints
      const valResult = validatePlanNarrative(parsedJson, facts, input);
      if (!valResult.success) {
        console.log(
          `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=validation_error reason=${valResult.reason}`
        );
        lastFallbackReason = valResult.reason;
        continue;
      }

      console.log(
        `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=success`
      );
      console.log(
        `[plan:${reqId}] Plan result: status=gemini_generated, modelUsed=${currentModel}, reason=none`
      );

      return {
        status: "gemini_generated",
        modelUsed: currentModel,
        narrative: valResult.narrative,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const elapsedMs = Date.now() - t0;
      const isAbort = (err as { name?: string })?.name === "AbortError" || timedOutPhase !== null;

      if (isAbort && timedOutPhase) {
        console.log(
          `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=timeout phase=${timedOutPhase}`
        );
      } else {
        console.log(
          `[plan:${reqId}] Attempt ${attempt} (${currentModel}) start=${startTime} elapsed=${elapsedMs}ms outcome=network_error`
        );
      }
      lastFallbackReason = "provider_error";
    }
  }

  console.log(
    `[plan:${reqId}] Plan result: status=deterministic_fallback, modelUsed=none, reason=${lastFallbackReason}`
  );

  return {
    status: "deterministic_fallback",
    modelUsed: null,
    narrative: buildDeterministicNarrative(input, facts),
    fallbackReason: lastFallbackReason,
  };
}
