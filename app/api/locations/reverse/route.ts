import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/location/search";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");

  if (!latStr || !lonStr) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "lat and lon parameters are required" } },
      { status: 400 }
    );
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_COORDINATES",
          message: "lat must be between -90 and 90, and lon must be between -180 and 180",
        },
      },
      { status: 400 }
    );
  }

  try {
    const place = await reverseGeocode(lat, lon);
    return NextResponse.json({ place });
  } catch (error) {
    console.error("Reverse geocode error:", error);
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to reverse geocode coordinates" } },
      { status: 500 }
    );
  }
}
