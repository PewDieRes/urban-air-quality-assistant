# Urban Air Quality Assistant Implementation Plan

> **For the Antigravity builder:** Use the Superpowers execution workflow available in your environment and work through the checkboxes in order. The model feasibility check in Task 7 can run in parallel with the web app.

**Goal:** Ship a worldwide air quality forecast, household planning assistant, and smoke transport feature for PromptWars Virtual Challenge 6.

**Architecture:** A Next.js app owns location selection, map state, provider API routes, and the plan. Deterministic code produces forecast comparisons, and Gemini explains them in a validated response. A separate Python service computes live HYSPLIT trajectories after verification.

**Tech stack:** Next.js App Router, TypeScript, Tailwind CSS, MapLibre GL JS, OpenFreeMap, Open-Meteo, Gemini, NASA FIRMS, Python, FastAPI, Docker, HYSPLIT, Vercel Hobby, and Render Free.

**Approved spec:** [Urban Air Quality Assistant design](./urban-air-quality-assistant-design.md).

## Project constraints

- Use normal product language. Identify provider data, local times, AQI scale, and units next to the values.
- Show regional estimates at regional resolution. Display satellite detections, modeled trajectories, and total forecast PM₂.₅ as distinct data.
- Use Delhi-NCR and a city outside India in acceptance tests. Use Tokyo as the second city.
- Store preferences in the browser. Keep provider keys server-side. The initial deployment uses no hosted database.
- Start with a verified historical smoke case and fresh fire detections. Enable live paths only after the exact trajectory mode works locally and on the public host.
- Defer optional fog and OpenAQ. They do not block any acceptance check.
- Keep provider fixtures in tests. Use real provider data in the deployed demo. For an unavailable provider, show the error or degraded state.
- Add a focused test for each named case below. Run the named test before the behavior exists, implement it, run it again, and commit each passing task separately. Run targeted commands from the relevant package root.

## File map

| Files | Responsibility |
| --- | --- |
| `app/page.tsx`, `components/location/location-picker.tsx`, `app/api/locations/route.ts`, `lib/location/search.ts` | Entry state, location permission, and city search |
| `lib/forecast/types.ts`, `lib/forecast/open-meteo.ts`, `app/api/forecast/route.ts`, `components/forecast/forecast-panel.tsx` | Forecast normalization, data source, and accessible summary |
| `components/map/air-quality-map.tsx`, `lib/map/regional-cells.ts`, `app/api/forecast/grid/route.ts` | Regional tiles, 2D/3D controls, and time-based coloring |
| `lib/plan/types.ts`, `lib/plan/facts.ts`, `lib/plan/gemini.ts`, `app/api/plan/route.ts`, `components/plan/plan-panel.tsx` | Plan inputs, calculations, validated generation, and results |
| `lib/fires/firms.ts`, `app/api/fires/route.ts`, `components/map/fire-layer.ts` | Recent detections, timestamps, and marker rendering |
| `public/smoke/historical.geojson`, `docs/smoke-case.md`, `lib/smoke/types.ts`, `components/map/smoke-layer.ts` | Historical case, smoke response contract, and path rendering |
| `services/smoke/app.py`, `services/smoke/hysplit.py`, `services/smoke/Dockerfile`, `app/api/smoke/jobs/route.ts`, `app/api/smoke/jobs/[id]/route.ts`, `app/api/smoke/explain/route.ts` | Live run, polling, limits, and Gemini explanation |
| `.env.example`, `README.md`, `docs/deployment.md`, `docs/demo.md`, `tests/e2e/demo.spec.ts` | Setup, deployment, demo, and end-to-end checks |

## Shared API contracts

- JSON errors use `{ error: { code: string; message: string } }`. Use 400 for invalid requests, 429 for request limits, and 503 for provider failures that have no useful fallback.
- `GET /api/locations` returns `{ places: Place[] }`. The current location passed to the forecast and plan is a separate coordinate pair so browser geolocation works without a search result.
- `GET /api/forecast/grid` and `GET /api/fires` use `west`, `south`, `east`, and `north`. The grid also requires `lat` and `lon` for its focal point. `GET /api/fires` returns `{ fires: FireDetection[] }`. A partial grid result includes the cells with available forecasts.
- `POST /api/plan` takes `{ lat: number; lon: number; input: PlanInput }`. It returns `{ status: "ready"; facts: PlanFacts; narrative: PlanNarrative }` or `{ status: "generation_unavailable"; facts: PlanFacts }`. The renderer derives any numeric statement from a fact shown to the user.
- `POST /api/smoke/jobs` takes `{ fireId: string }`. The web route resolves coordinates and observation time from a verified detection reference. An expired reference asks the user to refresh the detections. The server sends the verified metadata to the protected runner. Job start and status use `{ id: string; state: "queued" | "running" | "complete" | "unavailable"; result?: SmokePathSet; reason?: string }`. The result is present when complete.
- `SmokePathSet` contains `{ paths: FeatureCollection; metadata: SmokeMetadata }`. Each GeoJSON line feature stores `timestamps: string[]` and `startHeightM: number` in its properties. In the static historical GeoJSON, store companion metadata at the top level and normalize the document to the same contract when loaded.

