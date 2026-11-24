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
  fireEvent.click(screen.getByRole("button", { name: /find a time|build my smog plan/i }));

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
  fireEvent.click(screen.getByRole("button", { name: /find a time|build my smog plan/i }));

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
  fireEvent.click(screen.getByRole("button", { name: /find a time|build my smog plan/i }));

  await waitFor(() => expect(fetchPlan).toHaveBeenCalledTimes(1));

  // Assert retry model's validated guidance is rendered in the UI
  const guidanceElement = await screen.findByText(RETRY_GUIDANCE_SENTENCE);
  expect(guidanceElement).toBeTruthy();

  // Assert badge "Explained by Gemini" is displayed
  expect(screen.getByText("Explained by Gemini")).toBeTruthy();
});
