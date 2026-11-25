import { NextRequest, NextResponse } from "next/server";
import { getForecast } from "@/lib/forecast/open-meteo";
import {
  formatSafeErrorMessage,
  validateCoordinatesParams,
} from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const coordsResult = validateCoordinatesParams(
      searchParams,
      "Latitude and longitude query parameters are required",
      "Latitude must be between -90 and 90, and longitude must be between -180 and 180"
    );
    if (!coordsResult.ok) {
      return coordsResult.response;
    }

    const forecast = await getForecast(coordsResult.data.lat, coordsResult.data.lon);
    return NextResponse.json({ forecast });
  } catch (error: unknown) {
    console.error("Forecast route error:", formatSafeErrorMessage(error));
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to fetch air quality forecast from Open-Meteo" } },
      { status: 503 }
    );
  }
}
