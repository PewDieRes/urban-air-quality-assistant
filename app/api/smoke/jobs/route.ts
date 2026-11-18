import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { fetchWithTimeout } from "@/lib/security/fetch-with-timeout";

export const dynamic = "force-dynamic";

const SmokeJobSchema = z.object({
  fireId: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  observedAt: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, 60, 60000);
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

    const parseResult = SmokeJobSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "fireId and valid coordinates are required",
            details: parseResult.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { fireId, lat, lon, observedAt } = parseResult.data;

    const serviceUrl = process.env.SMOKE_SERVICE_URL;
    const serviceToken = process.env.SMOKE_SERVICE_TOKEN;

    // If live service is not configured, gracefully indicate unavailable status so client uses verified historical case
    if (!serviceUrl) {
      return NextResponse.json(
        {
          error: {
            code: "RUNNER_UNAVAILABLE",
            message: "Live atmospheric model service is offline or unreachable.",
          },
        },
        { status: 503 }
      );
    }

    // Proxy request to the secure external HYSPLIT runner with 8s timeout
    const proxyRes = await fetchWithTimeout(
      `${serviceUrl}/jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
        },
        body: JSON.stringify({ fireId, lat, lon, observedAt }),
      },
      8000
    );

    const data = await proxyRes.json();
    return NextResponse.json(data, { status: proxyRes.status });
  } catch (error) {
    console.error("Smoke job route error:", error);
    return NextResponse.json(
      {
        error: {
          code: "RUNNER_UNAVAILABLE",
          message: "Live atmospheric model service is offline or unreachable.",
        },
      },
      { status: 503 }
    );
  }
}
