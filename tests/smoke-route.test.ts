import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSmokeJob } from "@/app/api/smoke/jobs/[id]/route";
import { POST as createSmokeJob } from "@/app/api/smoke/jobs/route";
import { formatSmokeExplanation, SmokeExplanationRequest } from "@/lib/smoke/explain";

describe("smoke job routes and explanation grounding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders trajectory path explanation without calculating or claiming smoke contribution or concentration", () => {
    const req: SmokeExplanationRequest = {
      fireId: "firms-punjab-1",
      sourceLocationName: "Sangrur, Punjab",
      destinationLocationName: "Delhi-NCR",
      startHeightsM: [100, 500, 1000],
      observedAt: "2024-11-03T08:00:00Z",
    };

    const explanation = formatSmokeExplanation(req);

    expect(explanation.text).toMatch(/possible atmospheric transport|air movement|where air may travel/i);
    expect(explanation.text).toMatch(/does not establish.*concentration/i);
    expect(explanation.text).not.toMatch(/contributes \d+% of smog/i);
    expect(explanation.text).not.toMatch(/adds \d+ µg\/m³ of smoke/i);

    expect(explanation.alternatives.length).toBeGreaterThan(0);
    expect(explanation.alternatives.join(" ")).toMatch(
      /in-situ|mulch|happy seeder|briquette|bio-decomposer/i
    );
  });

  it("rejects invalid and path-traversal job IDs with HTTP 400", async () => {
    const invalidIds = ["../etc/passwd", "job/nested", "bad id!", "a".repeat(101)];

    for (const badId of invalidIds) {
      const request = new NextRequest("https://example.test/api/smoke/jobs/invalid");
      const response = await getSmokeJob(request, {
        params: Promise.resolve({ id: badId }),
      });
      const body = (await response.json()) as { error?: { code?: string } };

      expect(response.status).toBe(400);
      expect(body.error?.code).toBe("INVALID_JOB_ID");
    }
  });

  it("returns graceful unavailable state when SMOKE_SERVICE_URL is unconfigured", async () => {
    vi.stubEnv("SMOKE_SERVICE_URL", "");
    const request = new NextRequest("https://example.test/api/smoke/jobs/job-2024_1");
    const response = await getSmokeJob(request, {
      params: Promise.resolve({ id: "job-2024_1" }),
    });
    const body = (await response.json()) as { id: string; state: string; reason: string };

    expect(response.status).toBe(200);
    expect(body.id).toBe("job-2024_1");
    expect(body.state).toBe("unavailable");
    expect(body.reason).toMatch(/offline or unreachable/i);
  });

  it("masks upstream timeout and non-JSON proxy failures cleanly for smoke job polling", async () => {
    vi.stubEnv("SMOKE_SERVICE_URL", "https://smoke.example.test/");
    vi.stubEnv("SMOKE_SERVICE_TOKEN", "secret-token");

    const hangingFetch = vi.fn().mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const abortError = new Error("Upstream secret internal timeout");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })
    );
    vi.stubGlobal("fetch", hangingFetch);

    // Timeout case (fast-trigger AbortController or check catch path via immediate rejection)
    const abortMock = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Timed out at smoke.internal"), { name: "AbortError" }));
    vi.stubGlobal("fetch", abortMock);

    const requestTimeout = new NextRequest("https://example.test/api/smoke/jobs/job_timeout");
    const timeoutResponse = await getSmokeJob(requestTimeout, {
      params: Promise.resolve({ id: "job_timeout" }),
    });
    const timeoutBody = (await timeoutResponse.json()) as { state: string; reason: string };

    expect(timeoutResponse.status).toBe(200);
    expect(timeoutBody.state).toBe("unavailable");
    expect(timeoutBody.reason).not.toMatch(/smoke\.internal|secret-token/i);

    // Non-JSON HTML 502 error from upstream proxy
    const htmlErrorFetch = vi.fn().mockResolvedValueOnce(
      new Response("<html>502 Bad Gateway internal stack</html>", { status: 502 })
    );
    vi.stubGlobal("fetch", htmlErrorFetch);

    const htmlResponse = await getSmokeJob(new NextRequest("https://example.test/api/smoke/jobs/job_502"), {
      params: Promise.resolve({ id: "job_502" }),
    });
    const htmlBody = (await htmlResponse.json()) as { state: string; reason: string };

    expect(htmlResponse.status).toBe(200);
    expect(htmlBody.state).toBe("unavailable");
    expect(htmlBody.reason).not.toContain("502 Bad Gateway");
  });

  it("proxies valid smoke job status and enforces rate limiting", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SMOKE_SERVICE_URL", "https://smoke.example.test/");
    vi.stubEnv("SMOKE_SERVICE_TOKEN", "runner-token");

    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: "job_valid-9", state: "completed" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const requestOk = new NextRequest("https://example.test/api/smoke/jobs/job_valid-9", {
      headers: { "x-vercel-forwarded-for": "203.0.113.71" },
    });
    const okRes = await getSmokeJob(requestOk, {
      params: Promise.resolve({ id: "job_valid-9" }),
    });
    expect(okRes.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://smoke.example.test/jobs/job_valid-9",
      expect.objectContaining({
        headers: { Authorization: "Bearer runner-token" },
      })
    );

    // Requests 2..60 succeed; 61st triggers HTTP 429
    for (let i = 2; i <= 60; i++) {
      const res = await getSmokeJob(
        new NextRequest("https://example.test/api/smoke/jobs/job_valid-9", {
          headers: { "x-vercel-forwarded-for": "203.0.113.71" },
        }),
        { params: Promise.resolve({ id: "job_valid-9" }) }
      );
      expect(res.status).toBe(200);
    }

    const limitedRes = await getSmokeJob(
      new NextRequest("https://example.test/api/smoke/jobs/job_valid-9", {
        headers: { "x-vercel-forwarded-for": "203.0.113.71" },
      }),
      { params: Promise.resolve({ id: "job_valid-9" }) }
    );
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get("Retry-After")).toBeTruthy();
  });

  it("validates POST /api/smoke/jobs payloads and masks upstream errors", async () => {
    vi.stubEnv("SMOKE_SERVICE_URL", "https://smoke.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Upstream Error</html>", { status: 500 }))
    );

    const badJsonReq = new NextRequest("https://example.test/api/smoke/jobs", {
      method: "POST",
      body: "{bad-json",
    });
    expect((await createSmokeJob(badJsonReq)).status).toBe(400);

    const badSchemaReq = new NextRequest("https://example.test/api/smoke/jobs", {
      method: "POST",
      body: JSON.stringify({ fireId: "", lat: 120, lon: 0 }),
    });
    expect((await createSmokeJob(badSchemaReq)).status).toBe(400);

    const upstreamFailReq = new NextRequest("https://example.test/api/smoke/jobs", {
      method: "POST",
      body: JSON.stringify({ fireId: "fire-1", lat: 30.1, lon: 75.8 }),
    });
    const maskedRes = await createSmokeJob(upstreamFailReq);
    const maskedBody = (await maskedRes.json()) as { error?: { code?: string } };
    expect(maskedRes.status).toBe(503);
    expect(maskedBody.error?.code).toBe("RUNNER_UNAVAILABLE");
  });
});
