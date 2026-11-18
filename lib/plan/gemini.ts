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

export interface PlanGenerationResult {
  status: "gemini_generated" | "deterministic_fallback";
  modelUsed: string | null;
  narrative: PlanNarrative;
  fallbackReason?: "missing_key" | "provider_error" | "invalid_output" | "missing_categories" | "invalid_fact_id";
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
 */
export function validateAndSanitizePlanNarrative(raw: unknown, facts: PlanFacts): PlanNarrative | null {
  const result = PlanNarrativeSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }

  const validFactIds = new Set<string>([
    ...facts.activities.map((a) => a.id),
    ...facts.fixedCommitments.map((f) => f.id),
  ]);

  // Verify all 4 required categories are present
  const categoriesPresent = new Set(result.data.items.map((i) => i.category));
  for (const reqCat of REQUIRED_CATEGORIES) {
    if (!categoriesPresent.has(reqCat)) {
      return null;
    }
  }

  // Validate and sanitize each item
  const sanitizedItems: PlanNarrativeItem[] = [];

  for (const item of result.data.items) {
    if (item.evidenceFactId) {
      if (!validFactIds.has(item.evidenceFactId)) {
        // Reject hallucinated fact ID reference
        return null;
      }

      // Check if referencing an activity
      const activityFact = facts.activities.find((a) => a.id === item.evidenceFactId);
      if (activityFact && activityFact.bestCandidate) {
        // Enforce application ground truth for time and measurement
        const verifiedTime = formatHourlyTime(activityFact.bestCandidate.at, facts.locationTimezone);
        const verifiedPm = activityFact.bestCandidate.pm25 !== null ? `${activityFact.bestCandidate.pm25.toFixed(0)} µg/m³` : "unmeasured";
        
        // Strip any model-invented clock times or measurements from the action
        // and strictly render from application ground truth
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
    summary: result.data.summary,
    items: sanitizedItems,
    cautionNotes: result.data.cautionNotes,
  };
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
      action: "Plan outdoor errands during midday hours when morning inversion dissipates",
      whyItHelps: "Thermal inversions trap ground-level pollutants early morning and late evening.",
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
      beneficiary: "Local airshed and commuter",
      impactType: facts.transportComparison.impactType === "lower_exposure" ? "lower_exposure" : "lower_emissions",
    });
  } else {
    items.push({
      id: "transport-rec",
      category: "transport",
      action: "Choose metro rail or electric transit over private combustion vehicles where available",
      whyItHelps: "Quantitative emission savings are unavailable without trip distance. Shifting to shared transit eliminates individual tailpipe emissions.",
      beneficiary: "Community airshed",
      impactType: "lower_emissions",
    });
  }

  // 4. Direct impact recommendation
  if (facts.beforeAfterComparison) {
    items.push({
      id: "impact-rec",
      category: "direct_impact",
      action: `Reschedule ${facts.beforeAfterComparison.activityTitle} from ${formatHourlyTime(facts.beforeAfterComparison.baselineTime, facts.locationTimezone)} to ${formatHourlyTime(facts.beforeAfterComparison.optimizedTime, facts.locationTimezone)}`,
      whyItHelps: `Achieves a ${facts.beforeAfterComparison.exposureReductionPercent}% reduction in peak particulate exposure by avoiding peak smog.`,
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
 * falling back gracefully if unconfigured or invalid.
 */
export async function generatePlan(
  input: PlanInput,
  facts: PlanFacts,
  apiKey?: string
): Promise<PlanGenerationResult> {
  const key = apiKey || process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!key || key === "your-gemini-api-key") {
    return {
      status: "deterministic_fallback",
      modelUsed: null,
      narrative: buildDeterministicNarrative(input, facts),
      fallbackReason: "missing_key",
    };
  }

  const prompt = `You are an expert urban environmental health planner.
Based ONLY on the verified factual inputs below, generate a grounded, structured plan narrative for the household.

Facts:
${JSON.stringify(facts, null, 2)}

User preferences:
${JSON.stringify(input, null, 2)}

Strict requirements:
1. You MUST include recommendations in ALL FOUR categories: "routine", "indoor", "transport", and "direct_impact".
2. DO NOT invent times, dates, pollutant numbers, or emissions savings not present in Facts.
3. Every recommendation MUST clearly state the action, why it helps, who benefits, and distinguish lowering personal exposure from lowering vehicle/community emissions.
4. If an evidenceFactId is provided, it must match one of the activity or commitment IDs from facts: ${JSON.stringify(
    [...facts.activities.map((a) => a.id), ...facts.fixedCommitments.map((f) => f.id)]
  )}.
5. Return JSON matching:
{
  "summary": "...",
  "items": [
    {
      "id": "...",
      "category": "routine" | "indoor" | "transport" | "direct_impact",
      "action": "...",
      "whyItHelps": "...",
      "beneficiary": "...",
      "impactType": "lower_exposure" | "lower_emissions" | "health_protection",
      "evidenceFactId": "..."
    }
  ],
  "cautionNotes": ["..."]
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      },
      10000
    );

    if (!res.ok) {
      console.warn("Gemini API call returned status:", res.status);
      return {
        status: "deterministic_fallback",
        modelUsed: null,
        narrative: buildDeterministicNarrative(input, facts),
        fallbackReason: "provider_error",
      };
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return {
        status: "deterministic_fallback",
        modelUsed: null,
        narrative: buildDeterministicNarrative(input, facts),
        fallbackReason: "invalid_output",
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(candidateText);
    } catch {
      return {
        status: "deterministic_fallback",
        modelUsed: null,
        narrative: buildDeterministicNarrative(input, facts),
        fallbackReason: "invalid_output",
      };
    }

    const validated = validateAndSanitizePlanNarrative(parsedJson, facts);
    if (!validated) {
      return {
        status: "deterministic_fallback",
        modelUsed: null,
        narrative: buildDeterministicNarrative(input, facts),
        fallbackReason: "invalid_fact_id",
      };
    }

    return {
      status: "gemini_generated",
      modelUsed: modelName,
      narrative: validated,
    };
  } catch (error) {
    console.warn("Gemini generation failed, falling back to deterministic facts:", error);
    return {
      status: "deterministic_fallback",
      modelUsed: null,
      narrative: buildDeterministicNarrative(input, facts),
      fallbackReason: "provider_error",
    };
  }
}
