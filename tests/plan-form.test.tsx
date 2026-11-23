import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanPanel } from "@/components/plan/plan-panel";
import type { Forecast } from "@/lib/forecast/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each([["Delhi-NCR", "Asia/Kolkata", "08:30", "09:30"], ["Tokyo", "Asia/Tokyo", "05:00", "06:00"]])(
  "submits the family's edited local schedule in %s", async (city, zone, first, pickup) => {
    const start = Date.parse(`2026-11-18T${first}Z`);
    const forecast: Forecast = { lat: 0, lon: 0, timeZone: zone, source: "Open-Meteo", current: null,
      hourly: [90, 80, 70, 65, 35, 60, 80].map((pm25, i) => ({
        at: new Date(start + i * 3600000).toISOString(), pm25, usAqi: 100,
      })),
    };
    const fetchPlan = vi.fn().mockResolvedValue({ok: true, json: async () => ({status: "deterministic_fallback"})});
    vi.stubGlobal("fetch", fetchPlan);
    const props = {forecast, lat: 0, lon: 0, locationName: city};
    const view = render(<PlanPanel {...props} />);
    for (const [label, time] of [["Activity start", "16:00"], ["Activity end", "20:00"],
      ["Commitment start", "15:00"], ["Commitment end", "15:30"]]) {
      fireEvent.change(screen.getByLabelText(label, {exact: true}), {target: {value: "2026-11-18T"+time}});
    }
    view.rerender(<PlanPanel {...props} forecast={{...forecast}} />);
    fireEvent.click(screen.getByRole("button", {name: "Build My Smog Plan"}));
    await waitFor(() => expect(fetchPlan).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchPlan.mock.calls[0][1].body);
    expect(body.input.fixedCommitments[0].start).toBe(`2026-11-18T${pickup}:00.000Z`);
    expect(screen.getAllByText("6:00 PM").length).toBeGreaterThan(0);
    expect(screen.getByText("3:00 PM - 3:30 PM")).toBeTruthy();
    await screen.findByRole("button", {name: "Retry with Gemini"});
  }
);
