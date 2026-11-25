import { PlanFacts, PlanInput, TransportMode } from "../types";

const DEFAULT_AVAILABLE_MODES: readonly TransportMode[] = ["car", "transit", "walk", "bike", "ev"];

export const GEMINI_NARRATIVE_RESPONSE_SCHEMA = {
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
} as const;

/**
 * Builds the grounded JSON instruction prompt passed to Gemini.
 */
export function buildPlannerPrompt(input: PlanInput, facts: PlanFacts): string {
  const validActivityIds = facts.activities.map((activity) => activity.id);
  const primaryTransportMode = input.transport?.mode || "car";
  const availableTransportModes = input.availableTransportModes || DEFAULT_AVAILABLE_MODES;
  const hasAirPurifier = Boolean(input.household?.hasAirPurifier);
  const budgetTier = input.budget || "medium";
  const estimatedCo2KgSaved = facts.transportComparison?.estimatedCo2KgSaved ?? null;

  return `You are an expert urban environmental health planner.
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
5. Indoor constraint: hasAirPurifier is ${hasAirPurifier} and budget is "${budgetTier}". If hasAirPurifier is false, NEVER tell the user to run or turn on their air purifier; recommend budget-appropriate low-cost measures instead.
6. Transport constraint: primary mode is "${primaryTransportMode}", availableTransportModes is ${JSON.stringify(availableTransportModes)}, and estimatedCo2KgSaved is ${estimatedCo2KgSaved}. If 'transit' is NOT available, NEVER suggest public transit, bus, metro, or rail. If primary mode is "none", acknowledge no travel is needed. Never assume an open carpool seat, safe walking route, or avoided trip exists.
7. Return JSON matching the schema.`;
}