## Review focus

| Failure mode | Owning task and check |
| --- | --- |
| A user denies location access and a search response arrives late. | Task 1 keeps manual search usable and ignores stale results. |
| A forecast crosses midnight or a daylight-saving clock change. | Task 2 keeps timestamps distinct, sorted, and correctly formatted. |
| A map interaction would fetch too many points or WebGL fails. | Task 3 bounds the grid and keeps the forecast list available. |
| The forecast has gaps or Gemini returns invalid advice. | Tasks 4 and 5 preserve commitments and show verified facts. |
| A smoke job loses weather files or stalls during a demo. | Tasks 7 and 8 show an unavailable state and preserve the historical example. |

## Milestone A · Worldwide forecast and map

### Task 1 · Location entry

- [ ] Scaffold Next.js App Router with TypeScript, Tailwind CSS, ESLint, Vitest, and Playwright. Add scripts for `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`. Add `.env.example` with `GEMINI_API_KEY` and `FIRMS_MAP_KEY` placeholders.
- [ ] In `tests/location.test.ts`, add `cityResultsAreDisambiguated`. Given two results with the same name, assert that each display option includes region and country and has a stable ID. Add the browser test **location access** in `tests/e2e/demo.spec.ts`. Deny geolocation, search for a city, and assert that a selection remains possible. Delay an older search response and assert that it cannot replace newer results.
- [ ] Run `npm test -- tests/location.test.ts` and `npm run test:e2e -- --grep "location access"`. Expect the new behavior tests to fail until the route and selection UI exist.
- [ ] Implement `searchLocations(query: string): Promise<Place[]>` in `lib/location/search.ts`. Define `Place = { id: string; name: string; region?: string; country?: string; lat: number; lon: number; timeZone?: string }`. Expose `GET /api/locations?q=...` with bounded input and result count. Debounce search and guard stale responses. Show Delhi-NCR as the initial demo selection. Accept browser coordinates if the user grants access and leave city search available if they decline.
- [ ] Re-run targeted tests and commit `feat: add worldwide location selection`.

### Task 2 · Regional forecast and time display

- [ ] In `tests/forecast.test.ts`, add `forecastUsesUniqueInstants`. Feed a forecast that crosses midnight and one that repeats a wall-clock hour during a clock change. Assert that absolute timestamps are distinct and in order and that missing measurements stay null. Assert the display uses the selected location’s time zone.
- [ ] Run `npm test -- tests/forecast.test.ts`. Expect the normalization tests to fail before the provider adapter exists.
- [ ] Implement `getForecast(lat: number, lon: number): Promise<Forecast>` in `lib/forecast/open-meteo.ts`. Define `AirSample = { at: string; pm25: number | null; usAqi: number | null }` and `Forecast = { lat: number; lon: number; timeZone: string; source: "Open-Meteo"; current: AirSample | null; hourly: AirSample[] }` in `lib/forecast/types.ts`. Use UTC instants in the API and format them with the location’s time zone. Return up to 24 future hourly slots. Validate coordinates in `GET /api/forecast?lat=...&lon=...`.
- [ ] Show the current estimate and accessible hourly list in `components/forecast/forecast-panel.tsx`. Use **Regional model estimate**, **US AQI**, and **µg/m³**. Provide loading, missing-value, and retry states.
- [ ] Re-run `npm test -- tests/forecast.test.ts`, then commit `feat: show 24-hour regional air quality`.

### Task 3 · Interactive 2D and 3D map

