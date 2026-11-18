import { NextRequest, NextResponse } from "next/server";
import { getForecast } from "@/lib/forecast/open-meteo";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const latStr = searchParams.get("lat");
    const lonStr = searchParams.get("lon");

    if (!latStr || !lonStr) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Latitude and longitude query parameters are required" } },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: "Latitude must be a valid number between -90 and 90" } },
        { status: 400 }
      );
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: "Longitude must be a valid number between -180 and 180" } },
        { status: 400 }
      );
    }

    const forecast = await getForecast(lat, lon);
    return NextResponse.json({ forecast });
  } catch (error) {
    console.error("Forecast route error:", error);
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to fetch air quality forecast from Open-Meteo" } },
      { status: 503 }
    );
  }
}
