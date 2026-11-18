# Historical Atmospheric Smoke Transport Case

## Overview
This document records the provenance, meteorological configuration, and scientific modeling parameters for the verified historical smoke case included in the Urban Air Quality Assistant.

## Case Details
- **Date & Observation Instant:** November 3, 2024 at 08:00 UTC (13:30 IST)
- **Source Coordinates:** 30.25°N, 75.85°E (Sangrur / Patiala district, Punjab, India)
- **Primary Source Identification:** NASA VIIRS / MODIS satellite fire radiative power (FRP) cluster corresponding to seasonal post-harvest paddy residue open burning.
- **Meteorological Data Cycle:** NOAA Global Forecast System (GFS) 0.25° grid, cycle 20241103_06z.

## Model Settings
- **Atmospheric Model:** NOAA Air Resources Laboratory Hybrid Single-Particle Lagrangian Integrated Trajectory (HYSPLIT).
- **Run Direction:** Forward in time (+24 hours).
- **Starting Levels Above Ground Level (AGL):**
  - **100 m AGL:** Captures surface-layer boundary winds and nocturnal surface inversion trapping.
  - **500 m AGL:** Represents mixed daytime planetary boundary layer transport.
  - **1,000 m AGL:** Captures regional synoptic shear winds.
- **Top of Model Domain:** 10,000 m AGL.
- **Vertical Motion Mode:** Model-calculated vertical velocity from meteorological pressure fields.

## Path Characteristics & Regional Interpretation
- **Trajectory Path:** North-westerly synoptic flow carries air parcels south-east across Haryana into Delhi-NCR within 14 to 18 hours.
- **Essential Distinctions:**
  1. **Possible Smoke Paths vs. Inhaled Concentrations:** The forward trajectory lines delineate where an air parcel moving from the fire location travels. They indicate atmospheric pathways, NOT guaranteed mass concentration or quantitative source contribution at ground level.
  2. **Total Forecast PM₂.₅:** Total regional ambient PM₂.₅ is presented as an independent Copernicus / Open-Meteo regional forecast, preventing misleading single-source attribution claims.
  3. **Sustainable Agricultural Alternatives:** Farmers can be supported through in-situ straw management (Happy Seeder, Super-SMS mulching) and ex-situ biomass briquetting for power plants rather than open residue burning.
