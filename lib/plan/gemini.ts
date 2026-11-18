import { z } from "zod";
import { PlanInput, PlanFacts, PlanNarrative, PlanNarrativeItem } from "./types";

const NarrativeItemSchema = z.object({
  id: z.string(),
  category: z.enum(["routine", "indoor", "transport", "direct_impact"]),
  action: z.string().min(3),
  whyItHelps: z.string().min(3),
  beneficiary: z.string().min(2),
  impactType: z.enum(["lower_exposure", "lower_emissions", "health_protection"]),
  evidenceFactId: z.string().optional(),
});

const PlanNarrativeSchema = z.object({
  summary: z.string().min(5),
  items: z.array(NarrativeItemSchema).min(1),
  cautionNotes: z.array(z.string()).optional(),
});

/**
 * Validates generated JSON against schema and verifies that any referenced evidenceFactId
 * exists within the computed PlanFacts (guarding strictly against hallucinated IDs).
 */
export function validatePlanNarrative(raw: unknown, facts: PlanFacts): PlanNarrative | null {
  const result = PlanNarrativeSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }

  const validFactIds = new Set<string>([
    ...facts.activities.map((a) => a.id),
    ...facts.fixedCommitments.map((f) => f.id),
  ]);

  for (const item of result.data.items) {
    if (item.evidenceFactId && !validFactIds.has(item.evidenceFactId)) {
      // Reject hallucinated or fabricated fact reference
      return null;
    }
  }

  return result.data;
}

/**
 * Deterministic fallback narrative constructed strictly from verified facts.
 */
export function buildDeterministicNarrative(input: PlanInput, facts: PlanFacts): PlanNarrative {
  const items: PlanNarrativeItem[] = [];

  // 1. Routine items for activities
  facts.activities.forEach((act, idx) => {
    if (act.bestCandidate) {
      items.push({
        id: `routine-${act.id}`,
        category: "routine",
        action: `Conduct ${act.title} at ${new Date(act.bestCandidate.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        whyItHelps: act.reason,
        beneficiary: input.household?.sensitiveMembers ? "Vulnerable household members" : "General household",
        impactType: "lower_exposure",
        evidenceFactId: act.id,
      });
    }
  });

  // 2. Indoor air recommendations
  facts.indoorRecommendations.forEach((rec, idx) => {
    items.push({
      id: `indoor-${idx}`,
      category: "indoor",
      action: rec,
      whyItHelps: "Prevents fine particulate matter (PM2.5) from infiltrating indoor breathing zones.",
      beneficiary: input.household?.sensitiveMembers ? "Children, elderly, and asthmatic members" : "All occupants",
      impactType: "health_protection",
    });
  });

  // 3. Transport alternative
  if (facts.transportComparison) {
    items.push({
      id: "transport-rec",
      category: "transport",
      action: `Opt for ${facts.transportComparison.suggestedMode}`,
      whyItHelps: facts.transportComparison.explanation,
      beneficiary: "Local airshed and commuter",
      impactType: "lower_emissions",
    });
  }

  // 4. Direct impact recommendation
  items.push({
    id: "impact-rec",
    category: "direct_impact",
    action: "Avoid vigorous outdoor aerobic exercise during peak smog hours",
    whyItHelps: "Strenuous breathing dramatically increases deep-lung particulate deposition during poor air quality.",
    beneficiary: "Cardiopulmonary health",
    impactType: "lower_exposure",
  });

  return {
    summary: `Verified activity schedule for ${facts.locationTimezone}: prioritizes off-peak windows to minimize personal exposure and avoids fixed commitments.`,
    items,
    cautionNotes: [
      "Smog levels can shift rapidly with local wind stagnation. Check hourly updates before prolonged outdoor exposure.",
    ],
  };
}

/**
 * Calls Gemini API to generate a grounded explanation of the deterministic facts.
 */
export async function generatePlan(
  input: PlanInput,
  facts: PlanFacts,
  apiKey?: string
): Promise<PlanNarrative> {
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (!key || key === "your-gemini-api-key") {
    // Graceful deterministic generation when key is unconfigured
    return buildDeterministicNarrative(input, facts);
  }

  const prompt = `You are an expert urban environmental health planner.
Based ONLY on the verified factual inputs below, generate a grounded, structured plan narrative for the household.

Facts:
${JSON.stringify(facts, null, 2)}

User preferences:
${JSON.stringify(input, null, 2)}

Strict rules:
1. Cover daily routine, indoor air, sustainable alternatives, and direct impact.
2. DO NOT invent hours, dates, or measurements not present in facts.
3. Every recommendation MUST clearly distinguish lowering personal exposure from lowering vehicle/community emissions.
4. If an evidenceFactId is provided, it must match one of the activity IDs in facts.
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      console.warn("Gemini API call returned status:", res.status);
      return buildDeterministicNarrative(input, facts);
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return buildDeterministicNarrative(input, facts);
    }

    const parsedJson = JSON.parse(candidateText);
    const validated = validatePlanNarrative(parsedJson, facts);
    if (!validated) {
      console.warn("Gemini output failed schema validation or hallucinated fact IDs. Using verified fallback.");
      return buildDeterministicNarrative(input, facts);
    }

    return validated;
  } catch (error) {
    console.warn("Gemini generation failed, falling back to deterministic facts:", error);
    return buildDeterministicNarrative(input, facts);
  }
}
