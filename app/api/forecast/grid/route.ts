import { NextRequest, NextResponse } from "next/server";
import { getForecast } from "@/lib/forecast/open-meteo";
import { regionalCells } from "@/lib/map/regional-cells";
import {
  formatSafeErrorMessage,
  validateBoundingBoxParams,
  validateCoordinatesParams,
} from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const boundsResult = validateBoundingBoxParams(
      searchParams,
      "west, south, east, north bounds and lat, lon focal coordinates are required",
      "All coordinates must be valid finite numbers"
    );
    if (!boundsResult.ok) {
      return boundsResult.response;
    }

    const focalResult = validateCoordinatesParams(
      searchParams,
      "west, south, east, north bounds and lat, lon focal coordinates are required",
      "All coordinates must be valid finite numbers"
    );
    if (!focalResult.ok) {
      return focalResult.response;
    }

    const cells = regionalCells(boundsResult.data, focalResult.data);

    // Fetch forecasts for each cell concurrently, handling partial cell failures gracefully
    const cellResults = await Promise.allSettled(
      cells.map(async (cell) => {
        const forecast = await getForecast(cell.lat, cell.lon);
        return { cell, forecast };
      })
    );

    const successfulGrid = cellResults
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          cell: (typeof cells)[0];
          forecast: Awaited<ReturnType<typeof getForecast>>;
        }> => result.status === "fulfilled"
      )
      .map((result) => result.value);

    if (cells.length > 0 && successfulGrid.length === 0) {
      return NextResponse.json(
        { error: { code: "PROVIDER_FAILURE", message: "Failed to generate regional forecast grid" } },
        { status: 503 }
      );
    }

    return NextResponse.json({ grid: successfulGrid });
  } catch (error: unknown) {
    console.error("Forecast grid route error:", formatSafeErrorMessage(error));
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to generate regional forecast grid" } },
      { status: 503 }
    );
  }
}
