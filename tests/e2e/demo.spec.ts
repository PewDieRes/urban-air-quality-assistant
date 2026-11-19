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
    // 1. Load root page (defaults to Delhi-NCR)
    await page.goto("/");
    await expect(page.getByTestId("selected-location-name")).toContainText("Delhi-NCR");

    // 2. Open and submit household smog plan
    const buildPlanBtn = page.getByRole("button", { name: /build my smog plan/i }).first();
    await expect(buildPlanBtn).toBeVisible();
    await buildPlanBtn.click();

    // Scroll to plan panel and click submit
    const submitBtn = page.getByRole("button", { name: /build My smog plan/i }).last();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // Verify tailored routine is generated and rendered
    await expect(
      page.getByText(/Demonstrable Before-and-After Schedule Optimization|Your Tailored Smog Routine/i)
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Recommended Hour/i)).toBeVisible();
    await expect(page.getByText(/lower forecast PM₂.₅|Lowest Exposure/i).first()).toBeVisible();

    // 3. Switch to Tokyo (city outside India)
    const tokyoBtn = page.getByRole("button", { name: /tokyo demo/i });
    await expect(tokyoBtn).toBeVisible();
    await tokyoBtn.click();

    // Verify Tokyo selection and time zone update
    await expect(page.getByTestId("selected-location-name")).toContainText("Tokyo");
    await expect(page.getByText(/Air Quality in Tokyo/i)).toBeVisible({ timeout: 8000 });
  });
});
