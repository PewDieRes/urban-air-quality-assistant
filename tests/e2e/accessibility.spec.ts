import { test, expect } from "@playwright/test";

const mockForecastDelhi = {
  lat: 28.6139,
  lon: 77.209,
  timeZone: "Asia/Kolkata",
  source: "Open-Meteo",
  current: { at: "2026-11-18T09:30:00Z", pm25: 145, usAqi: 198 },
  hourly: [
    { at: "2026-11-18T09:30:00Z", pm25: 145, usAqi: 198 },
    { at: "2026-11-18T10:30:00Z", pm25: 120, usAqi: 184 },
    { at: "2026-11-18T11:30:00Z", pm25: 110, usAqi: 178 },
    { at: "2026-11-18T12:30:00Z", pm25: 60, usAqi: 154 },
    { at: "2026-11-18T13:30:00Z", pm25: 85, usAqi: 167 },
    { at: "2026-11-18T14:30:00Z", pm25: 130, usAqi: 190 },
  ],
};

const mockForecastTokyo = {
  lat: 35.6762,
  lon: 139.6503,
  timeZone: "Asia/Tokyo",
  source: "Open-Meteo",
  current: { at: "2026-11-18T05:00:00Z", pm25: 35, usAqi: 95 },
  hourly: [
    { at: "2026-11-18T05:00:00Z", pm25: 35, usAqi: 95 }, // 2:00 PM Tokyo
    { at: "2026-11-18T06:00:00Z", pm25: 30, usAqi: 89 }, // 3:00 PM Tokyo
    { at: "2026-11-18T07:00:00Z", pm25: 28, usAqi: 84 }, // 4:00 PM Tokyo
    { at: "2026-11-18T08:00:00Z", pm25: 25, usAqi: 78 }, // 5:00 PM Tokyo
    { at: "2026-11-18T09:00:00Z", pm25: 18, usAqi: 63 }, // 6:00 PM Tokyo (BEST)
    { at: "2026-11-18T10:00:00Z", pm25: 22, usAqi: 72 }, // 7:00 PM Tokyo
    { at: "2026-11-18T11:00:00Z", pm25: 26, usAqi: 80 }, // 8:00 PM Tokyo
  ],
};

