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

    await page.route(
      (url) => url.pathname === "/api/locations",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            places: [
              {
                id: "delhi-search-1",
                name: "Old Delhi",
                region: "Delhi",
                country: "India",
                lat: 28.65,
                lon: 77.23,
                timeZone: "Asia/Kolkata",
              },
              {
                id: "new-delhi-search-2",
                name: "New Delhi",
                region: "Delhi",
                country: "India",
                lat: 28.61,
                lon: 77.21,
                timeZone: "Asia/Kolkata",
              },
            ],
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
      const cspViolations: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && /content security policy|csp/i.test(msg.text())) {
          cspViolations.push(msg.text());
        }
      });

      await page.setViewportSize({ width: vp.width, height: vp.height });
      const navResponse = await page.goto("/");
      expect(navResponse).not.toBeNull();
      const responseHeaders = navResponse!.headers();
      expect(responseHeaders["x-content-type-options"]).toBe("nosniff");
      expect(responseHeaders["x-frame-options"]).toBe("DENY");
      expect(responseHeaders["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(responseHeaders["permissions-policy"]).toContain("geolocation=(self)");
      expect(responseHeaders["content-security-policy"]).toContain("default-src 'self'");

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

      // 2.5 Audit open LocationPicker ARIA combobox dropdown & keyboard selection
      const locationCombobox = page.getByRole("combobox", { name: /search city or location/i });
      await locationCombobox.fill("Delhi");
      const matchingListbox = page.getByRole("listbox", { name: /matching cities/i });
      await expect(matchingListbox).toBeVisible();
      await expect(locationCombobox).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("ArrowDown");
      await expect(matchingListbox.getByRole("option").first()).toHaveAttribute("aria-selected", "true");

      const comboboxOpenAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(comboboxOpenAxe.violations, JSON.stringify(comboboxOpenAxe.violations, null, 2)).toEqual([]);

      await page.keyboard.press("Enter");
      await expect(page.getByTestId("selected-location-name")).toHaveText("Old Delhi");

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

      // 6. Expand optional household, budget & transport settings and audit open disclosure panel
      const optionalSettingsSummary = planner.locator("summary", {
        hasText: "Optional household, budget & transport settings",
      });
      await optionalSettingsSummary.focus();
      await page.keyboard.press("Enter");
      await expect(planner.getByLabel("Primary Travel Mode")).toBeVisible();

      const expandedSettingsAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(
        expandedSettingsAxe.violations,
        JSON.stringify(expandedSettingsAxe.violations, null, 2)
      ).toEqual([]);

      // 7. Keyboard-only validation error test: clear Activity end -> enter start after end -> verify alert announcement + clearance
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
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const header = document.querySelector("header")!.getBoundingClientRect();
              const alert = document
                .querySelector("#household-plan-section [role='alert']")!
                .getBoundingClientRect();
              return alert.top >= header.bottom - 2 && alert.top < window.innerHeight;
            }),
          {
            timeout: 3000,
            message: "Validation alert should scroll visibly below the sticky header",
          }
        )
        .toBe(true);

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

      // Poll until smooth scroll finishes and verify decision <h3> rests cleanly below sticky header
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const header = document.querySelector("header")!.getBoundingClientRect();
              const h3 = document.querySelector("#household-plan-section h3")!;
              const rect = h3.getBoundingClientRect();
              return rect.top >= header.bottom - 2 && rect.top < window.innerHeight;
            }),
          {
            timeout: 3000,
            message: "Decision heading should scroll visibly below the sticky header",
          }
        )
        .toBe(true);

      const headingFocusStyle = await page.evaluate(() => {
        const h3 = document.querySelector("#household-plan-section h3")!;
        const style = window.getComputedStyle(h3);
        return {
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
        };
      });
      // Verify focus indicator is visually present (box-shadow ring or outline)
      expect(headingFocusStyle.boxShadow !== "none" || headingFocusStyle.outlineStyle !== "none").toBe(
        true
      );

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

      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const header = document.querySelector("header")!.getBoundingClientRect();
              const input = document
                .querySelector("#household-plan-section form input")!
                .getBoundingClientRect();
              return input.top >= header.bottom - 2 && input.top < window.innerHeight;
            }),
          {
            timeout: 3000,
            message: "First form input should scroll visibly below the sticky header",
          }
        )
        .toBe(true);

      // 11. Run full-page axe-core audit on generated result state (all WCAG 2A/2AA rules including color-contrast)
      const resultAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(resultAxe.violations, JSON.stringify(resultAxe.violations, null, 2)).toEqual([]);

      // 12. Open Immersive 3D City view: audit fallback modal dialog, Escape close + focus return, and illustrative 3D view
      const immersiveBtn = page.getByRole("button", { name: /immersive 3d city/i });
      await immersiveBtn.focus();
      await page.keyboard.press("Enter");

      const fallbackDialog = page.getByRole("dialog");
      await expect(fallbackDialog).toBeVisible({ timeout: 15000 });
      const modalAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(modalAxe.violations, JSON.stringify(modalAxe.violations, null, 2)).toEqual([]);

      // Verify Escape dismisses immersive fallback dialog and returns focus to Immersive 3D toggle
      await page.keyboard.press("Escape");
      await expect(fallbackDialog).not.toBeVisible();
      await expect(immersiveBtn).toBeFocused();

      // Re-open Immersive 3D, enter illustrative city mode, and audit expanded 3D view
      await page.keyboard.press("Enter");
      await expect(fallbackDialog).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: /explore illustrative city/i }).click();
      await expect(page.getByRole("checkbox", { name: /illustration of forecast pollution/i })).toBeVisible({
        timeout: 10000,
      });

      const illustrativeAxe = await page.evaluate(async () => {
        // @ts-expect-error axe injected on window
        return await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });
      expect(
        illustrativeAxe.violations,
        JSON.stringify(illustrativeAxe.violations, null, 2)
      ).toEqual([]);
      expect(cspViolations, `CSP violations: ${cspViolations.join("; ")}`).toEqual([]);
    });
  }
});
