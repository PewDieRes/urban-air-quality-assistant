# Immersive 3D Smog Viewer Documentation

## 1. Overview & Architecture

The **Immersive 3D Smog Viewer** brings a flyable, textured urban space to the Urban Air Quality Assistant, visualizing forecast-driven atmospheric smog directly in 3D:
- **Engine**: Three.js, React Three Fiber (R3F 8.18.0), `@react-three/drei`, and `3d-tiles-renderer` (NASA-AMMOS).
- **Coordinate System**: WGS84 Geodetic to ECEF and local East-North-Up (ENU) tangent frame (`lib/immersive/frame.ts`). Scene X = East (m), Y = Up (m), Z = South (m).
- **Single Source of Truth**: Shared 24-hour timeline (`components/map/forecast-timeline.tsx`) controls both the 2D regional map and the 3D city scene without re-fetching forecast or tile data.
- **On-Demand Code Splitting**: The Three.js WebGL bundle is dynamically imported (`ssr: false`) only when the user clicks **Immersive 3D City**, keeping the initial landing page bundle lightweight.

---

## 2. City Anchors & Tile Source Verification

| City Anchor | Coordinates | Primary Tile Source | Verified Status | Fallback Behavior |
|---|---|---|---|---|
| **Tokyo Station** | `35.6812° N, 139.7671° E` | Google Photorealistic 3D Tiles (`tile.googleapis.com`) | **Verified Endpoint** (Requires `NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY` with Map Tiles API enabled) | Interactive textured procedural Tokyo block mesh + depth haze |
| **Delhi-NCR** | `28.6139° N, 77.2090° E` | Cesium World Terrain (Asset 1) + Cesium OSM Buildings (Asset 96188) | **Verified Endpoint** (Requires `NEXT_PUBLIC_CESIUM_ION_TOKEN`) | Interactive textured procedural Delhi block mesh + depth haze |

### Real Tile Provider Verification Summary:
- **Google Photorealistic 3D Tiles**: Direct probe of `https://tile.googleapis.com/v1/3dtiles/root.json` confirms endpoint availability. Requires browser-level Map Tiles API key (`NEXT_PUBLIC_GOOGLE_MAPS_TILE_KEY`).
- **Cesium ion Assets**: Direct probe of `https://api.cesium.com/v1/assets/96188/endpoint` confirms Cesium ion API availability. Requires Cesium ion default access token (`NEXT_PUBLIC_CESIUM_ION_TOKEN`).
- **Zero-Credential Fallback**: When external tile keys are omitted, the viewer automatically serves high-fidelity textured 3D city blocks with real geodetic coordinate picking, orbit/aerial/skyline controls, and live forecast-linked depth haze.

---

## 3. Depth-Aware Smog Layer & Visual Calibration

The atmospheric layer (`components/map/immersive/smog-pass.tsx`) renders ground-trapped winter inversions:
- **Physics**: Bounded planar slab spanning ground ($y = 0$) to planetary boundary layer ceiling ($y \approx 200\text{m} - 350\text{m}$).
- **Height Falloff**: Smog density follows $d(y) = d_0 \cdot \max(0, 1 - y/h_{\text{ceil}})^{1.4}$, allowing high-rise building roofs and aerial cameras to sit above the smog blanket.
- **Monotonic Extinction**:
  - `20 µg/m³` (Clean/Moderate): Density ~0.18, Opacity ~0.22, slate-mist tint (`#cbd5e1`).
  - `120 µg/m³` (Unhealthy Smog): Density ~0.72, Opacity ~0.75, goldenrod-amber particulate tint (`#b8860b`).
  - Strict mathematical monotonicity validated by automated tests (`tests/immersive-haze.test.ts`).
- **Required Label**: Every 3D scene displays the exact label:
  > **Illustration of forecast pollution** — bounded visual effect based on regional PM₂.₅. Does not represent microclimate or localized street diffusion.

---

## 4. Camera Presets & Interaction

- **Reset View / Home**: Oblique camera pose at `[0, 340, 480]` looking toward city center at `[0, 30, 0]`.
- **Aerial (Roofs & Facades)**: High-altitude overview at `[120, 560, 520]` providing wide urban context.
- **Skyline (Roof-Height)**: Low perspective at `[-80, 110, 260]` gazing through the atmospheric haze across building towers.
- **Picking vs. Panning**: Dragging, zooming, or orbiting does not select coordinates. A stationary click or tap on any 3D building or street point queries raycast coordinates, converts via `toGeodetic`, and updates the household planner.

---

## 5. Verification Commands

Reproduce the full test suite and build verification:
```powershell
# 1. Coordinate frame and haze mathematical validation
npx vitest run tests/immersive-frame.test.ts tests/immersive-haze.test.ts

# 2. Complete unit and integration suite (10 test files)
npm test

# 3. End-to-end Playwright browser tests (6 tests across 2D & 3D)
npm run test:e2e

# 4. Production build check
npm run build
```
