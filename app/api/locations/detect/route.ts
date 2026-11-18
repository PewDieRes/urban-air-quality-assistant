import { NextRequest, NextResponse } from "next/server";
import { detectLocationFromIp } from "@/lib/location/search";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const rawIp = forwardedFor ? forwardedFor.split(",")[0].trim() : (realIp || "");

    const place = await detectLocationFromIp(rawIp);
    if (!place) {
      return NextResponse.json(
        { error: { code: "LOCATION_NOT_FOUND", message: "Could not detect location from IP" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ place, source: "ip" });
  } catch (error) {
    console.error("Detect location error:", error);
    return NextResponse.json(
      { error: { code: "PROVIDER_FAILURE", message: "Failed to detect location" } },
      { status: 500 }
    );
  }
}
