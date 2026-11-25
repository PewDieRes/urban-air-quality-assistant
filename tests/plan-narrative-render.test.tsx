import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanPanel } from "@/components/plan/plan-panel";
import type { Forecast } from "@/lib/forecast/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DISTINCTIVE_GEMINI_SENTENCE = "Run HEPA air purifier on high speed in the children's bedroom during peak evening hours.";

function createTestForecast(): Forecast {
  const start = Date.parse("2026-11-18T08:30:00Z");
  return {
    lat: 28.6139,
    lon: 77.209,
    timeZone: "Asia/Kolkata",
    source: "Open-Meteo",
    current: null,
    hourly: [90, 80, 70, 65, 35, 60, 80].map((pm25, i) => ({
      at: new Date(start + i * 3600000).toISOString(),
      pm25,
      usAqi: 100,
    })),
  };
}

it("renders distinctive validated Gemini sentence and badge on success", async () => {
  const forecast = createTestForecast();
  const mockPlanResponse = {
    status: "gemini_generated",
    modelUsed: "gemini-3-flash-preview",
    facts: {
      activities: [
        {
          id: "act-1",
          title: "Grocery shopping",
          durationMinutes: 60,
          bestCandidate: { at: "2026-11-18T12:30:00.000Z", pm25: 35, usAqi: 95 },
          eligibleCandidates: [],
          reason: "Lowest PM2.5 slot",
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
      indoorRecommendations: [
        "Operate HEPA air purifier on medium/high speed in primary living areas and bedrooms, keeping doors and windows sealed during forecast peak hours.",
      ],
      locationTimezone: "Asia/Kolkata",
    },
    narrative: {
      summary: "Prioritized lower pollution times for your household.",
      items: [
        {
          id: "routine-1",
          category: "routine",
          action: "Conduct Grocery shopping at 6:00 PM (lower forecast PM₂.₅: 35 µg/m³)",
          whyItHelps: "Available slot with lower pollution",
          beneficiary: "All members",
          impactType: "lower_exposure",
          evidenceFactId: "act-1",
        },
        {
          id: "indoor-rec",
          category: "indoor",
          action: DISTINCTIVE_GEMINI_SENTENCE,
          whyItHelps: "Reduces particle inhalation during evening stagnation.",
          beneficiary: "Children and sensitive members",
          impactType: "health_protection",
        },
        {
          id: "transport-rec",
          category: "transport",
          action: "Choose metro rail or electric transit over private combustion vehicles",
          whyItHelps: "Reduces tailpipe emissions",
          beneficiary: "Community",
          impactType: "lower_emissions",
        },
        {
          id: "direct-impact",
          category: "direct_impact",
          action: "Reschedule errands from 4 PM to 6 PM",
          whyItHelps: "Lowers exposure",
          beneficiary: "Family",
          impactType: "lower_exposure",
          evidenceFactId: "act-1",
        },
      ],
    },
  };

  const fetchPlan = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockPlanResponse,
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  const view = render(<PlanPanel {...props} />);

  fireEvent.change(screen.getByLabelText("Commitment start", { exact: true }), {
    target: { value: "2026-11-18T15:00" },
  });
  fireEvent.change(screen.getByLabelText("Commitment end", { exact: true }), {
    target: { value: "2026-11-18T15:30" },
  });
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T16:00" },
  });
  fireEvent.change(screen.getByLabelText("Activity end", { exact: true }), {
    target: { value: "2026-11-18T20:00" },
  });

  view.rerender(<PlanPanel {...props} forecast={{ ...forecast }} />);
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));

  await waitFor(() => expect(fetchPlan).toHaveBeenCalledTimes(1));

  // Assert distinctive Gemini sentence is rendered
  const distinctiveElement = await screen.findByText(DISTINCTIVE_GEMINI_SENTENCE);
  expect(distinctiveElement).toBeTruthy();

  // Assert badge "Explained by Gemini" is displayed beside the actual text
  expect(screen.getByText("Explained by Gemini")).toBeTruthy();
});

