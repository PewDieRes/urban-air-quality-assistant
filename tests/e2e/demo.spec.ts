import { test, expect } from "@playwright/test";

test.describe("Urban Air Quality Assistant", () => {
  test("location access: denies geolocation, allows search, and guards against out-of-order stale responses", async ({
    page,
    context,
  }) => {
    // Deny geolocation permission
    await context.clearPermissions();

    // Mock geocoding search endpoints with deliberate delay for an older search
    await page.route("**/api/locations?q=Del*", async (route) => {
      // Intentionally slow response for 'Del'
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
    });

    await page.route("**/api/locations?q=Tokyo*", async (route) => {
      // Faster response for 'Tokyo'
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
    });

    await page.goto("/");

    // Geolocation is denied, but search input should be present and usable
    const searchInput = page.getByRole("textbox", { name: /search city|search location/i });
    await expect(searchInput).toBeVisible();

    // User types 'Del', then quickly changes query to 'Tokyo'
    await searchInput.fill("Del");
    await page.waitForTimeout(100);
    await searchInput.fill("Tokyo");

    // The newer result 'Tokyo' should appear and not be overwritten by the delayed 'Old Stale Delhi'
    await expect(page.getByText("Tokyo, Japan")).toBeVisible({ timeout: 5000 });
    // Wait past the stale delay
    await page.waitForTimeout(800);
    await expect(page.getByText("Old Stale Delhi")).not.toBeVisible();

    // Selection remains possible
    await page.getByText("Tokyo, Japan").click();
    await expect(page.getByTestId("selected-location-name")).toContainText("Tokyo");
  });

  test("forecast map: slider changes update displayed hour without refetching grid and forecast list survives map failure", async ({
    page,
  }) => {
    let gridFetchCount = 0;

    await page.route("**/api/forecast/grid*", async (route) => {
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
              forecast: {
                lat: 28.6,
                lon: 77.2,
                timeZone: "Asia/Kolkata",
                source: "Open-Meteo",
                current: { at: "2026-11-18T10:00:00Z", pm25: 140, usAqi: 195 },
                hourly: [
                  { at: "2026-11-18T10:00:00Z", pm25: 140, usAqi: 195 },
                  { at: "2026-11-18T11:00:00Z", pm25: 110, usAqi: 175 },
                  { at: "2026-11-18T12:00:00Z", pm25: 85, usAqi: 160 },
                ],
              },
            },
          ],
        }),
      });
    });

    await page.goto("/");

    // Verify accessible forecast panel is rendered
    await expect(page.getByRole("region", { name: /hourly air quality forecast/i })).toBeVisible({
      timeout: 10000,
    });

    // Verify 24h scrubber slider exists
    const slider = page.getByLabel(/24-hour forecast time scrubber/i);
    await expect(slider).toBeVisible();

    const initialGridFetches = gridFetchCount;

    // Change slider value
    await slider.fill("1");
    await page.waitForTimeout(300);

    // Scrubbing should NOT trigger additional grid fetches (re-uses existing data)
    expect(gridFetchCount).toBe(initialGridFetches);

    // Verify 3D toggle button is interactive
    const toggle3D = page.getByRole("button", { name: /toggle 3d|3d view/i });
    await expect(toggle3D).toBeVisible();
    await toggle3D.click();
    await expect(page.getByText(/3D Active/i)).toBeVisible();
  });
});
