import { NextRequest, NextResponse } from "next/server";
import { formatSmokeExplanation, SmokeExplanationRequest } from "@/lib/smoke/explain";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const req: SmokeExplanationRequest = {
      fireId: body.fireId || "satellite-fire-detection",
      sourceLocationName: body.sourceLocationName,
      destinationLocationName: body.destinationLocationName,
      startHeightsM: body.startHeightsM || [100, 500, 1000],
      observedAt: body.observedAt || new Date().toISOString(),
    };

    const explanation = formatSmokeExplanation(req);
    return NextResponse.json({ explanation });
  } catch (error) {
    console.error("Smoke explain error:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Failed to generate smoke explanation" } },
      { status: 500 }
    );
  }
}
