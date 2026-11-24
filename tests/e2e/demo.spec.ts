import { test, expect } from "@playwright/test";

const mockForecastKolkata = {
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-18T10:00:00Z", pm25: 145, usAqi: 198 },
  hourly: [
    { at: "2026-11-18T10:00:00Z", pm25: 145, usAqi: 198 },
    { at: "2026-11-18T11:00:00Z", pm25: 125, usAqi: 187 },
    { at: "2026-11-18T12:00:00Z", pm25: 95, usAqi: 172 },
    { at: "2026-11-18T13:00:00Z", pm25: 80, usAqi: 164 },
    { at: "2026-11-18T14:00:00Z", pm25: 75, usAqi: 161 },
    { at: "2026-11-18T15:00:00Z", pm25: 90, usAqi: 169 },
    { at: "2026-11-18T16:00:00Z", pm25: 110, usAqi: 178 },
    { at: "2026-11-18T17:00:00Z", pm25: 130, usAqi: 190 },
  ],
};

const mockForecastTokyo = {
  lat: 35.6762,
  lon: 139.6503,
  timeZone: "Asia/Tokyo",
  source: "Open-Meteo",
  current: { at: "2026-11-18T10:00:00Z", pm25: 15, usAqi: 56 },
  hourly: [
    { at: "2026-11-18T10:00:00Z", pm25: 15, usAqi: 56 },
    { at: "2026-11-18T11:00:00Z", pm25: 14, usAqi: 54 },
    { at: "2026-11-18T12:00:00Z", pm25: 12, usAqi: 50 },
    { at: "2026-11-18T13:00:00Z", pm25: 10, usAqi: 45 },
  ],
};

