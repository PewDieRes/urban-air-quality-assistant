import { NextRequest, NextResponse } from "next/server";
import { searchLocations } from "@/lib/location/search";
import {
  formatSafeErrorMessage,
  LocationSearchQuerySchema,
} from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q") ?? "";
    const parsedQuery = LocationSearchQuerySchema.safeParse({ q: rawQuery });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Search query is too long" } },
        { status: 400 }
      );
    }

    if (parsedQuery.data.q.length === 0) {
      return NextResponse.json({ places: [] });
    }

    const places = await searchLocations(parsedQuery.data.q, 8);
    return NextResponse.json({ places });
  } catch (error: unknown) {
    console.error("Location search route error:", formatSafeErrorMessage(error));
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Unable to retrieve locations at this time" } },
      { status: 503 }
    );
  }
}
