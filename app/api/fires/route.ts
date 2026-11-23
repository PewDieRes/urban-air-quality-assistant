import { NextRequest, NextResponse } from "next/server";
import { listFires } from "@/lib/fires/firms";
import { Bounds } from "@/lib/map/regional-cells";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const westStr = searchParams.get("west");
    const southStr = searchParams.get("south");
    const eastStr = searchParams.get("east");
    const northStr = searchParams.get("north");

    if (!westStr || !southStr || !eastStr || !northStr) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "west, south, east, and north bounds are required" } },
        { status: 400 }
      );
    }

    const bounds: Bounds = {
      west: parseFloat(westStr),
      south: parseFloat(southStr),
      east: parseFloat(eastStr),
      north: parseFloat(northStr),
    };

    if (
      isNaN(bounds.west) ||
      isNaN(bounds.south) ||
      isNaN(bounds.east) ||
      isNaN(bounds.north)
    ) {
      return NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: "Bounding box coordinates must be numbers" } },
        { status: 400 }
      );
    }

    const fires = await listFires(bounds);
    return NextResponse.json({ fires });
  } catch (error) {
    console.error("Fire data request failed");
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to retrieve NASA FIRMS satellite fire detections" } },
      { status: 503 }
    );
  }
}
