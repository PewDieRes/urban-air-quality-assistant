import { describe, it, expect } from "vitest";
import { computePlanFacts } from "@/lib/plan/facts";
import { PlanInput, PlanFacts } from "@/lib/plan/types";
import { Forecast } from "@/lib/forecast/types";

describe("plan facts calculation", () => {
  it("keepsFixedPickupAndChoosesValidLaterHour: preserves fixed commitments, avoids overlapping slots, selects lowest valid PM2.5 hour, and yields no emission quantity without inputs", () => {
    // Forecast across 14:00 to 21:00 UTC (assume UTC for test simplicity)
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: { at: "2026-11-18T14:00:00Z", pm25: 130, usAqi: 190 },
      hourly: [
        { at: "2026-11-18T14:00:00Z", pm25: 130, usAqi: 190 },
        { at: "2026-11-18T15:00:00Z", pm25: 125, usAqi: 187 }, // Fixed pickup hour
        { at: "2026-11-18T16:00:00Z", pm25: 120, usAqi: 184 },
        { at: "2026-11-18T17:00:00Z", pm25: null, usAqi: null }, // Missing value
        { at: "2026-11-18T18:00:00Z", pm25: 80, usAqi: 164 },  // Best candidate!
        { at: "2026-11-18T19:00:00Z", pm25: 110, usAqi: 178 },
        { at: "2026-11-18T20:00:00Z", pm25: 130, usAqi: 190 },
      ],
    };

    const input: PlanInput = {
      activities: [
        {
          id: "act-grocery",
          title: "Grocery trip",
          windowStart: "2026-11-18T16:00:00Z",
          windowEnd: "2026-11-18T20:00:00Z",
          durationMinutes: 60,
        },
      ],
      fixedCommitments: [
        {
          id: "fix-pickup",
          title: "School pickup",
          start: "2026-11-18T15:00:00Z",
          end: "2026-11-18T15:30:00Z",
        },
      ],
      // No transport distance or mode provided: must NOT invent an emission quantity
    };

    const facts: PlanFacts = computePlanFacts(input, mockForecast);

    // 1. Fixed commitment is preserved
    expect(facts.fixedCommitments).toHaveLength(1);
    expect(facts.fixedCommitments[0].title).toBe("School pickup");
    expect(facts.fixedCommitments[0].start).toBe("2026-11-18T15:00:00Z");

    // 2. Activity facts
    const groceryFacts = facts.activities.find((a) => a.id === "act-grocery");
    expect(groceryFacts).toBeDefined();

    // 17:00 has null PM2.5 so it is not eligible as a valid measured candidate
    // Eligible valid candidates: 16:00 (120), 18:00 (80), 19:00 (110), 20:00 (130)
    expect(groceryFacts?.eligibleCandidates.length).toBe(4);

    // Best candidate is 18:00 (PM2.5 = 80)
    expect(groceryFacts?.bestCandidate?.at).toBe("2026-11-18T18:00:00Z");
    expect(groceryFacts?.bestCandidate?.pm25).toBe(80);

    // 3. No emission quantity without necessary inputs
    expect(facts.transportComparison).toBeNull();
  });

  it("excludes candidate hours that overlap with fixed commitments", () => {
    const mockForecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T15:00:00Z", pm25: 40, usAqi: 80 }, // Lower PM2.5, but conflicts with fixed pickup!
        { at: "2026-11-18T16:00:00Z", pm25: 60, usAqi: 110 },
      ],
    };

    const input: PlanInput = {
      activities: [
        {
          id: "act-walk",
          title: "Outdoor walk",
          windowStart: "2026-11-18T15:00:00Z",
          windowEnd: "2026-11-18T17:00:00Z",
          durationMinutes: 60,
        },
      ],
      fixedCommitments: [
        {
          id: "fix-meeting",
          title: "Doctor appointment",
          start: "2026-11-18T15:00:00Z",
          end: "2026-11-18T15:45:00Z",
        },
      ],
    };

    const facts = computePlanFacts(input, mockForecast);
    const walkFacts = facts.activities[0];

    // 15:00 conflicts with the doctor appointment, so only 16:00 is eligible
    expect(walkFacts.eligibleCandidates.length).toBe(1);
    expect(walkFacts.bestCandidate?.at).toBe("2026-11-18T16:00:00Z");
  });

  it("calculates defensible transport comparisons when distance and modes are provided", () => {
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
          id: "act-commute",
          title: "Office commute",
          windowStart: "2026-11-18T10:00:00Z",
          windowEnd: "2026-11-18T11:00:00Z",
          durationMinutes: 30,
        },
      ],
      transport: {
        mode: "car",
        distanceKm: 15,
      },
    };

    const facts = computePlanFacts(input, mockForecast);
    expect(facts.transportComparison).not.toBeNull();
    // 15 km car trip: ~0.17 kg CO2/km = ~2.55 kg CO2 vs metro/transit ~0.04 kg CO2/km
    expect(facts.transportComparison?.estimatedCo2KgSaved).toBeGreaterThan(1.0);
    expect(facts.transportComparison?.suggestedMode).toMatch(/transit|metro/i);
  });
});
