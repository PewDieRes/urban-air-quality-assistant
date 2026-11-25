# PromptWars Challenge 6 · Urban Air Quality Assistant Demo Guide

## Challenge Brief & Overview
Built for **PromptWars Virtual Challenge 6**, the Urban Air Quality Assistant is a worldwide GenAI web application designed to help households plan daily activities during smog, protect vulnerable family members, improve indoor air quality, and choose defensible lower-emission transport alternatives.

---

## Live Demo Walkthrough (Step-by-Step)

### Step 1: Initial Launch & Delhi-NCR Baseline
1. Open the web app. The application defaults to **Delhi-NCR** (`28.614°N, 77.209°E`, local timezone `Asia/Kolkata`).
2. **Current Conditions:** Observe the real-time or recent model estimate:
   - Current US AQI with categorical badge (e.g. *Very Unhealthy* / *Hazardous*)
   - Fine particulate concentration in **µg/m³ PM₂.₅**
   - Data source attribution explicitly labeled: **Regional model estimate** (Copernicus CAMS / Open-Meteo).
3. **Accessible 24-Hour Scrubber:**
   - Review the hourly timeline list displaying upcoming hours formatted in `Asia/Kolkata`.
   - Drag or click play on the 24-hour time scrubber beneath the map to watch regional atmospheric PM₂.₅ shifts across the National Capital Region without refetching the grid.

### Step 2: Interactive 2D & 3D Regional Map
1. **Regional Cells:** Look at the 3x3 bounded regional estimate cells rendered with standard US AQI colors.
2. **3D Perspective:** Click **3D View** on the top toolbar to tilt the camera into a 3D perspective over urban terrain. Click again to return to 2D view.
3. **NASA FIRMS Active Fires:** Ensure the **Fires** toggle is active to view recent satellite thermal detections upwind of the city. Clicking a fire marker reveals the satellite observation time and acknowledges that material burned is unknown.

### Step 3: Verified Atmospheric Smoke Transport Case
1. Click **Historical Smoke Case** in the map toolbar.
2. The map immediately renders the forward atmospheric transport trajectories from the November 3, 2024 stubble-burning episode in Punjab towards Delhi-NCR.
3. Notice the metadata banner:
   - Clear label: **Possible smoke paths**
   - Starting altitudes: **100m, 500m, and 1,000m AGL**
   - Scientific distinction: Path lines trace modeled air parcel movement; they do NOT claim quantitative mass concentrations or single-source blame. Total forecast PM₂.₅ is presented separately in the regional forecast.

### Step 4: Plan my day (Household Smog Planner)
1. Scroll to the planner card or click **Build my smog plan** from the map.
2. **Flexible Activities:** Review or edit the flexible activity (e.g. "Grocery shopping", duration 60, 90, or 120 minutes).
3. **Fixed Commitments:** Notice the preserved "School pickup" commitment that stays fixed.
4. **Transport & Emissions:** Specify an 8 km (default) or 10 km trip by Gasoline Car, and toggle available alternatives (such as Public Transit, Walking, Cycling, EV).
5. **Household Profile:** Toggle sensitive members and HEPA purifier presence, plus indoor budget tier.
6. Click **Find a time**:
   - The deterministic engine evaluates every eligible window with complete forecast coverage and ranks candidates by **time-weighted mean forecast PM₂.₅** across the full activity duration, avoiding the school pickup slot and other scheduled errands.
   - Separately displays outdoor forecast concentration comparisons (and states plainly when moving adds no forecast benefit) without claiming unmeasured personal inhaled dose.
   - Computes an estimated CO₂e difference using UK DESNZ/DEFRA (2024) reference factors (`~1.05 kg CO₂e` over `8 km` or `~1.32 kg CO₂e` over `10 km` when shifting solo car travel to rail transit), or omits numeric savings and names the missing input (`trip distance`, `available alternative travel mode`, or `carpool occupancy / avoided vehicle distance`) if unavailable.
   - Grounded Gemini reasoning explains indoor and transport trade-offs within household constraints without inventing times, measurements, or unavailable options.

### Step 5: Worldwide Repeatability (Tokyo Demo)
1. In the header bar, click **Tokyo Demo** (or search "Tokyo" in the city search).
2. The entire dashboard instantly recalculates:
   - Location switches to **Tokyo, Japan**
   - Local time zone dynamically switches to `Asia/Tokyo`
   - Regional forecast and map grid update to Japan's regional model
   - Plan recalculates according to Tokyo's local atmospheric diurnal cycle.

---

## Submission Artifacts

- **Public Web Application:** Deployed on Vercel Hobby
- **Source Repository:** [GitHub Repository URL]
- **Atmospheric Model:** NOAA HYSPLIT trajectory engine verified with ARL weather cycles
- **AI Model:** Google Gemini via REST API (defaults to `gemini-3.5-flash-lite`, overridable via `GEMINI_MODEL`, with retry to `gemini-flash-lite-latest` and deterministic fallback)

---

## LinkedIn Build Post Draft

```
Proud to share our submission for PromptWars Virtual Challenge 6: The Urban Air Quality Assistant! 🌍💨

Smog in major metropolitan areas like Delhi-NCR presents families with difficult daily choices: When is it safe to take the kids out? When should we run air purifiers? Can shifting our commute genuinely cut both our exposure and our city's emissions?

To solve this, we built a worldwide GenAI application using Antigravity, Next.js, and Google Gemini:
🔹 Regional Air Quality Modeling: 24-hour predictive PM₂.₅ & US AQI scrubbing powered by Open-Meteo & OpenFreeMap in both 2D and 3D views.
🔹 NASA FIRMS & NOAA HYSPLIT Smoke Transport: Traceable atmospheric trajectory modeling at 100m, 500m, and 1000m altitudes, coupled with agricultural alternatives to open biomass burning.
🔹 Grounded Household Smog Assistant: Deterministic constraint solving preserves fixed commitments (like school pickups) and finds optimal low-exposure windows, while Gemini delivers validated, grounded routines with zero hallucinated times.
🔹 Global Repeatability: Tested and validated from Delhi-NCR to Tokyo with localized timezones and meteorological grids.

Built and verified end-to-end with Google DeepMind's Antigravity agentic workflows! 🚀

#PromptWars #GenAI #Antigravity #AirQuality #CleanAir #Gemini #NextJS #OpenSource #Sustainability
```
