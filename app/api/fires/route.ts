import { NextRequest, NextResponse } from "next/server";
import { listFires } from "@/lib/fires/firms";
import { validateBoundingBoxParams } from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const boundsResult = validateBoundingBoxParams(
      searchParams,
      "west, south, east, and north bounds are required",
      "Bounding box coordinates must be finite numbers"
    );
    if (!boundsResult.ok) {
      return boundsResult.response;
    }

    const fires = await listFires(boundsResult.data);
    return NextResponse.json({ fires });
  } catch {
    console.error("Fire data request failed");
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to retrieve NASA FIRMS satellite fire detections" } },
      { status: 503 }
    );
  }
}
