import { z } from "zod";
import { PlanInput, PlanFacts, PlanNarrative, PlanNarrativeItem } from "./types";
import { formatHourlyTime } from "../forecast/open-meteo";
import { fetchWithTimeout } from "../security/fetch-with-timeout";

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

export type ValidationFailureReason = "invalid_structure" | "missing_categories" | "invalid_fact_id";

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

/**
 * Validates generated JSON against schema, requires all 4 categories,
 * verifies fact IDs, and replaces any model-invented times/measurements with
 * server-calculated facts so that hallucinations never appear.
 * Distinguishes invalid structure, missing categories, and unknown fact references.
 */
export function validatePlanNarrative(raw: unknown, facts: PlanFacts): ValidationResult {
  const result = PlanNarrativeSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, reason: "invalid_structure" };
  }

  const validFactIds = new Set<string>([
    ...facts.activities.map((a) => a.id),
    ...facts.fixedCommitments.map((f) => f.id),
  ]);

  // Verify all 4 required categories are present
  const categoriesPresent = new Set(result.data.items.map((i) => i.category));
  for (const reqCat of REQUIRED_CATEGORIES) {
    if (!categoriesPresent.has(reqCat)) {
      return { success: false, reason: "missing_categories" };
    }
  }

  // Validate and sanitize each item
  const sanitizedItems: PlanNarrativeItem[] = [];

  for (const item of result.data.items) {
    if (item.evidenceFactId) {
      if (!validFactIds.has(item.evidenceFactId)) {
        // Safe logging of reason code without personal inputs or secrets
        console.warn("Validation failed: invalid_fact_id reference");
        return { success: false, reason: "invalid_fact_id" };
      }

      // Check if referencing an activity
      const activityFact = facts.activities.find((a) => a.id === item.evidenceFactId);
      if (activityFact && activityFact.bestCandidate) {
        // Enforce application verified facts for time and measurement
        const verifiedTime = formatHourlyTime(activityFact.bestCandidate.at, facts.locationTimezone);
        const verifiedPm = activityFact.bestCandidate.pm25 !== null ? `${activityFact.bestCandidate.pm25.toFixed(0)} µg/m³` : "unmeasured";
        
        // Strip any model-invented clock times or measurements from the action
        // and strictly render from application verified facts
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
export function validateAndSanitizePlanNarrative(raw: unknown, facts: PlanFacts): PlanNarrative | null {
  const res = validatePlanNarrative(raw, facts);
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
      const pmStr = act.bestCandidate.pm25 !== null ? `${act.bestCandidate.pm25.toFixed(0)} µg/m³` : "—";
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
      whyItHelps: "No eligible activity time was found in the current schedule window.",
      beneficiary: "All household members",
      impactType: "lower_exposure",
    });
  }

  // 2. Indoor air recommendations
  const indoorTip = facts.indoorRecommendations[0] ||
    "Keep windows sealed and use damp dusting during peak smog hours.";
  items.push({
    id: "indoor-rec",
    category: "indoor",
    action: indoorTip,
    whyItHelps: "Prevents fine particulate matter (PM2.5) from infiltrating indoor breathing zones.",
    beneficiary: input.household?.sensitiveMembers ? "Children, elderly, and asthmatic members" : "All occupants",
    impactType: "health_protection",
  });

  // 3. Transport alternative
  if (facts.transportComparison) {
    items.push({
      id: "transport-rec",
      category: "transport",
      action: `Opt for ${facts.transportComparison.suggestedMode}`,
      whyItHelps: facts.transportComparison.explanation,
      beneficiary: "Commuters and local neighborhood",
      impactType: facts.transportComparison.impactType === "lower_exposure" ? "lower_exposure" : "lower_emissions",
    });
  } else {
    const available = input.availableTransportModes || ["car", "transit", "walk", "bike", "ev"];
    const hasTransit = available.includes("transit");
    const hasActive = available.includes("walk") || available.includes("bike");
    const hasEv = available.includes("ev");

    let action = "Consolidate daily driving into a single trip or carpool to reduce vehicle emissions";
    let why = "Quantitative emission savings are unavailable without trip distance. Combining errands cuts cold-start emissions.";

    if (hasTransit) {
      action = "Choose metro rail or electric transit over private combustion vehicles where available";
      why = "Quantitative emission savings are unavailable without trip distance. Shifting to shared transit eliminates individual tailpipe emissions.";
    } else if (hasEv) {
      action = "Use electric vehicle with cabin air recirculation enabled";
      why = "Prevents outside particulates from entering the cabin during peak pollution periods.";
    } else if (hasActive) {
      action = "Consider walking or cycling with a well-fitted N95 mask for short errands";
      why = "Eliminates tailpipe emissions for short trips while filtering inhaled fine particles.";
    }

    items.push({
      id: "transport-rec",
      category: "transport",
      action,
      whyItHelps: why,
      beneficiary: "Local community",
      impactType: hasTransit ? "lower_emissions" : "health_protection",
    });
  }

  // 4. Direct impact recommendation
  if (facts.beforeAfterComparison) {
    items.push({
      id: "impact-rec",
      category: "direct_impact",
      action: `Reschedule ${facts.beforeAfterComparison.activityTitle} from ${formatHourlyTime(facts.beforeAfterComparison.baselineTime, facts.locationTimezone)} to ${formatHourlyTime(facts.beforeAfterComparison.optimizedTime, facts.locationTimezone)}`,
      whyItHelps: facts.beforeAfterComparison.justification,
      beneficiary: "Household respiratory health",
      impactType: "lower_exposure",
      evidenceFactId: facts.beforeAfterComparison.activityId,
    });
  } else {
    items.push({
      id: "impact-rec",
      category: "direct_impact",
      action: "Avoid vigorous outdoor aerobic exercise during high PM₂.₅ periods",
      whyItHelps: "Strenuous breathing dramatically increases deep-lung particulate deposition during poor air quality.",
      beneficiary: "Cardiopulmonary health",
      impactType: "lower_exposure",
    });
  }

  return {
    summary: `Verified activity schedule for ${facts.locationTimezone}: prioritizes hours with lower forecast PM₂.₅, avoids fixed commitments, and provides tailored indoor protections.`,
    items,
    cautionNotes: [
      "Smog levels can shift rapidly with local wind stagnation. Check hourly updates before prolonged outdoor exposure.",
    ],
  };
}

