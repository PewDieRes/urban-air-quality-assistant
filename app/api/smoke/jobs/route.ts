import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fireId, lat, lon, observedAt } = body;

    if (!fireId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "fireId is required" } },
        { status: 400 }
      );
    }

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

    // Proxy request to the secure external HYSPLIT runner
    const proxyRes = await fetch(`${serviceUrl}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({ fireId, lat, lon, observedAt }),
    });

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
