import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generatePlan,
  validatePlanNarrative,
  validateAndSanitizePlanNarrative,
  buildDeterministicNarrative,
} from "@/lib/plan/gemini";
import { PlanInput, PlanFacts, PlanNarrative } from "@/lib/plan/types";

describe("grounded plan generation and validation", () => {
  const sampleFacts: PlanFacts = {
    locationTimezone: "Asia/Kolkata",
    generatedAt: "2026-11-18T10:00:00Z",
    fixedCommitments: [
      {
        id: "fix-pickup",
        title: "School pickup",
        start: "2026-11-18T15:00:00Z",
        end: "2026-11-18T15:30:00Z",
      },
    ],
    activities: [
      {
        id: "act-grocery",
        title: "Grocery trip",
        durationMinutes: 60,
        eligibleCandidates: [
          { at: "2026-11-18T16:00:00Z", pm25: 110, usAqi: 178 },
          { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },
        ],
        bestCandidate: { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },
        reason: "Optimal slot at 2026-11-18T18:00:00Z with lower forecast PM₂.₅ (80 µg/m³)",
      },
    ],
    transportComparison: {
      baselineMode: "Private Petrol/Diesel Car",
      suggestedMode: "Public Transit / Metro",
      distanceKm: 10,
      estimatedCo2KgSaved: 1.3,
      units: "kg CO₂e",
      factorSource: "Regional DEFRA factors",
      assumptions: "Car 0.17 vs Transit 0.04 kg CO2e/km",
      isEstimate: true,
      impactType: "both",
      explanation: "Saves 1.3 kg CO₂e over 10 km.",
    },
    beforeAfterComparison: {
      activityId: "act-grocery",
      activityTitle: "Grocery trip",
      baselineTime: "2026-11-18T16:00:00Z",
      baselinePm25: 110,
      optimizedTime: "2026-11-18T18:00:00Z",
      optimizedPm25: 80,
      exposureReductionPercent: 27,
      justification: "Rescheduling achieves 27% lower particulate exposure",
    },
    indoorRecommendations: [
      "Operate HEPA air purifier on medium/high during evening peak hours.",
    ],
  };

  const sampleInput: PlanInput = {
    activities: [
      {
        id: "act-grocery",
        title: "Grocery trip",
        windowStart: "2026-11-18T16:00:00Z",
        windowEnd: "2026-11-18T20:00:00Z",
        durationMinutes: 60,
      },
    ],
    household: {
      sensitiveMembers: true,
      hasAirPurifier: true,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("inventedTimeOrMeasurementNeverAppears: sanitizes model hallucination and strictly renders application ground truth", () => {
    // Model output uses valid fact ID 'act-grocery', but invents '3:00 AM' and '15 µg/m³'
    const hallucinatedRaw = {
      summary: "Household smog action plan for evening.",
      items: [
        {
          id: "rec-routine",
          category: "routine",
          action: "Do grocery trip at 3:00 AM with invented PM2.5 of 15 µg/m³",
          whyItHelps: "Very low smog in the dead of night",
          beneficiary: "All occupants",
          impactType: "lower_exposure",
          evidenceFactId: "act-grocery",
        },
        {
          id: "rec-indoor",
          category: "indoor",
          action: "Keep bedroom air purifier running on high",
          whyItHelps: "Reduces PM2.5 penetration",
          beneficiary: "Sensitive occupants",
          impactType: "health_protection",
        },
        {
          id: "rec-transport",
          category: "transport",
          action: "Take Delhi Metro instead of driving car",
          whyItHelps: "Lowers personal exposure and tailpipe emissions",
          beneficiary: "Commuters",
          impactType: "lower_emissions",
        },
        {
          id: "rec-impact",
          category: "direct_impact",
          action: "Reschedule heavy aerobic workout indoors",
          whyItHelps: "Reduces deep alveolar particulate deposition",
          beneficiary: "All",
          impactType: "lower_exposure",
        },
      ],
    };

    const sanitized = validateAndSanitizePlanNarrative(hallucinatedRaw, sampleFacts);
    expect(sanitized).not.toBeNull();

    const routineItem = sanitized?.items.find((i) => i.category === "routine");
    expect(routineItem).toBeDefined();

    // The invented text must NEVER appear
    expect(routineItem?.action).not.toContain("3:00 AM");
    expect(routineItem?.action).not.toContain("15 µg/m³");

    // The verified application facts MUST appear instead (18:00 UTC = 11:30 PM in Asia/Kolkata, PM2.5 = 80 µg/m³)
    expect(routineItem?.action).toContain("11:30 PM");
    expect(routineItem?.action).toContain("80 µg/m³");
    expect(routineItem?.whyItHelps).toContain("lower forecast PM₂.₅");
  });

  it("distinguishes invalid_structure error when response does not match JSON schema", () => {
    const invalidStructure = {
      summary: "Too short", // valid string, but items missing required fields
      items: [
        {
          id: "rec-1",
          // missing category, action, whyItHelps, beneficiary, impactType
        },
      ],
    };

    const result = validatePlanNarrative(invalidStructure, sampleFacts);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid_structure");
    }
  });

  it("distinguishes missing_categories when not all 4 categories are present", () => {
    // Missing 'direct_impact' category
    const missingCategory = {
      summary: "Incomplete plan",
      items: [
        {
          id: "rec-1",
          category: "routine",
          action: "Grocery trip at verified hour",
          whyItHelps: "Low exposure",
          beneficiary: "All",
          impactType: "lower_exposure",
          evidenceFactId: "act-grocery",
        },
        {
          id: "rec-2",
          category: "indoor",
          action: "Run HEPA filter",
          whyItHelps: "Clean air",
          beneficiary: "All",
          impactType: "health_protection",
        },
        {
          id: "rec-3",
          category: "transport",
          action: "Use public metro",
          whyItHelps: "Zero car emissions",
          beneficiary: "Community",
          impactType: "lower_emissions",
        },
      ],
    };

    const result = validatePlanNarrative(missingCategory, sampleFacts);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("missing_categories");
    }
    expect(validateAndSanitizePlanNarrative(missingCategory, sampleFacts)).toBeNull();
  });

  it("distinguishes invalid_fact_id when referencing hallucinated fact IDs", () => {
    const hallucinatedFactId = {
      summary: "Plan summary",
      items: [
        {
          id: "rec-1",
          category: "routine",
          action: "Do something at midnight",
          whyItHelps: "Lower smog",
          beneficiary: "All",
          impactType: "lower_exposure",
          evidenceFactId: "fake-nonexistent-act-id",
        },
        {
          id: "rec-2",
          category: "indoor",
          action: "Run HEPA",
          whyItHelps: "Clean air",
          beneficiary: "All",
          impactType: "health_protection",
        },
        {
          id: "rec-3",
          category: "transport",
          action: "Use metro",
          whyItHelps: "Lower emissions",
          beneficiary: "All",
          impactType: "lower_emissions",
        },
        {
          id: "rec-4",
          category: "direct_impact",
          action: "Avoid exercise",
          whyItHelps: "Avoid lung stress",
          beneficiary: "All",
          impactType: "lower_exposure",
        },
      ],
    };

    const result = validatePlanNarrative(hallucinatedFactId, sampleFacts);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid_fact_id");
    }
    expect(validateAndSanitizePlanNarrative(hallucinatedFactId, sampleFacts)).toBeNull();
  });

  it("falls back to deterministic narrative with missing_categories reason", async () => {
    const missingCatJson = JSON.stringify({
      summary: "Missing direct impact category",
      items: [
        {
          id: "rec-1",
          category: "routine",
          action: "Grocery trip at verified hour",
          whyItHelps: "Low exposure",
          beneficiary: "All",
          impactType: "lower_exposure",
          evidenceFactId: "act-grocery",
        },
        {
          id: "rec-2",
          category: "indoor",
          action: "Run HEPA filter",
          whyItHelps: "Clean air",
          beneficiary: "All",
          impactType: "health_protection",
        },
        {
          id: "rec-3",
          category: "transport",
          action: "Use public metro",
          whyItHelps: "Zero car emissions",
          beneficiary: "Community",
          impactType: "lower_emissions",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: missingCatJson }] } }],
      }),
    });

    const result = await generatePlan(sampleInput, sampleFacts, "test-api-key");
    expect(result.status).toBe("deterministic_fallback");
    expect(result.fallbackReason).toBe("missing_categories");
  });

  it("falls back to deterministic narrative on upstream provider error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const result = await generatePlan(sampleInput, sampleFacts, "test-api-key");

    expect(result.status).toBe("deterministic_fallback");
    expect(result.fallbackReason).toBe("provider_error");
    expect(result.modelUsed).toBeNull();
    expect(result.narrative.items).toHaveLength(4);

    const categories = result.narrative.items.map((i) => i.category);
    expect(categories).toContain("routine");
    expect(categories).toContain("indoor");
    expect(categories).toContain("transport");
    expect(categories).toContain("direct_impact");
  });

  it("falls back to deterministic narrative on malformed output", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "This is not valid JSON {{{" }] } }],
      }),
    });

    const result = await generatePlan(sampleInput, sampleFacts, "test-api-key");

    expect(result.status).toBe("deterministic_fallback");
    expect(result.fallbackReason).toBe("invalid_output");
  });

  it("produces successful gemini_generated status when Gemini responds with valid structured JSON", async () => {
    const validJsonString = JSON.stringify({
      summary: "Verified personalized smog plan for family in Delhi.",
      items: [
        {
          id: "rec-routine",
          category: "routine",
          action: "Schedule Grocery trip at 11:30 PM",
          whyItHelps: "Lower forecast PM2.5 of 80 ug/m3",
          beneficiary: "Entire household",
          impactType: "lower_exposure",
          evidenceFactId: "act-grocery",
        },
        {
          id: "rec-indoor",
          category: "indoor",
          action: "Operate HEPA purifier on high in bedrooms",
          whyItHelps: "Prevents particulate infiltration",
          beneficiary: "Children and sensitive members",
          impactType: "health_protection",
        },
        {
          id: "rec-transport",
          category: "transport",
          action: "Switch commute to Delhi Metro",
          whyItHelps: "Saves 1.3 kg CO2e over 10 km",
          beneficiary: "Commuter and community",
          impactType: "lower_emissions",
        },
        {
          id: "rec-impact",
          category: "direct_impact",
          action: "Reschedule grocery trip to avoid peak evening smog",
          whyItHelps: "Cuts particulate exposure by 27%",
          beneficiary: "Family health",
          impactType: "lower_exposure",
        },
      ],
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: validJsonString }] } }],
      }),
    });

    const result = await generatePlan(sampleInput, sampleFacts, "test-api-key");

    expect(result.status).toBe("gemini_generated");
    expect(result.modelUsed).toBe(process.env.GEMINI_MODEL || "gemini-3.5-flash");
    const [url, options] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).not.toContain("key=");
    expect(new Headers(options?.headers).get("x-goog-api-key")).toBe("test-api-key");
    expect(result.narrative.items).toHaveLength(4);
  });
});
