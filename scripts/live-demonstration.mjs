import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const screenshotsDir = "C:/Users/vazem/.gemini/antigravity-cli/brain/666b0fd3-02b5-4222-9992-9838ffe390f5/screenshots";
const artifactsDir = "C:/Users/vazem/.gemini/antigravity-cli/brain/666b0fd3-02b5-4222-9992-9838ffe390f5";

async function runLiveDemo() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    delhi: {},
    tokyo: {},
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    console.log("Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // ==========================================
    // 1. DELHI RUN
    // ==========================================
    console.log("\n--- Starting Live Delhi Run ---");
    const delhiLocation = await page.getByTestId("selected-location-name").textContent();
    console.log("Current City:", delhiLocation?.trim());

    // Fill Delhi inputs for November 25, 2026
    const commStart = page.getByLabel("Commitment start", { exact: true });
    const commEnd = page.getByLabel("Commitment end", { exact: true });
    const actStart = page.getByLabel("Activity start", { exact: true });
    const actEnd = page.getByLabel("Activity end", { exact: true });

    await commStart.fill("2026-11-25T15:00");
    await commEnd.fill("2026-11-25T15:30");
    await actStart.fill("2026-11-25T16:00");
    await actEnd.fill("2026-11-25T20:00");
    await page.waitForTimeout(500);

    console.log("Inputs set: Pickup 15:00-15:30, Grocery 16:00-20:00 on 2026-11-25");

    const submitBtn = page.locator("button[type='submit']").first();
    const t0Delhi = Date.now();

    const [delhiResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/plan") && res.request().method() === "POST"),
      submitBtn.click(),
    ]);

    const t1Delhi = Date.now();
    const delhiElapsedMs = t1Delhi - t0Delhi;
    const delhiApiData = await delhiResponse.json();

    await page.waitForSelector("[data-testid='plan-status-badge']", { state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);

    const delhiBadge = await page.locator("[data-testid='plan-status-badge']").textContent();
    const delhiHeadline = await page.locator("h3.text-lg, h3.text-xl, h3.text-2xl").first().textContent();
    const delhiExplanation = await page.locator("p.text-xs.text-stone-700").first().textContent();
    const delhiIndoorAction = await page.locator("[data-testid='household-indoor-action']").textContent();

    results.delhi = {
      city: "Delhi-NCR",
      localDate: "2026-11-25",
      timeZone: "Asia/Kolkata",
      status: delhiApiData.status,
      modelUsed: delhiApiData.modelUsed,
      fallbackReason: delhiApiData.fallbackReason || null,
      elapsedTimeMs: delhiElapsedMs,
      elapsedTimeFormatted: `${(delhiElapsedMs / 1000).toFixed(2)}s`,
      badge: delhiBadge?.trim(),
      headline: delhiHeadline?.trim(),
      explanation: delhiExplanation?.trim(),
      exactGeminiSentence: delhiIndoorAction?.trim(),
    };

    console.log("Delhi Run Results:", JSON.stringify(results.delhi, null, 2));

    const delhiScreenshot = path.join(screenshotsDir, "live-delhi-gemini-plan.png");
    const delhiArtifact = path.join(artifactsDir, "live-delhi-gemini-plan.png");
    await page.screenshot({ path: delhiScreenshot, fullPage: true });
    fs.copyFileSync(delhiScreenshot, delhiArtifact);

    if (delhiApiData.status === "deterministic_fallback") {
      console.error(`Delhi run fell back with reason: ${delhiApiData.fallbackReason}. Stopping per instructions.`);
      fs.writeFileSync("C:/Users/vazem/live_demo_results.json", JSON.stringify(results, null, 2), "utf8");
      await browser.close();
      return;
    }

    // ==========================================
    // 2. TOKYO RUN
    // ==========================================
    console.log("\n--- Starting Live Tokyo Run ---");
    // Pause 5s to respect rate limits between consecutive city calls on free tier
    await page.waitForTimeout(5000);

    const tokyoDemoBtn = page.getByRole("button", { name: /tokyo demo/i });
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/forecast") && res.status() === 200),
      tokyoDemoBtn.click(),
    ]);
    await page.waitForTimeout(2000);

    const tokyoLocation = await page.getByTestId("selected-location-name").textContent();
    console.log("Switched City:", tokyoLocation?.trim());

    // Fill Tokyo inputs for November 25, 2026
    const tokyoCommStart = page.getByLabel("Commitment start", { exact: true });
    const tokyoCommEnd = page.getByLabel("Commitment end", { exact: true });
    const tokyoActStart = page.getByLabel("Activity start", { exact: true });
    const tokyoActEnd = page.getByLabel("Activity end", { exact: true });

    await tokyoCommStart.fill("2026-11-25T15:00");
    await tokyoCommEnd.fill("2026-11-25T15:30");
    await tokyoActStart.fill("2026-11-25T16:00");
    await tokyoActEnd.fill("2026-11-25T20:00");
    await page.waitForTimeout(500);

    console.log("Inputs set: Pickup 15:00-15:30, Grocery 16:00-20:00 on 2026-11-25 in Tokyo");

    const tokyoSubmitBtn = page.locator("button[type='submit']").first();
    const t0Tokyo = Date.now();

    const [tokyoResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/plan") && res.request().method() === "POST"),
      tokyoSubmitBtn.click(),
    ]);

    const t1Tokyo = Date.now();
    const tokyoElapsedMs = t1Tokyo - t0Tokyo;
    const tokyoApiData = await tokyoResponse.json();

    await page.waitForSelector("[data-testid='plan-status-badge']", { state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);

    const tokyoBadge = await page.locator("[data-testid='plan-status-badge']").textContent();
    const tokyoHeadline = await page.locator("h3.text-lg, h3.text-xl, h3.text-2xl").first().textContent();
    const tokyoExplanation = await page.locator("p.text-xs.text-stone-700").first().textContent();
    const tokyoIndoorAction = await page.locator("[data-testid='household-indoor-action']").textContent();

    results.tokyo = {
      city: "Tokyo",
      localDate: "2026-11-25",
      timeZone: "Asia/Tokyo",
      status: tokyoApiData.status,
      modelUsed: tokyoApiData.modelUsed,
      fallbackReason: tokyoApiData.fallbackReason || null,
      elapsedTimeMs: tokyoElapsedMs,
      elapsedTimeFormatted: `${(tokyoElapsedMs / 1000).toFixed(2)}s`,
      badge: tokyoBadge?.trim(),
      headline: tokyoHeadline?.trim(),
      explanation: tokyoExplanation?.trim(),
      exactGeminiSentence: tokyoIndoorAction?.trim(),
    };

    console.log("Tokyo Run Results:", JSON.stringify(results.tokyo, null, 2));

    const tokyoScreenshot = path.join(screenshotsDir, "live-tokyo-gemini-plan.png");
    const tokyoArtifact = path.join(artifactsDir, "live-tokyo-gemini-plan.png");
    await page.screenshot({ path: tokyoScreenshot, fullPage: true });
    fs.copyFileSync(tokyoScreenshot, tokyoArtifact);

    if (tokyoApiData.status === "deterministic_fallback") {
      console.error(`Tokyo run fell back with reason: ${tokyoApiData.fallbackReason}. Stopping per instructions.`);
      fs.writeFileSync("C:/Users/vazem/live_demo_results.json", JSON.stringify(results, null, 2), "utf8");
      await browser.close();
      return;
    }

    fs.writeFileSync("C:/Users/vazem/live_demo_results.json", JSON.stringify(results, null, 2), "utf8");
    console.log("\nFinished live demonstration successfully for both cities!");

    await context.close();
  } catch (err) {
    console.error("Live demo failed:", err);
  } finally {
    await browser.close();
  }
}

runLiveDemo();
