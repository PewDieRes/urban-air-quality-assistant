import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/location/search";
import {
  formatSafeErrorMessage,
  validateCoordinatesParams,
} from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const coordsResult = validateCoordinatesParams(
    searchParams,
    "lat and lon parameters are required",
    "lat must be between -90 and 90, and lon must be between -180 and 180"
  );
  if (!coordsResult.ok) {
    return coordsResult.response;
  }

  try {
    const place = await reverseGeocode(coordsResult.data.lat, coordsResult.data.lon);
    return NextResponse.json({ place });
  } catch (error: unknown) {
    console.error("Reverse geocode error:", formatSafeErrorMessage(error));
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to reverse geocode coordinates" } },
      { status: 503 }
    );
  }
}
