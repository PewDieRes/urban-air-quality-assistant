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

  it("leaves a second errand unscheduled if only one hour fits", () => {
    const at = "2026-11-18T10:00:00Z";
    const forecast: Forecast = { lat: 0, lon: 0, timeZone: "UTC", source: "Open-Meteo",
      current: null, hourly: [{at, pm25: 40, usAqi: 95}] };
    const activities = ["Groceries", "Walk"].map(title => ({title, id: title, windowStart: at,
      windowEnd: "2026-11-18T11:00:00Z", durationMinutes: 60}));
    const result = computePlanFacts({ activities }, forecast);
    expect(result.activities[0].bestCandidate?.at).toBe(at);
    expect(result.activities[1].bestCandidate).toBeNull();
    expect(result.activities[1].reason).toContain("Unscheduled");
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
    // Must not contain unverified inversion claim
    expect(facts.indoorRecommendations.join(" ").toLowerCase()).not.toContain("inversion");
  });

  // PART A: Duration-weighted mean ranking tests
  it("loses when lowest start hour has higher full 2-hour duration mean PM2.5", () => {
    const forecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T10:00:00Z", pm25: 40, usAqi: 112 },  // Lowest start hr, followed by spike
        { at: "2026-11-18T11:00:00Z", pm25: 140, usAqi: 195 }, // (40+140)/2 = 90
        { at: "2026-11-18T12:00:00Z", pm25: 60, usAqi: 154 },  // (60+60)/2 = 60 -> WINNER
        { at: "2026-11-18T13:00:00Z", pm25: 60, usAqi: 154 },
      ],
    };

    const facts = computePlanFacts(
      {
        activities: [
          {
            id: "act-2hr",
            title: "Grocery shopping",
            windowStart: "2026-11-18T10:00:00Z",
            windowEnd: "2026-11-18T14:00:00Z",
            durationMinutes: 120,
          },
        ],
      },
      forecast
    );

    const act = facts.activities[0];
    expect(act.bestCandidate?.at).toBe("2026-11-18T12:00:00Z");
    expect(act.bestCandidate?.durationMeanPm25).toBe(60);
    expect(act.bestCandidate?.startHourPm25).toBe(60);
    expect(act.bestCandidate?.rankingMetric).toBe("duration_weighted_mean_pm25");

    // Baseline (10:00) also uses duration mean (90) vs optimized (60) -> 33% lower
    expect(facts.beforeAfterComparison?.metric).toBe("duration_weighted_mean_pm25");
    expect(facts.beforeAfterComparison?.baselineTime).toBe("2026-11-18T10:00:00Z");
    expect(facts.beforeAfterComparison?.baselinePm25).toBe(90);
    expect(facts.beforeAfterComparison?.baselineStartHourPm25).toBe(40);
    expect(facts.beforeAfterComparison?.optimizedPm25).toBe(60);
    expect(facts.beforeAfterComparison?.concentrationReductionPercent).toBe(33);
  });

  it("computes 60m + 30m weighted mean for 90-minute activity", () => {
    const forecast: Forecast = {
      lat: 0,
      lon: 0,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T10:00:00Z", pm25: 40, usAqi: 100 },  // 10:00->11:30: (40*60 + 100*30)/90 = 60
        { at: "2026-11-18T11:00:00Z", pm25: 100, usAqi: 174 }, // 11:00->12:30: (100*60 + 60*30)/90 = 86.67
        { at: "2026-11-18T12:00:00Z", pm25: 60, usAqi: 154 },  // 12:00->13:30: (60*60 + 30*30)/90 = 50 -> WINNER
        { at: "2026-11-18T13:00:00Z", pm25: 30, usAqi: 90 },
      ],
    };

    const facts = computePlanFacts(
      {
        activities: [
          {
            id: "act-90",
            title: "Outdoor market",
            windowStart: "2026-11-18T10:00:00Z",
            windowEnd: "2026-11-18T14:00:00Z",
            durationMinutes: 90,
          },
        ],
      },
      forecast
    );

    const act = facts.activities[0];
    expect(act.eligibleCandidates).toHaveLength(3); // 13:00 exceeds 14:00
    expect(act.eligibleCandidates[0].durationMeanPm25).toBeCloseTo(60, 4);
    expect(act.eligibleCandidates[1].durationMeanPm25).toBeCloseTo(86.6667, 3);
    expect(act.bestCandidate?.at).toBe("2026-11-18T12:00:00Z");
    expect(act.bestCandidate?.durationMeanPm25).toBeCloseTo(50, 4);
    expect(act.bestCandidate?.startHourPm25).toBe(60);
    // (60 - 50) / 60 = 16.67% -> 17%
    expect(facts.beforeAfterComparison?.concentrationReductionPercent).toBe(17);
  });

  it("rejects candidates spanning a missing middle hour (null or absent)", () => {
    const forecastWithNull: Forecast = {
      lat: 0,
      lon: 0,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T10:00:00Z", pm25: 40, usAqi: 100 },
        { at: "2026-11-18T11:00:00Z", pm25: null, usAqi: null }, // Missing middle hour
        { at: "2026-11-18T12:00:00Z", pm25: 60, usAqi: 154 },
        { at: "2026-11-18T13:00:00Z", pm25: 60, usAqi: 154 },
        { at: "2026-11-18T14:00:00Z", pm25: 90, usAqi: 169 },
      ],
    };

    const facts = computePlanFacts(
      {
        activities: [
          {
            id: "act-gap",
            title: "Grocery trip",
            windowStart: "2026-11-18T10:00:00Z",
            windowEnd: "2026-11-18T15:00:00Z",
            durationMinutes: 120,
          },
        ],
      },
      forecastWithNull
    );

    const times = facts.activities[0].eligibleCandidates.map((c) => c.at);
    expect(times).not.toContain("2026-11-18T10:00:00Z");
    expect(times).not.toContain("2026-11-18T11:00:00Z");
    expect(times).toEqual(["2026-11-18T12:00:00Z", "2026-11-18T13:00:00Z"]);
    expect(facts.activities[0].bestCandidate?.at).toBe("2026-11-18T12:00:00Z");

    // Also reject when middle hour entry is omitted from array completely
    const forecastOmittedGap: Forecast = {
      ...forecastWithNull,
      hourly: forecastWithNull.hourly.filter((h) => h.at !== "2026-11-18T11:00:00Z"),
    };
    const factsOmitted = computePlanFacts(
      {
        activities: [
          {
            id: "act-gap",
            title: "Grocery trip",
            windowStart: "2026-11-18T10:00:00Z",
            windowEnd: "2026-11-18T15:00:00Z",
            durationMinutes: 120,
          },
        ],
      },
      forecastOmittedGap
    );
    expect(factsOmitted.activities[0].eligibleCandidates.map((c) => c.at)).toEqual([
      "2026-11-18T12:00:00Z",
      "2026-11-18T13:00:00Z",
    ]);
  });

  it("handles tied duration means with earliest tie-breaking and unchanged earliest slot", () => {
    const tiedForecast: Forecast = {
      lat: 0,
      lon: 0,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T10:00:00Z", pm25: 50, usAqi: 130 }, // 10:00 2h mean = (50+70)/2 = 60
        { at: "2026-11-18T11:00:00Z", pm25: 70, usAqi: 158 }, // 11:00 2h mean = (70+80)/2 = 75
        { at: "2026-11-18T12:00:00Z", pm25: 80, usAqi: 164 }, // 12:00 2h mean = (80+40)/2 = 60 -> TIES WITH 10:00!
        { at: "2026-11-18T13:00:00Z", pm25: 40, usAqi: 112 },
      ],
    };

    const facts = computePlanFacts(
      {
        activities: [
          {
            id: "act-tie",
            title: "Grocery trip",
            windowStart: "2026-11-18T10:00:00Z",
            windowEnd: "2026-11-18T14:00:00Z",
            durationMinutes: 120,
          },
        ],
      },
      tiedForecast
    );

    expect(facts.activities[0].bestCandidate?.at).toBe("2026-11-18T10:00:00Z");
    expect(facts.activities[0].isEarliestAlreadyBest).toBe(true);
    expect(facts.activities[0].tiedCandidates?.map((t) => t.at)).toEqual(["2026-11-18T12:00:00Z"]);
    expect(facts.beforeAfterComparison).toBeNull();
  });

  it("rejects candidate near end of forecast coverage lacking final portion", () => {
    const endForecast: Forecast = {
      lat: 0,
      lon: 0,
      timeZone: "UTC",
      source: "Open-Meteo",
      current: null,
      hourly: [
        { at: "2026-11-18T18:00:00Z", pm25: 70, usAqi: 158 }, // 18:00->19:30 covered (70*60 + 50*30)/90 = 63.33
        { at: "2026-11-18T19:00:00Z", pm25: 50, usAqi: 130 }, // 19:00->20:30 missing 20:00->20:30!
      ],
    };

    const facts = computePlanFacts(
      {
        activities: [
          {
            id: "act-end",
            title: "Grocery trip",
            windowStart: "2026-11-18T18:00:00Z",
            windowEnd: "2026-11-18T21:00:00Z",
            durationMinutes: 90,
          },
        ],
      },
      endForecast
    );

    expect(facts.activities[0].eligibleCandidates.map((c) => c.at)).toEqual([
      "2026-11-18T18:00:00Z",
    ]);
    expect(facts.activities[0].bestCandidate?.at).toBe("2026-11-18T18:00:00Z");
  });

  // PART B: Honest transport emission savings tests
  it("omits numeric CO2 savings for car user when transit is unselected and no carpool/avoided-km inputs exist", () => {
    const forecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "Asia/Kolkata",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 80, usAqi: 164 }],
    };

    // Even when walk/bike/ev are checked and distance is known, NO automatic 50% saving!
    const facts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "car", distanceKm: 8 },
        availableTransportModes: ["car", "walk", "bike", "ev"],
      },
      forecast
    );

    expect(facts.transportComparison).not.toBeNull();
    expect(facts.transportComparison?.estimatedCo2KgSaved).toBeNull();
    expect(facts.transportComparison?.units).toBeNull();
    expect(facts.transportComparison?.impactType).toBe("qualitative_guidance");
    expect(facts.transportComparison?.missingInputs).toContain(
      "carpool occupancy or avoided vehicle distance"
    );
  });

  it("handles explicitly empty alternatives list without assuming transit or carpool", () => {
    const forecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "Asia/Kolkata",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 80, usAqi: 164 }],
    };

    const facts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "car", distanceKm: 10 },
        availableTransportModes: [],
      },
      forecast
    );

    expect(facts.transportComparison?.estimatedCo2KgSaved).toBeNull();
    expect(facts.transportComparison?.missingInputs).toContain("available alternative travel mode");
    expect(facts.transportComparison?.explanation.toLowerCase()).not.toContain("metro");
    expect(facts.transportComparison?.explanation.toLowerCase()).not.toContain("50%");
  });

  it("identifies missing trip distance when car user has unknown distance", () => {
    const forecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "Asia/Kolkata",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 80, usAqi: 164 }],
    };

    const facts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "car" },
        availableTransportModes: ["transit"],
      },
      forecast
    );

    expect(facts.transportComparison?.estimatedCo2KgSaved).toBeNull();
    expect(facts.transportComparison?.missingInputs).toContain("trip distance (km)");
    expect(facts.transportComparison?.explanation).toContain("trip distance (km) is missing");
  });

  it("produces verifiable numeric CO2e estimate with full primary-source metadata for supported car-to-transit comparison", () => {
    const forecast: Forecast = {
      lat: 28.6139,
      lon: 77.209,
      timeZone: "Asia/Kolkata",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 80, usAqi: 164 }],
    };

    const facts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "car", distanceKm: 10 },
        availableTransportModes: ["car", "transit"],
      },
      forecast
    );

    // 10 * (0.16725 - 0.03549) = 1.3176 -> 1.32 kg CO2e
    expect(facts.transportComparison?.estimatedCo2KgSaved).toBe(1.32);
    expect(facts.transportComparison?.units).toBe("kg CO₂e");
    expect(facts.transportComparison?.factorMetadata?.publication).toContain("DESNZ");
    expect(facts.transportComparison?.factorMetadata?.year).toBe(2024);
    expect(facts.transportComparison?.factorMetadata?.unit).toBe("kg CO₂e/passenger-km");
    expect(facts.transportComparison?.factorMetadata?.isOutsideReferenceGeography).toBe(true);
    expect(facts.transportComparison?.explanation).toContain("does not measurably change city AQI");
  });

  it("separates carpool occupancy (passenger-km) from avoided vehicle-km and removes transit platform claims", () => {
    const forecast: Forecast = {
      lat: 35.6762,
      lon: 139.6503,
      timeZone: "Asia/Tokyo",
      source: "Open-Meteo",
      current: null,
      hourly: [{ at: "2026-11-18T10:00:00Z", pm25: 25, usAqi: 75 }],
    };

    const carpoolFacts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "car", distanceKm: 10, carpoolOccupancy: 2 },
        availableTransportModes: ["car"],
      },
      forecast
    );
    expect(carpoolFacts.transportComparison?.factorMetadata?.unit).toBe("kg CO₂e/passenger-km");
    // 10 * 0.16725 * (1 - 1/2) = 0.83625 -> 0.84 kg CO2e per person
    expect(carpoolFacts.transportComparison?.estimatedCo2KgSaved).toBe(0.84);

    const avoidedFacts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "car", distanceKm: 10, avoidedVehicleKm: 4 },
        availableTransportModes: ["car"],
      },
      forecast
    );
    expect(avoidedFacts.transportComparison?.factorMetadata?.unit).toBe("kg CO₂e/vehicle-km");
    // 4 * 0.16725 = 0.669 -> 0.67 kg CO2e
    expect(avoidedFacts.transportComparison?.estimatedCo2KgSaved).toBe(0.67);

    const transitUserFacts = computePlanFacts(
      {
        activities: [],
        transport: { mode: "transit", distanceKm: 10 },
      },
      forecast
    );
    expect(transitUserFacts.transportComparison?.explanation.toLowerCase()).not.toContain("platform");
    expect(transitUserFacts.transportComparison?.explanation.toLowerCase()).not.toContain("minimizes underground");
  });
});
