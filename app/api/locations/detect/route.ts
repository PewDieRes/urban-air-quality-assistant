import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  // Vercel supplies approximate location at the edge. No IP leaves the application.
  const latText = request.headers.get("x-vercel-ip-latitude");
  const lonText = request.headers.get("x-vercel-ip-longitude");
  const lat = Number(latText);
  const lon = Number(lonText);
  if (process.env.VERCEL !== "1" || !latText || !lonText ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: { code: "LOCATION_NOT_FOUND", message: "Search for your city." } }, { status: 404 });
  }
  let name = request.headers.get("x-vercel-ip-city") || "Approximate location";
  try { name = decodeURIComponent(name); } catch { name = "Approximate location"; }
  return NextResponse.json({
    place: { id: `approx-${lat}-${lon}`, name, lat, lon, country: request.headers.get("x-vercel-ip-country") || undefined },
    source: "ip",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