it("omits distinctive Gemini sentence on fallback and displays forecast-based plan label", async () => {
  const forecast = createTestForecast();
  const mockFallbackResponse = {
    status: "deterministic_fallback",
    modelUsed: null,
    fallbackReason: "provider_error",
  };

  const fetchPlan = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockFallbackResponse,
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  const view = render(<PlanPanel {...props} />);

  fireEvent.change(screen.getByLabelText("Commitment start", { exact: true }), {
    target: { value: "2026-11-18T15:00" },
  });
  fireEvent.change(screen.getByLabelText("Commitment end", { exact: true }), {
    target: { value: "2026-11-18T15:30" },
  });
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T16:00" },
  });
  fireEvent.change(screen.getByLabelText("Activity end", { exact: true }), {
    target: { value: "2026-11-18T20:00" },
  });

  view.rerender(<PlanPanel {...props} forecast={{ ...forecast }} />);
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));

  await waitFor(() => expect(fetchPlan).toHaveBeenCalledTimes(1));

  // Assert distinctive Gemini sentence is completely ABSENT on fallback
  expect(screen.queryByText(DISTINCTIVE_GEMINI_SENTENCE)).toBeNull();

  // Assert fallback label is visible
  expect(screen.getByText("Forecast-based plan")).toBeTruthy();

  // Assert the deterministic recommendation is shown instead
  expect(screen.getByText(/operate hepa air purifier/i)).toBeTruthy();
});

it("renders retry model's validated guidance and 'Explained by Gemini' badge when retry succeeds", async () => {
  const forecast = createTestForecast();
  const RETRY_MODEL_NAME = "gemini-3.5-flash-lite";
  const RETRY_GUIDANCE_SENTENCE = "Deploy portable particle filtration on low speed continuously throughout the afternoon.";

  const mockRetryPlanResponse = {
    status: "gemini_generated",
    modelUsed: RETRY_MODEL_NAME,
    facts: {
      activities: [
        {
          id: "act-1",
          title: "Grocery shopping",
          durationMinutes: 60,
          bestCandidate: { at: "2026-11-18T12:30:00.000Z", pm25: 35, usAqi: 95 },
          eligibleCandidates: [],
          reason: "Lowest PM2.5 slot",
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
      indoorRecommendations: [
        "Standard indoor advice.",
      ],
      locationTimezone: "Asia/Kolkata",
    },
    narrative: {
      summary: "Retry model generated smog protection plan.",
      items: [
        {
          id: "routine-1",
          category: "routine",
          action: "Conduct Grocery shopping at 6:00 PM (lower forecast PM₂.₅: 35 µg/m³)",
          whyItHelps: "Available slot with lower pollution",
          beneficiary: "All members",
          impactType: "lower_exposure",
          evidenceFactId: "act-1",
        },
        {
          id: "indoor-rec",
          category: "indoor",
          action: RETRY_GUIDANCE_SENTENCE,
          whyItHelps: "Reduces indoor exposure for family members during stagnation.",
          beneficiary: "All household occupants",
          impactType: "health_protection",
        },
        {
          id: "transport-rec",
          category: "transport",
          action: "Choose metro rail or electric transit",
          whyItHelps: "Reduces emissions",
          beneficiary: "Community",
          impactType: "lower_emissions",
        },
        {
          id: "direct-impact",
          category: "direct_impact",
          action: "Reschedule errands from 4 PM to 6 PM",
          whyItHelps: "Lowers exposure",
          beneficiary: "Family",
          impactType: "lower_exposure",
          evidenceFactId: "act-1",
        },
      ],
    },
  };

  const fetchPlan = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockRetryPlanResponse,
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  const view = render(<PlanPanel {...props} />);

  fireEvent.change(screen.getByLabelText("Commitment start", { exact: true }), {
    target: { value: "2026-11-18T15:00" },
  });
  fireEvent.change(screen.getByLabelText("Commitment end", { exact: true }), {
    target: { value: "2026-11-18T15:30" },
  });
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T16:00" },
  });
  fireEvent.change(screen.getByLabelText("Activity end", { exact: true }), {
    target: { value: "2026-11-18T20:00" },
  });

  view.rerender(<PlanPanel {...props} forecast={{ ...forecast }} />);
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));

  await waitFor(() => expect(fetchPlan).toHaveBeenCalledTimes(1));

  // Assert retry model's validated guidance is rendered in the UI
  const guidanceElement = await screen.findByText(RETRY_GUIDANCE_SENTENCE);
  expect(guidanceElement).toBeTruthy();

  // Assert badge "Explained by Gemini" is displayed
  expect(screen.getByText("Explained by Gemini")).toBeTruthy();
});