- [ ] In `tests/map-grid.test.ts`, add `viewportUsesBoundedRegionalSamples`. Assert that there are at most nine requested cells, wrapped viewports select valid longitudes, and an hourly value can be selected from existing data. Add the browser test **forecast map** to verify that slider changes update the displayed hour without refetching the grid and that the forecast list survives a map failure.
- [ ] Run `npm test -- tests/map-grid.test.ts` and `npm run test:e2e -- --grep "forecast map"`. Expect the new behavior tests to fail.
- [ ] Define `Bounds = { west: number; south: number; east: number; north: number }` and `regionalCells(bounds: Bounds, focused: { lat: number; lon: number }): RegionalCell[]` in `lib/map/regional-cells.ts`. Use `RegionalCell = { id: string; bounds: Bounds; lat: number; lon: number }`. A bounded sample may leave cells uncolored at wide zoom levels. Expose `GET /api/forecast/grid` with bounds and focus coordinates. Return `{ cell: RegionalCell; forecast: Forecast }[]` and reuse provider requests for overlapping cells.
- [ ] Render color polygons, a legend, an accessible 24-hour slider, selection, and **Build my smog plan**. Apply a consistent legend across cities. Add the 3D building toggle where the tile data supports it. Keep a 2D view and show **No estimate** for missing values.
- [ ] Re-run the tests and verify Delhi-NCR and Tokyo in development. Commit `feat: add the interactive regional forecast map`.

## Milestone B · Household assistant

### Task 4 · Inputs and deterministic facts

- [ ] In `tests/plan-facts.test.ts`, add `keepsFixedPickupAndChoosesValidLaterHour`. Give the calculation a fixed 15:00 local pickup, a 16:00–20:00 grocery window, PM₂.₅ values of 120 at 16:00 and 80 at 18:00, and a missing value at 17:00. Assert that it selects 18:00 from valid candidates, preserves pickup, and returns no emission quantity without the necessary inputs. Also test an activity with a duration that overlaps a fixed commitment.
- [ ] Run `npm test -- tests/plan-facts.test.ts`. Expect the new tests to fail.
- [ ] Define `PlanInput` in `lib/plan/types.ts` with one or more flexible activities, optional fixed commitments, and optional transport, household, and budget details. Store schedule times as instants and display in the selected time zone. Each flexible activity has an ID, an allowed interval, and a duration. Define `PlanFacts` with fixed commitments, each activity’s eligible hourly candidates and best candidate, and any defensible transport comparison. Implement `computePlanFacts(input: PlanInput, forecast: Forecast): PlanFacts` in `lib/plan/facts.ts`. Resolve ties with the earliest eligible hour. Show the original forecast when no improvement can be established.
- [ ] Build the form in `components/plan/plan-panel.tsx`. Open with one activity. Add optional fixed commitments and additional activities. Persist preferences locally and retain them when location changes. Request distance data only when useful for a comparison.
- [ ] Re-run the tests and commit `feat: calculate household planning facts`.

### Task 5 · Gemini generation and verified results

- [ ] In `tests/plan-route.test.ts`, add `invalidGenerationReturnsFacts`. Stub malformed output and an invented time or fact ID. Assert that calculated options remain available, the incomplete model result is not displayed, and the user can retry. Add a successful test that renders daily routine, indoor air, sustainable alternatives, and direct impacts.
- [ ] Run `npm test -- tests/plan-route.test.ts`. Expect failures before the server route and schema exist.
- [ ] Implement `generatePlan(input: PlanInput, facts: PlanFacts): Promise<PlanNarrative>` in `lib/plan/gemini.ts`. Define the structured response in `lib/plan/types.ts`. Use fact IDs to associate recommendations with time and numerical evidence. Give each recommendation an action, reason, possible beneficiary, and impact type. Validate the schema and fact references. Render dates, values, and quantities from application facts. Show a qualitative result if comparison inputs are missing.
- [ ] Implement `POST /api/plan`. Accept selected coordinates and `PlanInput`. Use server-fetched forecast data and server-calculated facts. Limit request size and apply a request limit and timeout. Return validated narrative with facts, or facts with an unavailable status. Keep `GEMINI_API_KEY` on the server.
- [ ] Re-run the tests, verify one real Gemini response using the configured model, and commit `feat: generate a grounded household plan`.

## Milestone C · Fire and smoke

### Task 6 · Recent fire detections and historical case

- [ ] In `tests/fires.test.ts`, add `firmsRowsKeepUtcObservationTimes`. Assert correct parse of a UTC date and zero-padded observation time, valid coordinates, and a clear upstream unavailable state. Add the browser test **historical smoke** that opens the historical example after a simulated live service failure.
- [ ] Run `npm test -- tests/fires.test.ts` and `npm run test:e2e -- --grep "historical smoke"`. Expect the new checks to fail.
- [ ] Implement `listFires(bounds: Bounds): Promise<FireDetection[]>` in `lib/fires/firms.ts`. Define `FireDetection = { id: string; lat: number; lon: number; observedAt: string; source: "NASA FIRMS" }`. Expose `GET /api/fires` with validated viewport bounds, bounded queries, caching, and limits when panning. Support antimeridian crossing with two bounded provider requests. Cluster detections and show observation time.
- [ ] Define `SmokePathSet` in `lib/smoke/types.ts` as a GeoJSON FeatureCollection of lines whose properties include ordered timestamps for the coordinates and starting height in meters. Include the run mode, source coordinates, observation time, run time, and weather cycle in companion metadata. Add one real, reproducible historical HYSPLIT case in `public/smoke/historical.geojson`. Record its data sources and model settings in `docs/smoke-case.md`. Show the date, path legend, and time control. Keep citywide PM₂.₅ as a separate forecast.
- [ ] Re-run the tests, validate the historical file against the path contract, and commit `feat: show fire detections and a historical smoke case`.

