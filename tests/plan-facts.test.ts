import { describe, it, expect } from "vitest";
import { computePlanFacts } from "@/lib/plan/facts";
import { PlanInput, PlanFacts } from "@/lib/plan/types";
import { Forecast } from "@/lib/forecast/types";

describe("plan facts calculation", () => {
  it("keepsFixedPickupAndChoosesValidLaterHour: keeps school pickup at 3:00 PM, schedules 1-hr grocery between 4:00 and 8:00 PM, 6:00 PM best, 8:00 PM ineligible", () => {
    // Forecast across 14:00 to 21:00 UTC (assume UTC for instant math)
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: { at: "2026-11-18T14:00:00Z", pm25: 130, usAqi: 190 },
      hourly: [
        { at: "2026-11-18T14:00:00Z", pm25: 130, usAqi: 190 },
        { at: "2026-11-18T15:00:00Z", pm25: 125, usAqi: 187 }, // 3:00 PM: Fixed pickup hour
        { at: "2026-11-18T16:00:00Z", pm25: 120, usAqi: 184 }, // 4:00 PM: Eligible (ends 17:00 <= 20:00)
        { at: "2026-11-18T17:00:00Z", pm25: null, usAqi: null }, // 5:00 PM: Missing data, ineligible
        { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },  // 6:00 PM: Eligible (ends 19:00 <= 20:00) - BEST!
        { at: "2026-11-18T19:00:00Z", pm25: 110, usAqi: 178 }, // 7:00 PM: Eligible (ends 20:00 <= 20:00)
        { at: "2026-11-18T20:00:00Z", pm25: 130, usAqi: 190 }, // 8:00 PM: INELIGIBLE (60m ends 21:00 > 20:00)
        { at: "2026-11-18T21:00:00Z", pm25: 140, usAqi: 195 },
      ],
    };

    const input: PlanInput = {
      activities: [
        {
          id: "act-grocery",
          title: "Grocery trip",
          windowStart: "2026-11-18T16:00:00Z", // 4:00 PM
          windowEnd: "2026-11-18T20:00:00Z",   // 8:00 PM
          durationMinutes: 60,
        },
      ],
      fixedCommitments: [
        {
          id: "fix-pickup",
          title: "School pickup",
          start: "2026-11-18T15:00:00Z", // 3:00 PM
          end: "2026-11-18T15:30:00Z",
        },
      ],
    };

    const facts: PlanFacts = computePlanFacts(input, mockForecast);

    // 1. Fixed commitment is preserved at 3:00 PM
    expect(facts.fixedCommitments).toHaveLength(1);
    expect(facts.fixedCommitments[0].title).toBe("School pickup");
    expect(facts.fixedCommitments[0].start).toBe("2026-11-18T15:00:00Z");

    // 2. Activity facts
    const groceryFacts = facts.activities.find((a) => a.id === "act-grocery");
    expect(groceryFacts).toBeDefined();

    // 17:00 is null (missing data)
    // 20:00 (8:00 PM) is ineligible because 1-hr duration ends at 21:00, exceeding the 20:00 window end!
    // Eligible valid candidates: 16:00 (120), 18:00 (80), 19:00 (110)
    expect(groceryFacts?.eligibleCandidates.length).toBe(3);
    const candidateTimes = groceryFacts?.eligibleCandidates.map((c) => c.at);
    expect(candidateTimes).toContain("2026-11-18T16:00:00Z");
    expect(candidateTimes).toContain("2026-11-18T18:00:00Z");
    expect(candidateTimes).toContain("2026-11-18T19:00:00Z");
    expect(candidateTimes).not.toContain("2026-11-18T20:00:00Z"); // 8:00 PM trip is strictly ineligible

    // Best candidate is 6:00 PM (18:00, PM2.5 = 80)
    expect(groceryFacts?.bestCandidate?.at).toBe("2026-11-18T18:00:00Z");
    expect(groceryFacts?.bestCandidate?.pm25).toBe(80);

    // Reason uses exact phrase "lower forecast PM₂.₅"
    expect(groceryFacts?.reason).toContain("lower forecast PM₂.₅");

    // 3. Before-and-after comparison
    expect(facts.beforeAfterComparison).not.toBeNull();
    expect(facts.beforeAfterComparison?.baselineTime).toBe("2026-11-18T16:00:00Z");
    expect(facts.beforeAfterComparison?.optimizedTime).toBe("2026-11-18T18:00:00Z");
    expect(facts.beforeAfterComparison?.exposureReductionPercent).toBeGreaterThan(0);

    // 4. No emission quantity without transport inputs
    expect(facts.transportComparison).toBeNull();
  });

  it("prevents multi-activity overlaps across single schedule", () => {
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T16:00:00Z", pm25: 120, usAqi: 184 },
        { at: "2026-11-18T17:00:00Z", pm25: 110, usAqi: 178 },
        { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },  // Best for Activity 1
        { at: "2026-11-18T19:00:00Z", pm25: 85, usAqi: 167 },  // Best remaining for Activity 2
      ],
    };

    const input: PlanInput = {
      activities: [
        {
          id: "act-1",
          title: "Grocery run",
          windowStart: "2026-11-18T16:00:00Z",
          windowEnd: "2026-11-18T20:00:00Z",
          durationMinutes: 60,
        },
        {
          id: "act-2",
          title: "Gym session",
          windowStart: "2026-11-18T16:00:00Z",
          windowEnd: "2026-11-18T20:00:00Z",
          durationMinutes: 60,
        },
      ],
    };

    const facts = computePlanFacts(input, mockForecast);
    const act1 = facts.activities[0];
    const act2 = facts.activities[1];

    expect(act1.bestCandidate?.at).toBe("2026-11-18T18:00:00Z");
    // Act 2 cannot take 18:00 because Act 1 is already scheduled there!
    expect(act2.bestCandidate?.at).toBe("2026-11-18T19:00:00Z");
  });

  it("evExampleClaimsZeroCo2SavedAndCategorizesAsExposureReduction", () => {
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 50, usAqi: 90 }],
    };

    const input: PlanInput = {
      activities: [
        {
          id: "act-drive",
          title: "Errand",
          windowStart: "2026-11-18T10:00:00Z",
          windowEnd: "2026-11-18T12:00:00Z",
          durationMinutes: 30,
        },
      ],
      transport: {
        mode: "ev",
        distanceKm: 20,
      },
    };

    const facts = computePlanFacts(input, mockForecast);
    expect(facts.transportComparison).not.toBeNull();
    // EV cabin recirculation must claim 0 kg CO2 saved
    expect(facts.transportComparison?.estimatedCo2KgSaved).toBe(0);
    expect(facts.transportComparison?.impactType).toBe("lower_exposure");
    expect(facts.transportComparison?.units).toBe("kg CO₂e");
    expect(facts.transportComparison?.factorSource).toBeDefined();
    expect(facts.transportComparison?.assumptions).toBeDefined();
  });

  it("tailors indoor advice for low budget households without purifier", () => {
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 50, usAqi: 90 }],
    };

    const input: PlanInput = {
      activities: [],
      budget: "low",
      household: {
        hasAirPurifier: false,
        sensitiveMembers: true,
      },
    };

    const facts = computePlanFacts(input, mockForecast);
    const lowCostTip = facts.indoorRecommendations.find((tip) =>
      tip.toLowerCase().includes("low-budget") || tip.toLowerCase().includes("draft") || tip.toLowerCase().includes("damp towels")
    );
    expect(lowCostTip).toBeDefined();
    const sensitiveTip = facts.indoorRecommendations.find((tip) =>
      tip.toLowerCase().includes("sensitive") || tip.toLowerCase().includes("children")
    );
    expect(sensitiveTip).toBeDefined();
  });
});
