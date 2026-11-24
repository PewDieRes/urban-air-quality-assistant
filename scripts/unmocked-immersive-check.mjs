import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const screenshotsDir = "C:/Users/vazem/.gemini/antigravity-cli/brain/666b0fd3-02b5-4222-9992-9838ffe390f5/screenshots";
const artifactsDir = "C:/Users/vazem/.gemini/antigravity-cli/brain/666b0fd3-02b5-4222-9992-9838ffe390f5";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    delhi: {},
    tokyo: {},
    delhiPlan: {},
    tokyoPlan: {},
    returnTo2D: false,
  };

  try {
    // 1. Desktop Context (1440x900)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // Listen to /api/plan requests
    page.on("response", async (res) => {
      if (res.url().includes("/api/plan") && res.request().method() === "POST") {
        try {
          const body = await res.json();
          if (results.currentCityPlan === "tokyo") {
            results.tokyoPlan = {
              status: body.status,
              modelUsed: body.modelUsed || body.narrative?.modelUsed || null,
              fallbackReason: body.fallbackReason || null,
              headline: body.headline || null,
            };
          } else {
            results.delhiPlan = {
              status: body.status,
              modelUsed: body.modelUsed || body.narrative?.modelUsed || null,
              fallbackReason: body.fallbackReason || null,
              headline: body.headline || null,
            };
          }
        } catch (e) {
          console.error("Error parsing /api/plan response:", e);
        }
      }
    });

    console.log("Navigating to http://localhost:3000 unmocked...");
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // Record Delhi initial state
    const delhiLocationName = await page.getByTestId("selected-location-name").textContent();
    console.log("Initial Location:", delhiLocationName);

    // Switch to Immersive 3D City
    const immersiveTab = page.getByRole("button", { name: /immersive 3d city/i });
    await immersiveTab.click();
    await page.waitForTimeout(2000);

    // Check if provider credential overlay is displayed
    const exploreBtn = page.getByRole("button", { name: /explore illustrative city/i });
    const isOverlayVisible = await exploreBtn.isVisible();
    results.delhi.overlayVisible = isOverlayVisible;
    console.log("Delhi real tiles overlay visible:", isOverlayVisible);

    if (isOverlayVisible) {
      await exploreBtn.click();
      await page.waitForTimeout(2000);
    }

    // Inspect status pill
    const statusText = await page.locator(".select-none span.text-\\[10px\\]").first().textContent();
    results.delhi.statusPill = statusText;
    results.delhi.coordinates = { lat: 28.6139, lon: 77.209 };
    results.delhi.landmark = "Central Connaught Arcade & Barakhamba Complex";
    console.log("Delhi 3D Status:", statusText);

    // Exercise Orbit: Drag on canvas
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 - 50, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      results.delhi.orbitExercised = true;
    }

    // Exercise camera presets
    await page.getByRole("button", { name: /aerial/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /skyline/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /reset view/i }).click();
    await page.waitForTimeout(400);
    results.delhi.cameraPresetsExercised = true;

    // Exercise Haze toggle
    const hazeCheckbox = page.getByRole("checkbox", { name: /illustration of forecast pollution/i });
    await hazeCheckbox.uncheck();
    await page.waitForTimeout(300);
    await hazeCheckbox.check();
    await page.waitForTimeout(300);
    results.delhi.hazeToggleExercised = true;

    // Read forecast hour 0
    const timeText0 = await page.locator("span.font-mono.text-emerald-300").first().textContent();
    const pm25Text0 = await page.locator("span.font-mono.font-bold.text-amber-300").first().textContent();
    results.delhi.forecastHour0 = { time: timeText0, pm25: pm25Text0 };

    // Scrub slider to hour 2
    const scrubber = page.getByRole("slider", { name: /24-hour forecast time scrubber/i });
    if (await scrubber.isVisible()) {
      await scrubber.fill("2");
      await page.waitForTimeout(500);
      const timeText2 = await page.locator("span.font-mono.text-emerald-300").first().textContent();
      const pm25Text2 = await page.locator("span.font-mono.font-bold.text-amber-300").first().textContent();
      results.delhi.forecastHour2 = { time: timeText2, pm25: pm25Text2 };
    }

    // Capture desktop Delhi 3D screenshot
    const delhiDesktopPath = path.join(screenshotsDir, "live-delhi-immersive-desktop.png");
    const delhiDesktopArtifactPath = path.join(artifactsDir, "live-delhi-immersive-desktop.png");
    await page.screenshot({ path: delhiDesktopPath });
    fs.copyFileSync(delhiDesktopPath, delhiDesktopArtifactPath);
    results.delhi.screenshot = delhiDesktopPath;
    console.log("Saved live Delhi desktop screenshot:", delhiDesktopPath);

    // Switch to Tokyo Demo
    const tokyoDemoBtn = page.getByRole("button", { name: /tokyo demo/i });
    await tokyoDemoBtn.click();
    await page.waitForTimeout(2000);

    const tokyoLocationName = await page.getByTestId("selected-location-name").textContent();
    console.log("Switched Location:", tokyoLocationName);

    // Check Tokyo 3D
    const tokyoExploreBtn = page.getByRole("button", { name: /explore illustrative city/i });
    if (await tokyoExploreBtn.isVisible()) {
      await tokyoExploreBtn.click();
      await page.waitForTimeout(2000);
    }

    const tokyoStatusText = await page.locator(".select-none span.text-\\[10px\\]").first().textContent();
    results.tokyo.statusPill = tokyoStatusText;
    results.tokyo.coordinates = { lat: 35.6812, lon: 139.7671 };
    results.tokyo.landmark = "Tokyo Station Marunouchi & Marunouchi Towers";
    console.log("Tokyo 3D Status:", tokyoStatusText);

    // Read Tokyo forecast time
    const tokyoTimeText = await page.locator("span.font-mono.text-emerald-300").first().textContent();
    const tokyoPm25Text = await page.locator("span.font-mono.font-bold.text-amber-300").first().textContent();
    results.tokyo.forecast = { time: tokyoTimeText, pm25: tokyoPm25Text };

    // Capture desktop Tokyo 3D screenshot
    const tokyoDesktopPath = path.join(screenshotsDir, "live-tokyo-immersive-desktop.png");
    const tokyoDesktopArtifactPath = path.join(artifactsDir, "live-tokyo-immersive-desktop.png");
    await page.screenshot({ path: tokyoDesktopPath });
    fs.copyFileSync(tokyoDesktopPath, tokyoDesktopArtifactPath);
    results.tokyo.screenshot = tokyoDesktopPath;
    console.log("Saved live Tokyo desktop screenshot:", tokyoDesktopPath);

    // Return to 2D Map
    await page.getByRole("button", { name: /back to 2d map/i }).click();
    await page.waitForTimeout(1000);
    results.returnTo2D = await page.getByRole("button", { name: /2d regional map/i }).isVisible();
    console.log("Return to 2D Map confirmed:", results.returnTo2D);

    // Live Plan for Tokyo
    results.currentCityPlan = "tokyo";
    console.log("Submitting Tokyo live plan request...");
    const tokyoSubmitBtn = page.locator("button[type='submit']").first();
    const [tokyoResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/plan") && res.request().method() === "POST"),
      tokyoSubmitBtn.click(),
    ]);
    const tokyoJson = await tokyoResponse.json();
    console.log("Tokyo API response:", tokyoJson.status, tokyoJson.modelUsed);

    // Wait for the plan status badge to show
    const tokyoBadgeLocator = page.locator("[data-testid='plan-status-badge']");
    await tokyoBadgeLocator.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);

    const tokyoBadge = await tokyoBadgeLocator.textContent();
    const tokyoHeadline = await page.locator("h3.text-lg, h3.text-xl, h3.text-2xl").first().textContent().catch(() => null);
    const tokyoIndoorAction = await page.locator("[data-testid='household-indoor-action']").textContent().catch(() => null);
    results.tokyoPlan.status = tokyoJson.status;
    results.tokyoPlan.modelUsed = tokyoJson.modelUsed;
    results.tokyoPlan.fallbackReason = tokyoJson.fallbackReason || null;
    results.tokyoPlan.badge = tokyoBadge?.trim();
    results.tokyoPlan.headline = tokyoHeadline?.trim();
    results.tokyoPlan.indoorAction = tokyoIndoorAction?.trim();
    console.log("Tokyo Plan result:", results.tokyoPlan);

    // Capture desktop Tokyo generated plan screenshot
    const tokyoPlanScreenshot = path.join(screenshotsDir, "live-tokyo-plan-desktop.png");
    const tokyoPlanArtifact = path.join(artifactsDir, "live-tokyo-plan-desktop.png");
    await page.screenshot({ path: tokyoPlanScreenshot });
    fs.copyFileSync(tokyoPlanScreenshot, tokyoPlanArtifact);

    // Switch back to Delhi for Delhi Live Plan
    results.currentCityPlan = "delhi";
    console.log("Switching to Delhi for Delhi live plan request...");
    const delhiDemoBtn = page.getByRole("button", { name: /delhi demo/i }).first();
    if (await delhiDemoBtn.isVisible()) {
      await delhiDemoBtn.click();
    } else {
      const cityInput = page.locator("input[placeholder*='city' i]").first();
      if (await cityInput.isVisible()) {
        await cityInput.fill("Delhi");
        await page.waitForTimeout(1000);
      }
    }
    await page.waitForTimeout(2000);

    const delhiSubmitBtn = page.locator("button[type='submit']").first();
    const [delhiResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/plan") && res.request().method() === "POST"),
      delhiSubmitBtn.click(),
    ]);
    const delhiJson = await delhiResponse.json();
    console.log("Delhi API response:", delhiJson.status, delhiJson.modelUsed);

    const delhiBadgeLocator = page.locator("[data-testid='plan-status-badge']");
    await delhiBadgeLocator.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);

    const delhiBadge = await delhiBadgeLocator.textContent();
    const delhiHeadline = await page.locator("h3.text-lg, h3.text-xl, h3.text-2xl").first().textContent().catch(() => null);
    const delhiIndoorAction = await page.locator("[data-testid='household-indoor-action']").textContent().catch(() => null);
    results.delhiPlan.status = delhiJson.status;
    results.delhiPlan.modelUsed = delhiJson.modelUsed;
    results.delhiPlan.fallbackReason = delhiJson.fallbackReason || null;
    results.delhiPlan.badge = delhiBadge?.trim();
    results.delhiPlan.headline = delhiHeadline?.trim();
    results.delhiPlan.indoorAction = delhiIndoorAction?.trim();
    console.log("Delhi Plan result:", results.delhiPlan);

    // Capture desktop Delhi generated plan screenshot
    const delhiPlanScreenshot = path.join(screenshotsDir, "live-delhi-plan-desktop.png");
    const delhiPlanArtifact = path.join(artifactsDir, "live-delhi-plan-desktop.png");
    await page.screenshot({ path: delhiPlanScreenshot });
    fs.copyFileSync(delhiPlanScreenshot, delhiPlanArtifact);

    await context.close();

    // 2. Mobile Context (390x844)
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(2500);

    // Open Delhi Immersive on mobile
    await mobilePage.getByRole("button", { name: /immersive 3d city/i }).click();
    await mobilePage.waitForTimeout(1500);
    const mobileExploreBtn = mobilePage.getByRole("button", { name: /explore illustrative city/i });
    if (await mobileExploreBtn.isVisible()) {
      await mobileExploreBtn.click();
      await mobilePage.waitForTimeout(2000);
    }

    const delhiMobilePath = path.join(screenshotsDir, "live-delhi-immersive-mobile.png");
    const delhiMobileArtifactPath = path.join(artifactsDir, "live-delhi-immersive-mobile.png");
    await mobilePage.screenshot({ path: delhiMobilePath });
    fs.copyFileSync(delhiMobilePath, delhiMobileArtifactPath);
    results.delhi.mobileScreenshot = delhiMobilePath;
    console.log("Saved live Delhi mobile screenshot:", delhiMobilePath);

    // Switch to Tokyo on mobile
    const mobileTokyoBtn = mobilePage.getByRole("button", { name: /tokyo demo/i });
    await mobileTokyoBtn.click();
    await mobilePage.waitForTimeout(2000);

    const mobileTokyoExploreBtn = mobilePage.getByRole("button", { name: /explore illustrative city/i });
    if (await mobileTokyoExploreBtn.isVisible()) {
      await mobileTokyoExploreBtn.click();
      await mobilePage.waitForTimeout(2000);
    }

    const tokyoMobilePath = path.join(screenshotsDir, "live-tokyo-immersive-mobile.png");
    const tokyoMobileArtifactPath = path.join(artifactsDir, "live-tokyo-immersive-mobile.png");
    await mobilePage.screenshot({ path: tokyoMobilePath });
    fs.copyFileSync(tokyoMobilePath, tokyoMobileArtifactPath);
    results.tokyo.mobileScreenshot = tokyoMobilePath;
    console.log("Saved live Tokyo mobile screenshot:", tokyoMobilePath);

    await mobileContext.close();

    fs.writeFileSync(
      "C:/Users/vazem/unmocked_results.json",
      JSON.stringify(results, null, 2),
      "utf8"
    );
    console.log("Finished unmocked inspection successfully.");
  } catch (err) {
    console.error("Unmocked inspection failed:", err);
  } finally {
    await browser.close();
  }
}

run();
