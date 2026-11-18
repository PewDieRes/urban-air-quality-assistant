# Urban Air Quality Assistant

> A worldwide GenAI web app built for **PromptWars Virtual Challenge 6** helping families and communities plan activities during smog, improve indoor air quality, and select lower-emission alternatives.

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-2.1-green)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.49-purple)](https://playwright.dev/)
[![Google Gemini](https://img.shields.io/badge/Gemini-3.8_Flash-orange)](https://deepmind.google/technologies/gemini/)

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

3. **Grounded Household Planning Assistant ("Build My Smog Plan")**
   - Deterministic constraint evaluation: analyzes diurnal air quality cycles, finds optimal hours with lowest particulate exposure, and strictly preserves fixed commitments (e.g. school pickups).
   - Defensible transport emissions comparison (quantifies saved kg CO₂ when distance inputs are provided).
   - Google Gemini structured response with schema validation and fact ID verification, preventing hallucinated hours or fake measurements.
   - Browser `localStorage` persistence retaining household preferences across location changes.

4. **Satellite Active Fires & NOAA HYSPLIT Smoke Trajectory Modeling**
   - NASA FIRMS satellite fire detections with UTC observation times and antimeridian crossing support.
   - Traceable historical atmospheric trajectory case from the November 3, 2024 Punjab agricultural burning episode towards Delhi-NCR modeled at 100m, 500m, and 1,000m altitudes above ground.
   - Scientifically labeled: **Possible smoke paths** (air movement trajectory, avoiding misleading single-source attribution claims).
   - Integrated alternatives to open residue burning (in-situ Happy Seeder mulching, bio-pellets, microbial decomposers).

---

## Tech Stack

- **Frontend & API:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Lucide Icons
- **Mapping:** MapLibre GL JS, OpenFreeMap vector tiles
- **Environmental Data:** Open-Meteo Air Quality API, NASA FIRMS
- **GenAI Reasoning:** Google Gemini 3.8 Flash via REST API (`GEMINI_MODEL="gemini-3.8-flash"`) with strict Zod schema validation, grounded server-side facts, and deterministic fallback
- **Atmospheric Modeling:** NOAA HYSPLIT, Python 3.11, FastAPI, Pydantic, Docker
- **Testing:** Vitest (unit & integration), Playwright (browser end-to-end), Pytest (Python runner)

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node 20 & 24)
- Python 3.10+ (for smoke trajectory service)

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
