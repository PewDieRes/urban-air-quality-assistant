# Urban Air Quality Assistant

## Purpose and scope

Build a worldwide GenAI web app for PromptWars Virtual Challenge 6. Help families and communities plan activities during smog, improve indoor air, and choose lower-emission alternatives. Start the demo in Delhi-NCR and repeat the main flow in another country. Use natural product language and define terms when helpful.

## Approaches and proposed choices

- Start with one flexible activity and optional fixed commitments. Let users add more activities for a longer plan. A full-day form would support more comparisons upfront and require more input.
- Use one map for the forecast and optional fire layer. A dedicated fire screen would provide more room for technical controls. A shared map keeps the selected location and makes smoke transport easy to find.
- Provide on-demand paths after verifying the live model and include a dated historical example. A live-only demo would depend on the weather files, provider, and available detections. Current fires and the historical example remain useful when live runs are unavailable.

## Location and forecast

Offer geolocation and manual city search. Search results show city, region, and country. Use Open-Meteo for geocoding and current and hourly AQI and PM₂.₅. Display the next 24 hours in the selected location’s time zone. Show the data source, units, and AQI scale. Use labeled US AQI as an initial consistent scale. Label the results **Regional model estimate**.

Use MapLibre GL JS and OpenFreeMap to render a regional PM₂.₅ layer, legend, and time slider. Sample a bounded set of regional cells and reuse the 24-hour data across slider changes. Clicking a street or building selects its regional estimate. Add a 3D view where tiles provide building data. Keep a usable 2D view and an accessible forecast list. OpenAQ readings and animated fog are optional. If added, show station distance and measurement time, and label fog as an illustration.

## Household plan

**Build my smog plan** starts with a flexible activity and time window. Let users enter fixed commitments, additional activities, transport choices, household needs, and budget. Personal fields are optional. Save preferences in the browser.

Code determines eligible forecast hours and computes any numeric comparisons from known inputs. Gemini receives the eligible times, forecast facts, and relevant user preferences. Validate the structured result. Preserve fixed commitments and show each recommendation with the action, why it helps, and who may benefit. Cover the daily routine, indoor air, sustainable alternatives, and direct impact. Distinguish lower potential exposure from lower emissions. Explain the basis for estimates and show when an estimate is unavailable. If generation fails, show available calculated options and allow retry.

## Recent fires and possible smoke transport

Request recent NASA FIRMS satellite detections for the visible region through a server route. Group markers at wide zoom levels and show observation times. A detection may leave the material burned unknown.

On selection, the web app requests a forward HYSPLIT run from a separate Python, FastAPI, and Docker service. Use NOAA weather files and several starting heights. Start from the observation time when the files cover it. Cache by source, run, and settings. Return timestamped GeoJSON with starting heights and metadata. Label lines **Possible smoke paths** and display citywide PM₂.₅ separately. The path estimates where air may travel. It does not establish smoke concentrations or source contribution. Give Gemini modeled facts and allow it to describe alternatives to open burning when relevant.

Verify the exact model mode locally and on the host before enabling live results. Display progress and clear unavailable states. Include one traceable historical case with its date, source data, and documented model settings.

## Stack and deployment

Use Next.js App Router, TypeScript, Tailwind CSS, MapLibre GL JS, OpenFreeMap, Open-Meteo, Gemini, and NASA FIRMS. Deploy the web app on Vercel Hobby. Test the separate HYSPLIT container on Render Free. Use browser storage for preferences, a tracked GeoJSON file for the historical case, and a disposable server cache for live results. A hosted database can be added if cross-device plans or durable results become necessary.

Keep GEMINI_API_KEY, FIRMS_MAP_KEY, and any service or OpenAQ credentials server-side. Document placeholders in .env.example. Bound expensive requests and reuse duplicate runs.

## Acceptance checks

1. Run location search, forecast scrubbing, and a plan in Delhi-NCR and another country. Verify local times and forecast values.
2. Keep a fixed school pickup, find an eligible grocery-trip hour when supported, and include all four plan parts. Test missing forecast and emissions inputs.
3. Check 2D and 3D views, fire observation times, and the historical case. Check behavior when provider data is unavailable.
4. Before turning on live paths, verify a hosted run, multiple starting heights, timestamps, and failure behavior.
5. Prepare the source repository, deployed URL, and LinkedIn build post. Describe the actual use of Antigravity, Gemini, and the smoke features available at submission.

## Antigravity handoff

Use this design as the brief for the Antigravity build. Keep a short record of how Antigravity was used during implementation so the submission can describe that work accurately.
