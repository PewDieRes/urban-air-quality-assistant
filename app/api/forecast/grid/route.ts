import { NextRequest, NextResponse } from "next/server";
import { regionalCells, Bounds } from "@/lib/map/regional-cells";
import { getForecast } from "@/lib/forecast/open-meteo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const westStr = searchParams.get("west");
    const southStr = searchParams.get("south");
    const eastStr = searchParams.get("east");
    const northStr = searchParams.get("north");
    const latStr = searchParams.get("lat");
    const lonStr = searchParams.get("lon");

    if (!westStr || !southStr || !eastStr || !northStr || !latStr || !lonStr) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "west, south, east, north bounds and lat, lon focal coordinates are required",
          },
        },
        { status: 400 }
      );
    }

    const bounds: Bounds = {
      west: parseFloat(westStr),
      south: parseFloat(southStr),
      east: parseFloat(eastStr),
      north: parseFloat(northStr),
    };

    const focal = {
      lat: parseFloat(latStr),
      lon: parseFloat(lonStr),
    };

    if (
      isNaN(bounds.west) ||
      isNaN(bounds.south) ||
      isNaN(bounds.east) ||
      isNaN(bounds.north) ||
      isNaN(focal.lat) ||
      isNaN(focal.lon)
    ) {
      return NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: "All coordinates must be valid numbers" } },
        { status: 400 }
      );
    }

    const cells = regionalCells(bounds, focal);

    // Fetch forecasts for each cell concurrently, handling partial cell failures gracefully
    const cellResults = await Promise.allSettled(
      cells.map(async (cell) => {
        const forecast = await getForecast(cell.lat, cell.lon);
        return { cell, forecast };
      })
    );

    const successfulGrid = cellResults
      .filter(
        (r): r is PromiseFulfilledResult<{ cell: typeof cells[0]; forecast: Awaited<ReturnType<typeof getForecast>> }> =>
          r.status === "fulfilled"
      )
      .map((r) => r.value);

    return NextResponse.json({ grid: successfulGrid });
  } catch (error) {
    console.error("Forecast grid route error:", error);
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to generate regional forecast grid" } },
      { status: 503 }
    );
  }
}
