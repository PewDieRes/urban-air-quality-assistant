import { test, expect } from "@playwright/test";
import path from "path";

const ARTIFACT_DIR = "C:/Users/vazem/.gemini/antigravity-cli/brain/666b0fd3-02b5-4222-9992-9838ffe390f5/screenshots";

const mockForecastDelhi = {
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-18T09:30:00Z", pm25: 145, usAqi: 198 },
  hourly: [
    { at: "2026-11-18T09:30:00Z", pm25: 145, usAqi: 198 }, // 3:00 PM local
    { at: "2026-11-18T10:30:00Z", pm25: 120, usAqi: 184 }, // 4:00 PM local
    { at: "2026-11-18T11:30:00Z", pm25: 110, usAqi: 178 }, // 5:00 PM local
    { at: "2026-11-18T12:30:00Z", pm25: 60, usAqi: 154 },  // 6:00 PM local (BEST)
    { at: "2026-11-18T13:30:00Z", pm25: 85, usAqi: 167 },  // 7:00 PM local
    { at: "2026-11-18T14:30:00Z", pm25: 130, usAqi: 190 }, // 8:00 PM local
    { at: "2026-11-18T15:30:00Z", pm25: 160, usAqi: 210 }, // 9:00 PM local
  ],
};

test.describe("Redesign Screenshots Verification", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept fires API
    await page.route(
      (url) => url.pathname === "/api/fires",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ fires: [], count: 0, source: "NASA FIRMS" }),
        });
      }
    );

    // Intercept forecast API
    await page.route(
      (url) => url.pathname === "/api/forecast",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ forecast: mockForecastDelhi }),
        });
      }
    );

    // Intercept plan API
    await page.route(
      (url) => url.pathname === "/api/plan",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "gemini_generated",
            modelUsed: "gemini-3-flash-preview",
            narrative: {
              summary: "Buy groceries at 6 PM. School pickup stays at 3 PM. For your one-hour grocery trip, the forecast is 60 µg/m³ at 6 PM, compared with 120 µg/m³ at 4 PM (50% lower forecast PM₂.₅).",
              items: [
                {
                  id: "routine-grocery",
                  category: "routine",
                  action: "Conduct Grocery shopping at 6:00 PM (lower forecast PM₂.₅: 60 µg/m³)",
                  whyItHelps: "Available slot at 6:00 PM with lower forecast PM₂.₅ (60 µg/m³, US AQI: 154), fitting entirely within the allowed window and avoiding fixed commitments.",
                  beneficiary: "General household",
                  impactType: "lower_exposure",
                  evidenceFactId: "act-1",
                },
                {
                  id: "indoor-filter",
                  category: "indoor",
                  action: "Already have a particle filter? Run it on medium speed in the primary living room during the higher-pollution evening hours.",
                  whyItHelps: "Prevents fine particulate matter from infiltrating indoor spaces.",
                  beneficiary: "All occupants",
                  impactType: "health_protection",
                },
                {
                  id: "transport-metro",
                  category: "transport",
                  action: "Opt for Public Transit / Metro over private driving where available.",
                  whyItHelps: "Switching a commute to public transit reduces personal vehicle emissions.",
                  beneficiary: "Local community",
                  impactType: "lower_emissions",
                },
                {
                  id: "impact-workout",
                  category: "direct_impact",
                  action: "Reschedule grocery trip from 4:00 PM to 6:00 PM.",
                  whyItHelps: "Forecast PM₂.₅ concentration is 50% lower at 6:00 PM than at 4:00 PM (60 versus 120 µg/m³).",
                  beneficiary: "Family respiratory health",
                  impactType: "lower_exposure",
                  evidenceFactId: "act-1",
                },
              ],
            },
          }),
        });
      }
    );
  });

  test("captures desktop screenshots at 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("region", { name: /hourly air quality forecast/i })).toBeVisible({
      timeout: 10000,
    });

    // 1. Initial Screen
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "desktop-initial.png"),
      fullPage: false,
    });

    // Set pickup: 15:00 - 15:30
    await page.getByLabel("Commitment start", { exact: true }).fill("2026-11-18T15:00");
    await page.getByLabel("Commitment end", { exact: true }).fill("2026-11-18T15:30");

    // Set grocery: 16:00 - 20:00
    await page.getByLabel("Activity start", { exact: true }).fill("2026-11-18T16:00");
    await page.getByLabel("Activity end", { exact: true }).fill("2026-11-18T20:00");

    // 2. Click "Find a time"
    const findTimeBtn = page.locator("#household-plan-section").getByRole("button", { name: /find a time|build my smog plan/i });
    await findTimeBtn.click();

    const planner = page.locator("#household-plan-section");
    await expect(planner.getByText("6:00 PM").first()).toBeVisible({ timeout: 5000 });
    await expect(planner.getByText("3:00 PM - 3:30 PM")).toBeVisible();

    // Generated Result Screen
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "desktop-generated.png"),
      fullPage: false,
    });

    // 3. Map View
    const mapSection = page.locator("#explore-map-section");
    await mapSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "desktop-map.png"),
      fullPage: false,
    });
  });

  test("captures mobile screenshots at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("region", { name: /hourly air quality forecast/i })).toBeVisible({
      timeout: 10000,
    });

    // 1. Mobile Initial Screen
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile-initial.png"),
      fullPage: false,
    });

    // Set pickup & grocery
    await page.getByLabel("Commitment start", { exact: true }).fill("2026-11-18T15:00");
    await page.getByLabel("Commitment end", { exact: true }).fill("2026-11-18T15:30");
    await page.getByLabel("Activity start", { exact: true }).fill("2026-11-18T16:00");
    await page.getByLabel("Activity end", { exact: true }).fill("2026-11-18T20:00");

    // Click "Find a time"
    const findTimeBtn = page.locator("#household-plan-section").getByRole("button", { name: /find a time|build my smog plan/i });
    await findTimeBtn.click();

    const planner = page.locator("#household-plan-section");
    await expect(planner.getByText("6:00 PM").first()).toBeVisible({ timeout: 5000 });

    // 2. Mobile Generated Result Screen
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile-generated.png"),
      fullPage: false,
    });

    // 3. Mobile Map View
    const mapSection = page.locator("#explore-map-section");
    await mapSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "mobile-map.png"),
      fullPage: false,
    });
  });
});