### Task 7 · Prove HYSPLIT works on the target host

- [ ] Document the HYSPLIT distribution, supported trajectory mode, NOAA weather input format, and whether the release terms permit the planned deployment. Keep licensed binaries out of the source repo if required by the distribution. Use the same model mode for the local and hosted checks.
- [ ] In `services/smoke/tests/test_hysplit.py`, add `test_trajectory_adapter_requires_weather_and_aligns_times`. Assert a missing weather input returns an unavailable status and that a representative output produces one ordered timestamp per coordinate.
- [ ] Run `python -m pytest services/smoke/tests/test_hysplit.py -q`. Expect the new checks to fail before the adapter is implemented.
- [ ] Implement `run_trajectories(source, forecast, settings) -> SmokePathSet` in `services/smoke/hysplit.py`. Set a 24-hour default and multiple heights, with 100, 500, and 1,000 m above ground as proposed starting heights. Use separate working directories, a subprocess timeout, and cleanup. Build the Linux Docker image and run it once with real compatible weather files and a real selected detection.
- [ ] Deploy an access-controlled service for the feasibility check and repeat the same run on Render Free. Record the duration, weather file size, and output status in `docs/deployment.md`. If access, data, or host limits prevent a successful run, leave live paths disabled and retain the historical demo. Finish the remaining public app tasks independently.
- [ ] Re-run the tests and commit `feat: add and verify the HYSPLIT trajectory runner` when the runner is present. Record the exact verification result in the commit or deployment notes.

### Task 8 · Live smoke jobs and explanation

- [ ] In `services/smoke/tests/test_jobs.py`, add `test_duplicate_requests_share_job_and_timeout_is_unavailable`. Assert duplicate requests share a job ID, an unfinished job reports pending, and a failed run reports unavailable. In `tests/smoke-route.test.ts`, test the disabled-runner state and ensure rendered path explanations have no application-calculated smoke contribution.
- [ ] Run `python -m pytest services/smoke/tests/test_jobs.py -q` and `npm test -- tests/smoke-route.test.ts`. Expect the new tests to fail.
- [ ] Expose job start and status endpoints in FastAPI and proxy them through `POST /api/smoke/jobs` and `GET /api/smoke/jobs/[id]`. Use a validated fire ID and source metadata, and deduplicate by source, observation time, weather cycle, and model settings. Return queued, running, complete, or unavailable. Use a bounded queue, disposable cache, caller limits, and a server-only service credential. Handle services after a restart by showing an expired or unavailable state and allowing retry.
- [ ] Render job status and verified paths from the contract. In `POST /api/smoke/explain`, send only known trajectory facts and metadata to Gemini. Use copy that describes possible air movement and uncertainty. Offer alternatives to open burning when relevant. Keep paths disabled publicly unless Task 7 passes.
- [ ] Re-run tests and commit `feat: connect on-demand smoke paths to the map`.

## Milestone D · Deploy and verify the submission

### Task 9 · Public app and demo

- [ ] Complete `tests/e2e/demo.spec.ts`. Use provider fixtures to assert the full Delhi-NCR flow, then switch to Tokyo and assert the updated location, local time, and plan. Verify both 2D and 3D controls where the map renderer supports them. Verify a fire observation time and the historical example.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build`. Expect zero errors. If the runner is included, also run `python -m pytest services/smoke/tests -q`.
- [ ] Deploy Next.js to Vercel. Configure server-side provider keys. Add `SMOKE_SERVICE_URL` and the service credential only for a verified live runner. Verify the public URL opens without relying on local setup or test fixtures.
- [ ] Do a manual public smoke test in both cities. If current Delhi data does not illustrate the planning decision well, open the dated historical case during the fire portion of the demo. Confirm that each visible date and data source is accurately labeled.
- [ ] Write the exact demo steps in `docs/demo.md`. Prepare the public app URL, source repository URL, and LinkedIn build post. Describe how Antigravity was used and which smoke functions were available in the submitted build.
- [ ] Commit `docs: add deployment and challenge demo instructions`.