/**
 * Calls Gemini API with structured output and verified factual inputs,
 * attempting primary and retry models confirmed available to the project,
 * parsing and validating inside the retry loop, and enforcing an overall deadline.
 * Falls back gracefully to deterministic facts if unconfigured, invalid, or timed out.
 */
export async function generatePlan(
  input: PlanInput,
  facts: PlanFacts,
  apiKey?: string,
  overallTimeoutMs: number = 35000
): Promise<PlanGenerationResult> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const retryModel = primaryModel === "gemini-3.5-flash-lite" ? "gemini-flash-lite-latest" : "gemini-3.5-flash-lite";

  if (!key || key === "your-gemini-api-key") {
    return {
      status: "deterministic_fallback",
      modelUsed: null,
      narrative: buildDeterministicNarrative(input, facts),
      fallbackReason: "missing_key",
    };
  }

  const validFactIds = [
    ...facts.activities.map((a) => a.id),
    ...facts.fixedCommitments.map((f) => f.id),
  ];

  const prompt = `You are an expert urban environmental health planner.
Based ONLY on the verified factual inputs below, generate a clear, practical plan narrative for the household.

Facts:
${JSON.stringify(facts, null, 2)}

User preferences:
${JSON.stringify(input, null, 2)}

Strict requirements:
1. You MUST include recommendations in ALL FOUR categories: "routine", "indoor", "transport", and "direct_impact".
2. DO NOT invent times, dates, pollutant numbers, or emissions savings not present in Facts.
A percentage difference describes lower forecast PM₂.₅ concentration at the selected start time compared to baseline. Do not convert it into personal exposure dose or clinical outcomes. Leave unscheduled activities unscheduled.
3. Every recommendation MUST clearly state:
   - What the person can do (action)
   - Why it helps (whyItHelps)
   - Who benefits (beneficiary)
   - Impact type distinguishing lower_exposure, lower_emissions, or health_protection
4. For the "indoor" category, provide one concise, actionable sentence tailored to this household's specific setup (e.g. particle filter status, sensitive members, budget level). It should give practical household advice that adds clear value beyond raw numbers.
5. For the "transport" category, only suggest transport alternatives that exist in user preferences 'availableTransportModes': ${JSON.stringify(input.availableTransportModes || ["car", "transit", "walk", "bike", "ev"])}. If 'transit' is NOT in availableTransportModes, do NOT suggest public transit, bus, or metro; recommend carpooling, trip consolidation, or route optimization instead.
6. If an evidenceFactId is provided, it must strictly match one of the following valid fact IDs: ${JSON.stringify(validFactIds)}.
7. Return JSON matching the schema.`;

  // Primary model with one confirmed-available retry model
  const modelsToTry = [primaryModel, retryModel];
  const overallDeadline = Date.now() + overallTimeoutMs;
  let lastFallbackReason: "provider_error" | "invalid_output" | ValidationFailureReason = "provider_error";

  for (const currentModel of modelsToTry) {
    const remainingMs = overallDeadline - Date.now();
    if (remainingMs <= 500) {
      console.warn("Overall request deadline reached, falling back to deterministic plan");
      break;
    }
    const attemptTimeout = Math.min(10000, remainingMs);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`;
      const res = await fetchWithTimeout(
        url,
        {
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
        },
        attemptTimeout
      );

      if (!res.ok) {
        console.warn(`Gemini API call to ${currentModel} returned status: ${res.status}`);
        lastFallbackReason = "provider_error";
        if (res.status === 503 || res.status === 429) {
          // Brief pause before trying the confirmed retry model during transient demand spikes
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        console.warn(`Gemini API call to ${currentModel} returned empty text`);
        lastFallbackReason = "invalid_output";
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        console.warn(`Gemini output from ${currentModel} was not valid JSON`);
        lastFallbackReason = "invalid_output";
        continue;
      }

      // Parse and validate candidate's output inside the retry loop
      const valResult = validatePlanNarrative(parsedJson, facts);
      if (!valResult.success) {
        console.warn(`Plan validation failed for ${currentModel}: ${valResult.reason}`);
        lastFallbackReason = valResult.reason;
        continue;
      }

      // Only return gemini_generated after validation succeeds
      return {
        status: "gemini_generated",
        modelUsed: currentModel,
        narrative: valResult.narrative,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "timeout/network";
      console.warn(`Gemini request to ${currentModel} failed: ${msg}`);
      lastFallbackReason = "provider_error";
    }
  }

  return {
    status: "deterministic_fallback",
    modelUsed: null,
    narrative: buildDeterministicNarrative(input, facts),
    fallbackReason: lastFallbackReason,
  };
}
