import { NextRequest, NextResponse } from "next/server";
import { PlanInput } from "@/lib/plan/types";
import { computePlanFacts } from "@/lib/plan/facts";
import { getForecast } from "@/lib/forecast/open-meteo";
import { generatePlan, validatePlanNarrative } from "@/lib/plan/gemini";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lon, input } = body as {
      lat?: number;
      lon?: number;
      input?: PlanInput;
    };

    if (lat === undefined || lon === undefined || !input) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "lat, lon, and plan input are required" } },
        { status: 400 }
      );
    }

    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lon) || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: "Invalid latitude or longitude" } },
        { status: 400 }
      );
    }

    // Server-fetched forecast data ensures consistent ground truth
    const forecast = await getForecast(lat, lon);

    // Compute deterministic facts
    const facts = computePlanFacts(input, forecast);

    try {
      const narrative = await generatePlan(input, facts);
      return NextResponse.json({
        status: "ready",
        facts,
        narrative,
      });
    } catch (genErr) {
      console.warn("Generation error, returning verified facts:", genErr);
      return NextResponse.json({
        status: "generation_unavailable",
        facts,
      });
    }
  } catch (error) {
    console.error("Plan route error:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Failed to process plan request" } },
      { status: 500 }
    );
  }
}
