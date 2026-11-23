import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (!id) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Job ID is required" } },
        { status: 400 }
      );
    }

    const serviceUrl = process.env.SMOKE_SERVICE_URL;
    const serviceToken = process.env.SMOKE_SERVICE_TOKEN;

    if (!serviceUrl) {
      return NextResponse.json(
        {
          id,
          state: "unavailable",
          reason: "Live atmospheric model service is offline or unreachable.",
        },
        { status: 200 }
      );
    }

    const proxyRes = await fetch(`${serviceUrl}/jobs/${id}`, {
      headers: {
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
    });

    const data = await proxyRes.json();
    return NextResponse.json(data, { status: proxyRes.status });
  } catch (error) {
    console.error("Get smoke job error:", error);
    return NextResponse.json(
      {
        id,
        state: "unavailable",
        reason: "Failed to communicate with live trajectory service.",
      },
      { status: 200 }
    );
  }
}
