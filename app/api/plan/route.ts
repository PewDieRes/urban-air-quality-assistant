import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlanInput } from "@/lib/plan/types";
import { scheduleError } from "@/lib/plan/schedule";
import { computePlanFacts } from "@/lib/plan/facts";
import { getForecast } from "@/lib/forecast/open-meteo";
import { generatePlan } from "@/lib/plan/gemini";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const PlanRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  input: z.object({
    activities: z.array(
      z.object({
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(200),
        windowStart: z.string().datetime({ offset: true }),
        windowEnd: z.string().datetime({ offset: true }),
        durationMinutes: z.number().min(5).max(720).default(60),
      })
    ).max(20),
    fixedCommitments: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          title: z.string().min(1).max(200),
          start: z.string().datetime({ offset: true }),
          end: z.string().datetime({ offset: true }),
        })
      )
      .max(20)
      .optional(),
    transport: z
      .object({
        mode: z.enum(["car", "transit", "walk", "bike", "ev", "none"]),
        distanceKm: z.number().min(0).max(500).optional(),
      })
      .optional(),
    availableTransportModes: z
      .array(z.enum(["car", "transit", "walk", "bike", "ev", "none"]))
      .max(6)
      .optional(),
    household: z
      .object({
        sensitiveMembers: z.boolean().optional(),
        hasAirPurifier: z.boolean().optional(),
        indoorVentilation: z.enum(["closed", "filtered", "open"]).optional(),
      })
      .optional(),
    budget: z.enum(["low", "medium", "high"]).optional(),
  }),
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

    const parseResult = PlanRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: parseResult.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { lat, lon, input } = parseResult.data;

    // Server-fetched forecast data ensures consistent ground truth
    const forecast = await getForecast(lat, lon);

    const problem = scheduleError(input, forecast);
    if (problem) {
      return NextResponse.json({ error: { code: "INVALID_SCHEDULE", message: problem } }, { status: 400 });
    }
    // Compute deterministic facts
    const facts = computePlanFacts(input as PlanInput, forecast);

    // Generate narrative with live Gemini or deterministic fallback
    const result = await generatePlan(input as PlanInput, facts);

    return NextResponse.json({
      status: result.status,
      modelUsed: result.modelUsed,
      fallbackReason: result.fallbackReason,
      facts,
      narrative: result.narrative,
    });
  } catch (error) {
    console.error("Plan route error:", error);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Failed to process plan request" } },
      { status: 500 }
    );
  }
}
