import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/security/fetch-with-timeout";
import {
  formatSafeErrorMessage,
  normalizeServiceUrl,
  readSafeJsonResponse,
  SmokeJobIdSchema,
} from "@/lib/security/http-validation";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UNAVAILABLE_REASON = "Live atmospheric model service is offline or unreachable.";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitResponse = await enforceRateLimit(request, 60, 60000);
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;
  const parsedId = SmokeJobIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: { code: "INVALID_JOB_ID", message: "Invalid smoke job identifier" } },
      { status: 400 }
    );
  }

  const safeJobId = parsedId.data;
  try {
    const serviceUrl = normalizeServiceUrl(process.env.SMOKE_SERVICE_URL);
    const serviceToken = process.env.SMOKE_SERVICE_TOKEN;

    if (!serviceUrl) {
      return NextResponse.json(
        { id: safeJobId, state: "unavailable", reason: UNAVAILABLE_REASON },
        { status: 200 }
      );
    }

    const proxyRes = await fetchWithTimeout(
      `${serviceUrl}/jobs/${encodeURIComponent(safeJobId)}`,
      {
        headers: {
          ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
        },
      },
      8000
    );

    const parsedBody = await readSafeJsonResponse(proxyRes);
    if (!parsedBody.ok || proxyRes.status >= 500) {
      return NextResponse.json(
        { id: safeJobId, state: "unavailable", reason: UNAVAILABLE_REASON },
        { status: 200 }
      );
    }

    return NextResponse.json(parsedBody.data, { status: proxyRes.status });
  } catch (error: unknown) {
    console.error("Get smoke job error:", formatSafeErrorMessage(error));
    return NextResponse.json(
      { id: safeJobId, state: "unavailable", reason: UNAVAILABLE_REASON },
      { status: 200 }
    );
  }
}