it("clears stale Gemini attribution immediately on second submission while second request is pending, and renders second result alone", async () => {
  const forecast = createTestForecast();
  const FIRST_GEMINI_SENTENCE = "Sentence 1: Run HEPA filter during the morning peak.";
  const SECOND_GEMINI_SENTENCE = "Sentence 2: Open windows briefly during early afternoon clean air window.";

  let resolveSecondPlan: ((val: unknown) => void) | null = null;
  const secondPlanPromise = new Promise((resolve) => {
    resolveSecondPlan = resolve;
  });

  let callCount = 0;
  const fetchPlan = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: "gemini_generated",
          modelUsed: "gemini-3.5-flash-lite",
          narrative: {
            summary: "Plan 1 summary",
            items: [
              {
                id: "rec-indoor-1",
                category: "indoor",
                action: FIRST_GEMINI_SENTENCE,
                whyItHelps: "Indoor protection 1",
                beneficiary: "All",
                impactType: "health_protection",
              },
            ],
          },
        }),
      });
    }
    // Second request is intentionally delayed
    return secondPlanPromise;
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  const view = render(<PlanPanel {...props} />);

  // First submission: 16:00 to 20:00
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T16:00" },
  });
  fireEvent.change(screen.getByLabelText("Activity end", { exact: true }), {
    target: { value: "2026-11-18T20:00" },
  });
  view.rerender(<PlanPanel {...props} forecast={{ ...forecast }} />);
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));

  // Wait for first plan to complete
  await screen.findByText(FIRST_GEMINI_SENTENCE);
  expect(screen.getByText("Explained by Gemini")).toBeTruthy();

  // Second submission with changed inputs in the same city: 14:00 to 18:00
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T14:00" },
  });
  fireEvent.change(screen.getByLabelText("Activity end", { exact: true }), {
    target: { value: "2026-11-18T18:00" },
  });
  view.rerender(<PlanPanel {...props} forecast={{ ...forecast }} />);

  // Submit second plan
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));

  // IMMEDIATELY: Old Gemini sentence and "Explained by Gemini" badge must disappear!
  expect(screen.queryByText(FIRST_GEMINI_SENTENCE)).toBeNull();
  expect(screen.queryByText("Explained by Gemini")).toBeNull();
  // Badge must show pending state
  expect(screen.getByText("Checking Gemini...")).toBeTruthy();

  // Resolve the delayed second request
  resolveSecondPlan!({
    ok: true,
    json: async () => ({
      status: "gemini_generated",
      modelUsed: "gemini-3.5-flash-lite",
      narrative: {
        summary: "Plan 2 summary",
        items: [
          {
            id: "rec-indoor-2",
            category: "indoor",
            action: SECOND_GEMINI_SENTENCE,
            whyItHelps: "Indoor protection 2",
            beneficiary: "All",
            impactType: "health_protection",
          },
        ],
      },
    }),
  });

  // Second result alone appears
  await screen.findByText(SECOND_GEMINI_SENTENCE);
  expect(screen.getByText("Explained by Gemini")).toBeTruthy();
  expect(screen.queryByText(FIRST_GEMINI_SENTENCE)).toBeNull();
});

it("preserves attribution to second plan as forecast-based when second submission fails after first succeeded", async () => {
  const forecast = createTestForecast();
  const FIRST_GEMINI_SENTENCE = "Sentence 1: Run HEPA filter during the morning peak.";

  let callCount = 0;
  const fetchPlan = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: "gemini_generated",
          modelUsed: "gemini-3.5-flash-lite",
          narrative: {
            summary: "Plan 1 summary",
            items: [
              {
                id: "rec-indoor-1",
                category: "indoor",
                action: FIRST_GEMINI_SENTENCE,
                whyItHelps: "Indoor protection 1",
                beneficiary: "All",
                impactType: "health_protection",
              },
            ],
          },
        }),
      });
    }
    // Second request returns provider failure
    return Promise.resolve({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Service Unavailable" } }),
    });
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  const view = render(<PlanPanel {...props} />);

  // First submission
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));
  await screen.findByText(FIRST_GEMINI_SENTENCE);
  expect(screen.getByText("Explained by Gemini")).toBeTruthy();

  // Second submission with modified schedule
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T15:00" },
  });
  view.rerender(<PlanPanel {...props} forecast={{ ...forecast }} />);
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));

  // Wait for second plan to finish with fallback
  await screen.findByText("Forecast-based plan");

  // Verify attribution belongs entirely to second plan:
  // First sentence must NOT be displayed
  expect(screen.queryByText(FIRST_GEMINI_SENTENCE)).toBeNull();
  // "Explained by Gemini" must NOT be displayed
  expect(screen.queryByText("Explained by Gemini")).toBeNull();
  // Deterministic fallback recommendation should be rendered
  expect(screen.getByText(/operate hepa air purifier/i)).toBeTruthy();
});

