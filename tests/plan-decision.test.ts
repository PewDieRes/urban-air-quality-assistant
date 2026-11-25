import { describe, it, expect } from "vitest";
import { derivePlanDecision } from "@/lib/plan/decision";
import { PlanFacts } from "@/lib/plan/types";

const baseFacts: PlanFacts = {
  activities: [],
  fixedCommitments: [],
  transportComparison: null,
  beforeAfterComparison: null,
  indoorRecommendations: [],
  generatedAt: "2026-11-18T10:00:00Z",
  locationTimezone: "Asia/Kolkata",
};

describe("derivePlanDecision", () => {
  it("returns null when facts is null or undefined", () => {
    expect(derivePlanDecision(null)).toBeNull();
    expect(derivePlanDecision(undefined)).toBeNull();
  });

  it("handles empty activities array", () => {
    const facts: PlanFacts = {
      ...baseFacts,
      activities: [],
    };
    const decision = derivePlanDecision(facts, "Asia/Kolkata");
    expect(decision).toEqual({
      headline: "No activities scheduled",
      explanation: "Add a flexible activity to find the lowest-pollution hour.",
    });
  });

  it("handles activity with no eligible slot and a fixed commitment", () => {
    const facts: PlanFacts = {
      ...baseFacts,
      activities: [
        {
          id: "act-1",
          title: "Grocery shopping",
          durationMinutes: 60,
          bestCandidate: null,
          eligibleCandidates: [],
          reason: "No slot available",
        },
      ],
      fixedCommitments: [
        {
          id: "fix-1",
          title: "School pickup",
          start: "2026-11-18T09:30:00.000Z",
          end: "2026-11-18T10:00:00.000Z",
        },
      ],
    };
    const decision = derivePlanDecision(facts, "Asia/Kolkata");
    expect(decision?.headline).toBe("No eligible slot for Grocery shopping");
    expect(decision?.explanation).toContain("School pickup stays at 3 PM");
    expect(decision?.explanation).toContain(
      "No available slot with complete forecast coverage fits your activity around it"
    );
  });

  it("handles activity with no eligible slot without fixed commitments", () => {
    const facts: PlanFacts = {
      ...baseFacts,
      activities: [
        {
          id: "act-1",
          title: "Jogging",
          durationMinutes: 60,
          bestCandidate: null,
          eligibleCandidates: [],
          reason: "No slot available",
        },
      ],
      fixedCommitments: [],
    };
    const decision = derivePlanDecision(facts, "Asia/Kolkata");
    expect(decision?.headline).toBe("No eligible slot for Jogging");
    expect(decision?.explanation).toBe(
      "No available slot with complete forecast coverage fits your activity duration. Try widening your time window."
    );
  });

  it("states plainly when moving adds no forecast benefit (isEarliestAlreadyBest)", () => {
    const facts: PlanFacts = {
      ...baseFacts,
      activities: [
        {
          id: "act-1",
          title: "Grocery shopping",
          durationMinutes: 60,
          isEarliestAlreadyBest: true,
          bestCandidate: {
            at: "2026-11-18T10:30:00.000Z",
            pm25: 42,
            startHourPm25: 42,
            durationMeanPm25: 42,
            rankingMetric: "duration_weighted_mean_pm25",
            usAqi: 110,
          },
          eligibleCandidates: [],
          reason: "Earliest slot already optimal",
        },
      ],
      fixedCommitments: [
        {
          id: "fix-1",
          title: "School pickup",
          start: "2026-11-18T09:30:00.000Z",
          end: "2026-11-18T10:00:00.000Z",
        },
      ],
    };
    const decision = derivePlanDecision(facts, "Asia/Kolkata");
    expect(decision?.headline).toBe("Keep your original time: Buy groceries at 4 PM");
    expect(decision?.explanation).toContain("School pickup stays at 3 PM.");
    expect(decision?.explanation).toContain("adds no forecast benefit");
    expect(decision?.explanation).toContain("lowest one-hour mean forecast PM₂.₅ (42 µg/m³)");
  });

  it("handles tied candidates explicitly using duration mean metric", () => {
    const facts: PlanFacts = {
      ...baseFacts,
      activities: [
        {
          id: "act-1",
          title: "Grocery shopping",
          durationMinutes: 90,
          bestCandidate: {
            at: "2026-11-18T10:30:00.000Z",
            pm25: 50,
            startHourPm25: 50,
            durationMeanPm25: 53.33,
            rankingMetric: "duration_weighted_mean_pm25",
            usAqi: 125,
          },
          tiedCandidates: [
            {
              at: "2026-11-18T12:30:00.000Z",
              pm25: 50,
              startHourPm25: 60,
              durationMeanPm25: 53.33,
              rankingMetric: "duration_weighted_mean_pm25",
              usAqi: 125,
            },
          ],
          eligibleCandidates: [],
          reason: "Tied slots",
        },
      ],
    };
    const decision = derivePlanDecision(facts, "Asia/Kolkata");
    expect(decision?.headline).toBe("Buy groceries at 4 PM");
    expect(decision?.explanation).toBe(
      "Both 4 PM and 6 PM tie for the lowest 90-minute mean forecast PM₂.₅ (53.3 µg/m³)."
    );
  });

  it("handles rescheduled lower-pollution hour separating outdoor concentration from personal dose", () => {
    const facts: PlanFacts = {
      ...baseFacts,
      activities: [
        {
          id: "act-1",
          title: "Grocery shopping",
          durationMinutes: 120,
          bestCandidate: {
            at: "2026-11-18T12:30:00.000Z",
            pm25: 35,
            startHourPm25: 30,
            durationMeanPm25: 35,
            rankingMetric: "duration_weighted_mean_pm25",
            usAqi: 95,
          },
          eligibleCandidates: [],
          reason: "Lower pollution slot",
        },
      ],
      fixedCommitments: [
        {
          id: "fix-1",
          title: "School pickup",
          start: "2026-11-18T09:30:00.000Z",
          end: "2026-11-18T10:00:00.000Z",
        },
      ],
      beforeAfterComparison: {
        activityId: "act-1",
        activityTitle: "Grocery shopping",
        metric: "duration_weighted_mean_pm25",
        baselineTime: "2026-11-18T10:30:00.000Z",
        baselinePm25: 90,
        optimizedTime: "2026-11-18T12:30:00.000Z",
        optimizedPm25: 35,
        concentrationReductionPercent: 61,
        exposureReductionPercent: 61,
        justification: "Shift to lower concentration",
      },
    };
    const decision = derivePlanDecision(facts, "Asia/Kolkata");
    expect(decision?.headline).toBe("Buy groceries at 6 PM");
    expect(decision?.explanation).toContain("School pickup stays at 3 PM.");
    expect(decision?.explanation).toContain(
      "120-minute mean forecast PM₂.₅ is 35 µg/m³ at 6 PM, vs 90 µg/m³ at 4 PM (61% lower outdoor forecast concentration; personal inhaled dose is not measured)."
    );
  });
});
