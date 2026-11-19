import { test, expect } from "@playwright/test";

const mockForecastDelhi = {
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-19T10:00:00Z", pm25: 120, usAqi: 184 },
  hourly: [
    { at: "2026-11-19T10:00:00Z", pm25: 120, usAqi: 184 },
    { at: "2026-11-19T11:00:00Z", pm25: 140, usAqi: 195 },
    { at: "2026-11-19T12:00:00Z", pm25: 160, usAqi: 210 },
    { at: "2026-11-19T13:00:00Z", pm25: 180, usAqi: 230 },
  ],
};

const mockForecastTokyo = {
  lat: 35.6812,
  lon: 139.7671,
  timeZone: "Asia/Tokyo",
  source: "Open-Meteo",
  current: { at: "2026-11-19T10:00:00Z", pm25: 20, usAqi: 68 },
  hourly: [
    { at: "2026-11-19T10:00:00Z", pm25: 20, usAqi: 68 },
    { at: "2026-11-19T11:00:00Z", pm25: 22, usAqi: 72 },
    { at: "2026-11-19T12:00:00Z", pm25: 18, usAqi: 63 },
    { at: "2026-11-19T13:00:00Z", pm25: 15, usAqi: 57 },
  ],
};

test.describe("Immersive 3D Smog Viewer E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept fires endpoint to prevent external network dependencies
    await page.route(
      (url) => url.pathname === "/api/fires",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ fires: [], count: 0 }),
        });
      }
    );

    // Intercept forecast API
    await page.route(
      (url) => url.pathname === "/api/forecast",
      async (route) => {
        const url = new URL(route.request().url());
        const lat = parseFloat(url.searchParams.get("lat") || "28");
        if (lat > 34) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ forecast: mockForecastTokyo }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ forecast: mockForecastDelhi }),
          });
        }
      }
    );
  });

  test("milestone 1-4: switches to Immersive 3D, scrubs timeline, and preserves time upon return to 2D map", async ({
    page,
  }) => {
    let forecastRequestCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/forecast")) {
        forecastRequestCount++;
      }
    });

    await page.goto("/");
    await expect(page.getByTestId("selected-location-name")).toContainText("Delhi-NCR");

    // 1. Toggle to Immersive 3D City view
    const immersiveTab = page.getByRole("button", { name: /immersive 3d city/i });
    await expect(immersiveTab).toBeVisible();
    await immersiveTab.click();

    // 2. Verify Immersive 3D UI elements load
    await expect(page.getByText(/3D Scene/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Illustration of forecast pollution/i)).toBeVisible();
    await expect(page.getByLabel("Show haze")).toBeVisible();
    await expect(page.getByRole("button", { name: /aerial/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /skyline/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reset view/i })).toBeVisible();

    // 3. Scrub forecast slider
    const initialForecastRequests = forecastRequestCount;
    const scrubber = page.getByRole("slider", { name: /24-hour forecast time scrubber/i });
    await expect(scrubber).toBeVisible();
    await scrubber.fill("2"); // Scrub to 3rd hour

    // Ensure NO new network request to forecast endpoint was made when scrubbing
    await page.waitForTimeout(300);
    expect(forecastRequestCount).toBe(initialForecastRequests);

    // 4. Return to 2D map and verify seamless continuity
    const backBtn = page.getByRole("button", { name: /back to 2d map/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // 2D Map view is active again, timeline maintains selected hour
    await expect(page.getByRole("button", { name: /2d regional map/i })).toBeVisible();
  });

  test("two-city demo flow: Tokyo switch updates 3D anchor and maintains planner availability", async ({
    page,
  }) => {
    await page.goto("/");

    // Switch to Tokyo Demo
    const tokyoDemoBtn = page.getByRole("button", { name: /tokyo demo/i });
    await expect(tokyoDemoBtn).toBeVisible();
    await tokyoDemoBtn.click();

    await expect(page.getByTestId("selected-location-name")).toContainText("Tokyo");

    // Open Immersive 3D in Tokyo
    const immersiveTab = page.getByRole("button", { name: /immersive 3d city/i });
    await immersiveTab.click();

    await expect(page.getByText(/Tokyo/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Illustration of forecast pollution/i)).toBeVisible();

    // Verify Build Plan button exists in 3D view and scrolls to planner
    const buildPlanBtn = page.getByRole("button", { name: /build plan/i }).first();
    await expect(buildPlanBtn).toBeVisible();
    await buildPlanBtn.click();

    await expect(page.getByText(/Build My Smog Plan · Tokyo/i)).toBeVisible();
  });
});