it("verifies primary action button accessible name is strictly 'Find a time'", () => {
  const forecast = createTestForecast();
  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  render(<PlanPanel {...props} />);

  const button = screen.getByRole("button", { name: "Find a time" });
  expect(button).toBeTruthy();

  // Ensure "Build My Smog Plan" is no longer the accessible name of the button
  expect(screen.queryByRole("button", { name: "Build My Smog Plan" })).toBeNull();
});

it("displays supported numeric CO2e comparison by default and removes savings badge when transit & distance inputs are missing", async () => {
  const forecast = createTestForecast();
  const fetchPlan = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "deterministic_fallback", modelUsed: null }),
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  render(<PlanPanel {...props} />);

  // 1. Default car (8 km) + Public Transit checked -> supported UK DESNZ 2024 estimate (1.05 kg CO2e)
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));
  await screen.findByText("Forecast-based plan");

  expect(screen.getByTestId("transport-type-badge").textContent).toBe("Est. emissions");
  expect(screen.getByTestId("transport-co2-estimate").textContent).toContain("1.05 kg CO₂e");
  expect(screen.queryByTestId("transport-missing-inputs")).toBeNull();

  // 2. Uncheck all alternative transport modes and clear distance
  fireEvent.click(screen.getByLabelText("Public Transit"));
  fireEvent.click(screen.getByLabelText("walk"));
  fireEvent.click(screen.getByLabelText("bike"));
  fireEvent.click(screen.getByLabelText("ev"));
  fireEvent.change(screen.getByLabelText(/Trip Distance/i), { target: { value: "" } });

  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));
  await waitFor(() => expect(fetchPlan).toHaveBeenCalledTimes(2));

  expect(screen.getByTestId("transport-type-badge").textContent).toBe("Missing input");
  expect(screen.queryByTestId("transport-co2-estimate")).toBeNull();
  const missingPill = screen.getByTestId("transport-missing-inputs");
  expect(missingPill.textContent).toContain("trip distance (km)");
  expect(missingPill.textContent).toContain("available alternative travel mode");
  expect(screen.getByTestId("household-transport-explanation").textContent).not.toContain("50%");
});

it("shows separate start-hour label when multi-hour duration mean differs from start hour, and states plainly when earliest slot adds no benefit", async () => {
  const start = Date.parse("2026-11-18T08:30:00Z"); // 2:00 PM Asia/Kolkata
  // 2:00 PM=120, 3:00 PM=30(fixed), 4:00 PM=40, 5:00 PM=140, 6:00 PM=60, 7:00 PM=60
  const forecast: Forecast = {
    lat: 28.6139,
    lon: 77.209,
    timeZone: "Asia/Kolkata",
    source: "Open-Meteo",
    current: null,
    hourly: [120, 30, 40, 140, 60, 90, 90].map((pm25, i) => ({
      at: new Date(start + i * 3600000).toISOString(),
      pm25,
      usAqi: 150,
    })),
  };

  const fetchPlan = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: "deterministic_fallback", modelUsed: null }),
  });
  vi.stubGlobal("fetch", fetchPlan);

  const props = { forecast, lat: 28.6139, lon: 77.209, locationName: "Delhi-NCR" };
  render(<PlanPanel {...props} />);

  // 2-hour window 18:00-21:00: 6 PM slot has start=60, next hr=90 -> 2h mean=75 (earliest & lowest vs 7 PM mean=90)
  fireEvent.change(screen.getByLabelText("Duration", { exact: true }), { target: { value: "120" } });
  fireEvent.change(screen.getByLabelText("Commitment start", { exact: true }), {
    target: { value: "2026-11-18T15:00" },
  });
  fireEvent.change(screen.getByLabelText("Commitment end", { exact: true }), {
    target: { value: "2026-11-18T15:30" },
  });
  fireEvent.change(screen.getByLabelText("Activity start", { exact: true }), {
    target: { value: "2026-11-18T18:00" },
  });
  fireEvent.change(screen.getByLabelText("Activity end", { exact: true }), {
    target: { value: "2026-11-18T21:00" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));
  await screen.findByText("Forecast-based plan");

  expect(screen.getByText(/Keep your original time: Buy groceries at 6 PM/i)).toBeTruthy();
  expect(screen.getByText(/adds no forecast benefit/i)).toBeTruthy();
  expect(screen.getByTestId("activity-duration-mean").textContent).toBe("75 µg/m³ (120m mean)");
  expect(screen.getByTestId("activity-start-hour-pm25").textContent).toBe("Start hr: 60 µg/m³");
});
