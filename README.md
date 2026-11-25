# Urban Air Quality Assistant

> A worldwide GenAI web app built for **PromptWars Virtual Challenge 6** helping families and communities plan activities during smog, improve indoor air quality, and select lower-emission alternatives.

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-2.1-green)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-purple)](https://playwright.dev/)
[![Google Gemini](https://img.shields.io/badge/Gemini-3.5_Flash--Lite-orange)](https://deepmind.google/technologies/gemini/)

---

## Chosen Vertical & Target Persona

- **Chosen Vertical:** Urban Environmental Health & Daily Household Mobility Planning (Smog Episode Resilience).
- **Target Persona:** Urban families and vulnerable households (children, older adults, and individuals with asthma or cardiopulmonary sensitivities) who must keep immovable daily commitments such as school pickups while minimizing outdoor PM₂.₅ exposure during flexible errands, strengthening indoor air protection within budget, and choosing realistic lower-emission transport modes.

---

## Approach and Logic

The assistant separates **deterministic factual calculation** from **language generation** so an LLM never invents schedules, PM₂.₅ concentrations, or emissions savings:

1. **Constraint-First Activity Scheduling:** Fixed commitments (e.g., school pickup) are locked first. Every hourly candidate slot inside the flexible errand window is checked for zero conflict and **100% forecast coverage across the full duration**.
2. **Duration-Weighted Exposure Ranking:** Rather than sorting by start-hour readings alone, each eligible slot is scored using the **time-weighted mean forecast PM₂.₅** across overlapping hourly intervals (for instance, a 90-minute trip starting on the hour weights 60 minutes from hour `H` and 30 minutes from hour `H+1`), breaking exact ties by earliest start time.
3. **Quantified Emissions Only When Defensible:** Transport emissions reductions (`kg CO₂e`) are calculated strictly when trip distance and verified parameters (public transit availability, carpool occupancy `>= 2`, or explicit avoided vehicle-km) are present, using published UK DESNZ / DEFRA 2024 factors. Otherwise, numeric savings are omitted and missing inputs are disclosed cleanly.
4. **Grounded Gemini Narrative with Deterministic Fallback:** Gemini receives structured JSON facts and is constrained by Zod schema verification, category-specific `evidenceFactId` rules, regex claim checks, and purifier/mode availability guards. Any timeout, HTTP error, or ungrounded claim falls back transparently to deterministic verified guidance (`Forecast-based plan`).

---

## How the Solution Works

1. **Worldwide Location & Hourly Forecast:** City search, geolocation, or preset demos (`Delhi-NCR`, `Tokyo Demo`) fetch 24-hour regional hourly PM₂.₅ and US AQI forecasts from Open-Meteo and display them in the selected city's local timezone with stale-response guards.
2. **Household Schedule Evaluation (`/api/plan`):** Computes deterministic facts (`computePlanFacts`) and requests structured narrative explanations from Google Gemini (`generatePlan`, defaulting to `gemini-3.5-flash-lite` with one retry to `gemini-flash-lite-latest`), returning verified numbers, badges (`Explained by Gemini` or `Forecast-based plan`), indoor tips matched to HEPA availability/budget, and transport trade-offs.
3. **Regional Map, Active Fires & Smoke Trajectory Context:** An interactive MapLibre GL JS 2D view displays a 3×3 US AQI grid across a 24-hour scrubber, overlays NASA FIRMS active fires (`/api/fires`), offers a procedural illustrative 3D city haze viewer, and surfaces the verified November 3, 2024 historical HYSPLIT trajectory case (`public/smoke/historical.geojson`) labeled as **Possible smoke paths**.

---

## Assumptions Made

- **Forecast Coverage & Time-Step Granularity:** Open-Meteo provides hourly forecast intervals; candidate activities require complete coverage across the full duration, and sub-hour variations are not interpolated beyond hourly block weights.
- **Outdoor Concentration vs. Personal Dose:** Percent reductions compare ambient outdoor forecast PM₂.₅ concentration across candidate hours; true personal inhaled dose depends on unmeasured breathing rates, cabin filters, and indoor infiltration.
- **Geographic Transferability of Emissions Factors:** CO₂e estimates rely on **UK DESNZ / DEFRA (2024)** reference factors (`0.16725 kg CO₂e/vehicle-km` passenger car vs. `0.03549 kg CO₂e/passenger-km` national rail / `0.10215 kg CO₂e/passenger-km` local bus) and flag `isOutsideReferenceGeography` outside the UK since local electricity grids and vehicle fleets differ.
- **Single-Household Scope:** Shifting one family errand reduces household emissions and exposure but does not measurably alter citywide AQI.
- **Smoke Trajectory & 3D Rendering Fallbacks:** Because multi-gigabyte NOAA ARL weather cycles (`800 MB–2.2 GB`) exceed free serverless limits, hosted deployments gracefully fall back to the documented historical Nov 3, 2024 smoke case unless `SMOKE_SERVICE_URL` points to an external runner. With `NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY` unset, the 3D scene renders an illustrative procedural skyline with zero GCP billing.

---

## Key Features

1. **Worldwide Air Quality Forecasting & Disambiguation**
   - Geolocation permission handling and instant worldwide city search (Open-Meteo Geocoding).
   - Real-time and 24-hour predictive PM₂.₅ concentrations and US AQI scale in the location's local time zone.
   - Guarded against stale out-of-order network responses.

2. **Interactive 2D & 3D Regional Map**
   - Built with MapLibre GL JS and OpenFreeMap vector basemaps.
   - Bounded 3x3 regional grid cells colored by US AQI standards.
   - Smooth 24-hour timeline scrubber slider that updates visual cell colors without refetching network grids.
   - One-click toggle between 2D and 3D perspective views.

3. **Grounded Household Planning Assistant ("Plan my day")**
   - Deterministic constraint evaluation: ranks eligible candidate slots across the full activity duration using time-weighted mean forecast PM₂.₅ (requiring complete forecast coverage), avoids overlapping activities, and strictly preserves fixed commitments (e.g. school pickups). Compares outdoor forecast concentrations without claiming personal inhaled dose or citywide AQI shifts.
   - Defensible transport emissions comparison: quantifies kg CO₂e savings using UK DESNZ/DEFRA (2024) conversion factors only when trip distance and an eligible alternative, carpool occupancy, or avoided vehicle distance are provided, and omits numeric savings with explicit missing-input notices otherwise.
   - Google Gemini structured response with Zod schema enforcement, category-specific fact ID checks, and household/transport constraint validation, preventing hallucinated measurements or unavailable mode/purifier assumptions.
   - Browser `localStorage` persistence retaining household preferences across location changes.

4. **Satellite Active Fires & NOAA HYSPLIT Smoke Trajectory Modeling**
   - NASA FIRMS satellite fire detections with UTC observation times and antimeridian crossing support.
   - Traceable historical atmospheric trajectory case from the November 3, 2024 Punjab agricultural burning episode towards Delhi-NCR modeled at 100m, 500m, and 1,000m altitudes above ground.
   - Scientifically labeled: **Possible smoke paths** (air movement trajectory, avoiding misleading single-source attribution claims).
   - Integrated alternatives to open residue burning (in-situ Happy Seeder mulching, bio-pellets, microbial decomposers).

---

## Tech Stack

- **Frontend & API:** Next.js 15 (`15.5.29` App Router), React 19 (`19.3.1`), TypeScript, Tailwind CSS, Lucide Icons
- **Mapping:** MapLibre GL JS, OpenFreeMap vector tiles
- **Environmental Data:** Open-Meteo Air Quality API, NASA FIRMS
- **GenAI Reasoning:** Google Gemini via REST API (defaults to `gemini-3.5-flash-lite` in `lib/plan/gemini.ts`, retrying once with `gemini-flash-lite-latest`; override the primary model via `GEMINI_MODEL`) with Zod validation, household/transport grounding checks, and deterministic fallback
- **Atmospheric Modeling:** NOAA HYSPLIT, Python 3.11, FastAPI, Pydantic, Docker
- **Testing:** Vitest (unit & integration), Playwright (browser end-to-end), Pytest (Python runner)

---

## Getting Started

### Prerequisites
- Node.js 20.9+ (required by `sharp@0.35.5` and Next.js 15; CI tests on Node 22, also verified on Node 24)
- Python 3.11 (for smoke trajectory service; matches CI)

### Installation
```bash
# Clone the repository
git clone <repo-url>
cd urban-air-quality-assistant

# Install frontend dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Add your GEMINI_API_KEY and FIRMS_MAP_KEY
```

### Running Locally
```bash
npm run dev
# Open http://localhost:3000
```

### Verification & Testing
```bash
# Run unit & normalization tests (Vitest)
npm test

# Run browser end-to-end tests (Playwright)
npm run test:e2e

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run Python HYSPLIT runner tests (from services/smoke working directory)
cd services/smoke && python -B -m pytest tests -q

# Build production bundle
npm run build
```

---

## Documentation

- [Design Specification](docs/urban-air-quality-assistant-design.md)
- [Implementation Plan](docs/urban-air-quality-assistant-implementation-plan.md)
- [Historical Smoke Case Provenance](docs/smoke-case.md)
- [Deployment & Model Verification](docs/deployment.md)
- [Demo Guide & Walkthrough](docs/demo.md)
