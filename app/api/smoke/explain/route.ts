import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatSafeErrorMessage } from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { formatSmokeExplanation, SmokeExplanationRequest } from "@/lib/smoke/explain";

export const dynamic = "force-dynamic";

const ExplainSchema = z.object({
  fireId: z.string().max(100).optional(),
  sourceLocationName: z.string().max(200).optional(),
  destinationLocationName: z.string().max(200).optional(),
  startHeightsM: z.array(z.number().min(10).max(10000)).max(5).optional(),
  observedAt: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Malformed JSON request body" } },
        { status: 400 }
      );
    }

    const parseResult = ExplainSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Invalid explain parameters" } },
        { status: 400 }
      );
    }

    const val = parseResult.data;
    const req: SmokeExplanationRequest = {
      fireId: val.fireId || "satellite-fire-detection",
      sourceLocationName: val.sourceLocationName,
      destinationLocationName: val.destinationLocationName,
      startHeightsM: val.startHeightsM || [100, 500, 1000],
      observedAt: val.observedAt || new Date().toISOString(),
    };

    const explanation = formatSmokeExplanation(req);
    return NextResponse.json({ explanation });
  } catch (error: unknown) {
    console.error("Smoke explain error:", formatSafeErrorMessage(error));
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Failed to generate smoke explanation" } },
      { status: 500 }
    );
  }
}
