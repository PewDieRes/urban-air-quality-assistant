import { NextRequest, NextResponse } from "next/server";
import { searchLocations } from "@/lib/location/search";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ places: [] });
    }

    if (query.trim().length > 100) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Search query is too long" } },
        { status: 400 }
      );
    }

    const places = await searchLocations(query.trim(), 8);
    return NextResponse.json({ places });
  } catch (error) {
    console.error("Location search route error:", error);
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Unable to retrieve locations at this time" } },
      { status: 503 }
    );
  }
}
