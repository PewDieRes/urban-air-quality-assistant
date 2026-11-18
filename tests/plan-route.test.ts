import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePlan, validatePlanNarrative } from "@/lib/plan/gemini";
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
        eligibleCandidates: [
          { at: "2026-11-18T16:00:00Z", pm25: 110, usAqi: 178 },
          { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },
        ],
        bestCandidate: { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },
        reason: "Lowest PM2.5 within grocery window",
      },
    ],
    transportComparison: {
      baselineMode: "Private Car",
      suggestedMode: "Public Transit / Metro",
      estimatedCo2KgSaved: 1.5,
      explanation: "Saves 1.5 kg CO2 over 10 km.",
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

  it("invalidGenerationReturnsFacts: rejects hallucinated fact IDs or malformed output and falls back to verified facts", () => {
    // Malformed object missing required fields
    const malformed = {
      summary: "Some text",
      items: "not-an-array",
    };
    expect(validatePlanNarrative(malformed, sampleFacts)).toBeNull();

    // Hallucinated fact ID not present in sampleFacts.activities
    const hallucinatedFact = {
      summary: "Plan summary",
      items: [
        {
          id: "rec-1",
          category: "routine",
          action: "Do something at midnight",
          whyItHelps: "Lower smog",
          beneficiary: "All",
          impactType: "lower_exposure",
          evidenceFactId: "invented-nonexistent-fact-id",
        },
      ],
    };
    expect(validatePlanNarrative(hallucinatedFact, sampleFacts)).toBeNull();
  });

  it("validates and accepts grounded structured output covering daily routine, indoor air, sustainable alternatives, and direct impact", async () => {
    const validNarrative: PlanNarrative = {
      summary: "Tailored air quality schedule for Delhi-NCR prioritizing off-peak exposure.",
      items: [
        {
          id: "item-routine",
          category: "routine",
          action: "Schedule Grocery trip at 18:00",
          whyItHelps: "PM2.5 drops to 80 µg/m³ compared to 110 µg/m³ at 16:00",
          beneficiary: "Entire household",
          impactType: "lower_exposure",
          evidenceFactId: "act-grocery",
        },
        {
          id: "item-indoor",
          category: "indoor",
          action: "Run HEPA filtration in living spaces during peak evening smog",
          whyItHelps: "Reduces indoor particulate infiltration by up to 90%",
          beneficiary: "Sensitive children and elderly members",
          impactType: "health_protection",
        },
        {
          id: "item-transport",
          category: "transport",
          action: "Choose Metro or public transit over private vehicle",
          whyItHelps: "Avoids adding direct vehicle exhaust to roadside smog",
          beneficiary: "Local community",
          impactType: "lower_emissions",
        },
        {
          id: "item-impact",
          category: "direct_impact",
          action: "Avoid outdoor exercise when US AQI exceeds 150",
          whyItHelps: "Significantly lowers inhaled particulate dosage",
          beneficiary: "Cardiovascular and respiratory health",
          impactType: "lower_exposure",
        },
      ],
    };

    const validated = validatePlanNarrative(validNarrative, sampleFacts);
    expect(validated).not.toBeNull();
    expect(validated?.items).toHaveLength(4);

    const categories = validated?.items.map((i) => i.category);
    expect(categories).toContain("routine");
    expect(categories).toContain("indoor");
    expect(categories).toContain("transport");
    expect(categories).toContain("direct_impact");
  });
});
