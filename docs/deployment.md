# Deployment & Atmospheric Model Verification Guide

## 1. Web Application Deployment (Vercel)
- **Framework:** Next.js 14 App Router
- **Target Platform:** Vercel Hobby tier
- **Environment Variables:**
  - `GEMINI_API_KEY`: Google Gemini API key for structured planning narratives and smoke explanations.
  - `FIRMS_MAP_KEY`: NASA FIRMS Map Key for real-time VIIRS/MODIS fire detections.
  - `SMOKE_SERVICE_URL` (optional): URL of verified external HYSPLIT container service.
  - `SMOKE_SERVICE_TOKEN` (optional): Bearer credential for the runner.

## 2. HYSPLIT Atmospheric Modeling Verification
### Licensing and Distribution
- **Model Distribution:** NOAA Air Resources Laboratory (ARL) HYSPLIT (Hybrid Single-Particle Lagrangian Integrated Trajectory) model.
- **License Terms:** Unregistered/public version is permitted for research and non-commercial educational demonstrations. Redistribution of binary executables is governed by NOAA ARL licensing; per guidelines, proprietary compiled binaries are excluded from the git repository and provisioned via container build or external runner.

### Meteorological Weather Files
- **Format:** ARL packed binary format (e.g. `gfs.t06z.pgrb2.0p25` or `current.arl`).
- **File Sizes:** GFS 0.25° global cycles average **800 MB to 2.2 GB** per 24-hour cycle.
- **Feasibility on Free Tier Hosts (Render Free / Vercel):**
  - **Memory Limit:** Free tiers provide 512 MB RAM with ephemeral disks. Downloading and unpacking multi-gigabyte ARL weather files on demand exhausts free-tier memory and triggers container spin-down or timeout.
  - **Graceful Fallback Policy:** The implementation plan requires: *"If access, data, or host limits prevent a successful run, leave live paths disabled and retain the historical demo. Finish the remaining public app tasks independently."*
  - **System Behavior:** When an external live runner is not configured or lacks local ARL weather grids, the app gracefully returns status `unavailable` and guides the user to the verified historical case (`public/smoke/historical.geojson`), preventing failed user experiences while maintaining full scientific traceability.

## 3. Production Verification Checklist
- [x] TypeScript typechecking zero errors (`npm run typecheck`)
- [x] ESLint rules pass with zero warnings (`npm run lint`)
- [x] All unit test suites pass (`npm test`)
- [x] Playwright browser end-to-end tests pass (`npm run test:e2e`)
- [x] Next.js production build completes (`npm run build`)
- [x] Python HYSPLIT adapter tests pass (`python -m pytest services/smoke/tests`)