test.describe("Keyboard Accessibility, Viewport Clearance & Automated Axe Audit", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/fires",
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ fires: [], count: 0 }),
        })
    );

    await page.route(
      (url) => url.pathname === "/api/forecast",
      async (route) => {
        const url = new URL(route.request().url());
        const lat = parseFloat(url.searchParams.get("lat") || "28");
        const forecast = lat > 34 ? mockForecastTokyo : mockForecastDelhi;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ forecast }),
        });
      }
    );

    await page.route(
      (url) => url.pathname === "/api/plan",
      async (route) => {
        // Brief delay so loading status live region is observable
        await new Promise((r) => setTimeout(r, 150));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "deterministic_fallback",
            modelUsed: null,
          }),
        });
      }
    );
  });

  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`keyboard-only flow, sticky header clearance, live regions, unique SVG IDs, and axe audit on ${vp.name} (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      await expect(page.getByTestId("current-pm25-value")).toBeVisible({ timeout: 10000 });

      // 1. Verify NO duplicate DOM IDs (specifically responsive ForecastChart gradient SVG IDs)
      const duplicateIds = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
        const counts = new Map<string, number>();
        for (const id of all) {
          counts.set(id, (counts.get(id) || 0) + 1);
        }
        return Array.from(counts.entries())
          .filter(([, count]) => count > 1)
          .map(([id, count]) => ({ id, count }));
      });
      expect(duplicateIds).toEqual([]);

      // 2. Run full-page axe-core audit on initial page (all WCAG 2A/2AA rules including color-contrast)
      const axePath = require.resolve("axe-core");
      await page.addScriptTag({ path: axePath });
      const initialAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(initialAxe.violations, JSON.stringify(initialAxe.violations, null, 2)).toEqual([]);

      // 3. Keyboard-only: select Tokyo Demo button via Tab + Enter
      const tokyoBtn = page.getByRole("button", { name: "Tokyo Demo" });
      await tokyoBtn.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("selected-location-name")).toHaveText("Tokyo");
      await expect(page.getByTestId("current-pm25-value")).toHaveText("35.0");

      // 4. Verify visible ForecastChart has expandable accessible table usable via keyboard
      const chartSummary = page
        .locator("summary", { hasText: "Exact hourly forecast values (accessible table)" })
        .locator("visible=true")
        .first();
      await chartSummary.focus();
      await page.keyboard.press("Enter");
      const visibleTable = page.locator("table").locator("visible=true").first();
      await expect(visibleTable).toBeVisible();
      await expect(visibleTable.locator("tbody tr").first()).toContainText("PM");

      // 5. Verify visible labels match accessible names for planner actions
      const planner = page.locator("#household-plan-section");
      const findTimeBtn = planner.getByRole("button", { name: "Find a time", exact: true });
      await expect(findTimeBtn).toBeVisible();

      // 6. Keyboard-only validation error test: clear Activity end -> enter start after end -> verify alert announcement + clearance
      const commStart = planner.getByLabel("Commitment start", { exact: true });
      const commEnd = planner.getByLabel("Commitment end", { exact: true });
      const actStart = planner.getByLabel("Activity start", { exact: true });
      const actEnd = planner.getByLabel("Activity end", { exact: true });

      await actStart.fill("2026-11-18T20:00");
      await actEnd.fill("2026-11-18T16:00"); // Invalid: end before start
      await findTimeBtn.focus();
      await page.keyboard.press("Enter");

      const alertBox = planner.getByRole("alert");
      await expect(alertBox).toBeVisible();
      await expect(alertBox).toBeFocused();
      const alertClearance = await page.evaluate(() => {
        const header = document.querySelector("header")!.getBoundingClientRect();
        const alert = document.querySelector("#household-plan-section [role='alert']")!.getBoundingClientRect();
        return { headerBottom: header.bottom, alertTop: alert.top };
      });
      expect(alertClearance.alertTop).toBeGreaterThanOrEqual(alertClearance.headerBottom - 2);

      // 7. Enter valid schedule via keyboard & submit
      await commStart.fill("2026-11-18T15:00");
      await commEnd.fill("2026-11-18T15:30");
      await actStart.fill("2026-11-18T16:00");
      await actEnd.fill("2026-11-18T20:00");

      await findTimeBtn.focus();
      await page.keyboard.press("Enter");

      // Verify loading status is announced in polite live region
      const liveStatus = planner.locator("[role='status'][aria-live='polite']");
      await expect(liveStatus).toContainText(/Finding lowest-pollution hour/i);

      // 8. Verify final result renders, announces once, moves focus to decision <h3>, has visible focus style, and is NOT obscured by sticky header
      const decisionHeading = planner.getByRole("heading", { level: 3, name: /Buy groceries at 6 PM/i });
      await expect(decisionHeading).toBeVisible({ timeout: 5000 });
      await expect(decisionHeading).toBeFocused({ timeout: 5000 });
      await expect(liveStatus).toContainText(/Buy groceries at 6 PM.*Forecast-based plan/i);

      // Give scroll animation/layout a beat to settle if any
      await page.waitForTimeout(300);

      const headingAudit = await page.evaluate(() => {
        const header = document.querySelector("header")!.getBoundingClientRect();
        const h3 = document.querySelector("#household-plan-section h3")!;
        const rect = h3.getBoundingClientRect();
        const style = window.getComputedStyle(h3);
        return {
          headerBottom: header.bottom,
          headingTop: rect.top,
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
        };
      });
      expect(headingAudit.headingTop).toBeGreaterThanOrEqual(headingAudit.headerBottom - 2);
      // Verify focus indicator is visually present (box-shadow ring or outline)
      expect(headingAudit.boxShadow !== "none" || headingAudit.outlineStyle !== "none").toBe(true);

      // 9. Expand assumptions <details> via keyboard
      const assumptionsSummary = planner.locator("summary", {
        hasText: "How we calculated this",
      });
      await assumptionsSummary.focus();
      await page.keyboard.press("Enter");
      await expect(planner.getByText(/Duration-weighted ranking metric/i)).toBeVisible();

      // 10. Activate "Edit inputs" via keyboard -> accessible name matches visible text "Edit inputs"
      const editBtn = planner.getByRole("button", { name: "Edit inputs", exact: true });
      await editBtn.focus();
      await page.keyboard.press("Enter");
      await expect(planner.locator("input").first()).toBeFocused();

      await page.waitForTimeout(300);
      const inputClearance = await page.evaluate(() => {
        const header = document.querySelector("header")!.getBoundingClientRect();
        const input = document.querySelector("#household-plan-section form input")!.getBoundingClientRect();
        return { headerBottom: header.bottom, inputTop: input.top };
      });
      expect(inputClearance.inputTop).toBeGreaterThanOrEqual(inputClearance.headerBottom - 2);

      // 11. Run full-page axe-core audit on generated result state (all WCAG 2A/2AA rules including color-contrast)
      const resultAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(resultAxe.violations, JSON.stringify(resultAxe.violations, null, 2)).toEqual([]);
    });
  }
});