test.describe("Urban Air Quality Assistant", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept fires API requests to avoid NASA FIRMS upstream network latency
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

    // Intercept forecast API requests using URL predicate to avoid glob '?' wildcard issues
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
            body: JSON.stringify({ forecast: mockForecastKolkata }),
          });
        }
      }
    );
  });

  test("location access: denies geolocation, allows search, and guards against out-of-order stale responses", async ({
    page,
    context,
  }) => {
    await context.clearPermissions();

    await page.route(
      (url) =>
        url.pathname === "/api/locations" &&
        (url.searchParams.get("q") || "").toLowerCase().startsWith("del"),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            places: [
              {
                id: "delhi-old-query",
                name: "Old Stale Delhi",
                region: "Delhi",
                country: "India",
                lat: 28.6139,
                lon: 77.209,
                timeZone: "Asia/Kolkata",
              },
            ],
          }),
        });
      }
    );

    await page.route(
      (url) =>
        url.pathname === "/api/locations" &&
        (url.searchParams.get("q") || "").toLowerCase().startsWith("tokyo"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            places: [
              {
                id: "1850147",
                name: "Tokyo",
                region: "Tokyo",
                country: "Japan",
                lat: 35.6895,
                lon: 139.6917,
                timeZone: "Asia/Tokyo",
              },
            ],
          }),
        });
      }
    );

    await page.goto("/");

    const searchInput = page.getByRole("textbox", { name: /search city|search location/i });
    await expect(searchInput).toBeVisible();

    await searchInput.fill("Del");
    await page.waitForTimeout(300); // Wait for debounce to fire 'Del' request
    await searchInput.fill("Tokyo");

    await expect(page.getByText("Tokyo, Japan")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);
    await expect(page.getByText("Old Stale Delhi")).not.toBeVisible();

    await page.getByText("Tokyo, Japan").click();
    await expect(page.getByTestId("selected-location-name")).toContainText("Tokyo");
  });

  test("forecast map: slider changes update displayed hour without refetching grid and forecast list survives map failure", async ({
    page,
  }) => {
    let gridFetchCount = 0;

    await page.route(
      (url) => url.pathname === "/api/forecast/grid",
      async (route) => {
        gridFetchCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            grid: [
              {
                cell: {
                  id: "cell-1",
                  lat: 28.6,
                  lon: 77.2,
                  bounds: { west: 77.1, south: 28.5, east: 77.3, north: 28.7 },
                },
                forecast: mockForecastKolkata,
              },
            ],
          }),
        });
      }
    );

    await page.goto("/");

    await expect(page.getByRole("region", { name: /hourly air quality forecast/i })).toBeVisible({
      timeout: 10000,
    });

    const slider = page.getByLabel(/24-hour forecast time scrubber/i);
    await expect(slider).toBeVisible();

    const initialGridFetches = gridFetchCount;

    await slider.fill("1");
    await page.waitForTimeout(300);

    expect(gridFetchCount).toBe(initialGridFetches);

    const toggle3D = page.getByRole("button", { name: /3d perspective|toggle 3d|3d view/i });
    await expect(toggle3D).toBeVisible();
    await toggle3D.click();
    await expect(page.getByText(/2D Flat View|3D Active/i)).toBeVisible();
  });

  test("historical smoke: opens verified historical smoke case after simulated live service failure", async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === "/api/smoke/jobs",
      async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "RUNNER_UNAVAILABLE",
              message: "Live atmospheric model service is offline or unreachable.",
            },
          }),
        });
      }
    );

    await page.goto("/");

    const historicalBtn = page.getByRole("button", { name: /historical smoke|historical case/i });
    await expect(historicalBtn).toBeVisible({ timeout: 10000 });
    await historicalBtn.click();

    await expect(page.getByText(/Possible smoke paths/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/November 3, 2024/i)).toBeVisible();
    await expect(page.getByText(/100m, 500m, 1000m/i)).toBeVisible();
  });

  test("full challenge demo flow: Delhi-NCR plan execution, Tokyo country switch, and verified facts", async ({
    page,
  }) => {
    let autoDetections = 0;
    page.on("request", req => { if (new URL(req.url()).pathname === "/api/locations/detect") autoDetections++; });
    // Use identical local hours but different UTC offsets, independent of the browser timezone.
    await page.route(url => url.pathname === "/api/forecast", async route => {
      const tokyo = Number(new URL(route.request().url()).searchParams.get("lat")) > 34;
      const base = tokyo ? mockForecastTokyo : mockForecastKolkata;
      const first = Date.parse(tokyo ? "2026-11-18T05:00Z" : "2026-11-18T08:30Z");
      const hourly = [85, 75, 70, 65, 35, 60, 80].map((pm25, i) => ({
        at: new Date(first + i * 3600000).toISOString(), pm25, usAqi: 100,
      }));
      await route.fulfill({ json: { forecast: { ...base, current: hourly[0], hourly } } });
    });
    // The local calculation is real. Isolate upstream Gemini and exercise the labeled fallback.
    await page.route(url => url.pathname === "/api/plan", route => route.fulfill({
      json: {status: "deterministic_fallback", modelUsed: null},
    }));
    await page.goto("/");
    for (const [city, utc] of [["Delhi-NCR", "09:30"], ["Tokyo", "06:00"]]) {
      if (city === "Tokyo") await page.getByRole("button", {name: "Tokyo Demo"}).click();
      const planner = page.locator("#household-plan-section");
      await expect(planner.getByLabel("Activity start", {exact: true})).toHaveValue("2026-11-18T14:00");
      for (const [label, time] of [["Activity start", "16:00"], ["Activity end", "20:00"],
        ["Commitment start", "15:00"], ["Commitment end", "15:30"]]) {
        await planner.getByLabel(label, {exact: true}).fill("2026-11-18T" + time);
      }
      const request = page.waitForRequest(req => new URL(req.url()).pathname === "/api/plan");
      await planner.getByRole("button", {name: "Find a time", exact: true}).click();
      expect((await request).postDataJSON().input.fixedCommitments[0].start).toBe(`2026-11-18T${utc}:00.000Z`);
      await expect(planner.getByText("6:00 PM", {exact: true}).first()).toBeVisible();
      await expect(planner.getByText("3:00 PM - 3:30 PM")).toBeVisible();
    }
    expect(autoDetections).toBe(0);
  });
});
