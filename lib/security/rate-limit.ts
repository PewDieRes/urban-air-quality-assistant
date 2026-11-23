import { createHmac } from "node:crypto";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

interface RateLimitRecord {
  timestamps: number[];
}

const ipRequestMap = new Map<string, RateLimitRecord>();

// Clean up stale IP records every 5 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  ipRequestMap.forEach((record, ip) => {
    record.timestamps = record.timestamps.filter((ts: number) => now - ts < 60000);
    if (record.timestamps.length === 0) {
      ipRequestMap.delete(ip);
    }
  });
}, 300000).unref?.();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Enforces in-memory sliding window rate limits per client IP.
 */
export function rateLimit(
  clientIp: string,
  limit = 60,
  windowMs = 60000
): RateLimitResult {
  const now = Date.now();
  let record = ipRequestMap.get(clientIp);

  if (!record) {
    record = { timestamps: [] };
    ipRequestMap.set(clientIp, record);
  }

  // Filter timestamps within current sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return {
      success: false,
      limit,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    success: true,
    limit,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}

/** Only the deployment edge can provide a trusted visitor address. */
export function getClientIp(request: NextRequest): string {
  const edgeIp = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : "";
  return edgeIp && isIP(edgeIp) ? edgeIp : "shared";
}

// INCR and expiry must run atomically across serverless instances.
const incrementWindow = `
  local count = redis.call("INCR", KEYS[1])
  if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
  return {count, redis.call("PTTL", KEYS[1])}
`;

async function checkWindow(ip: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return rateLimit(ip, limit, windowMs);
  if (!token || !url || new URL(url).protocol !== "https:") throw new Error("Invalid rate limit configuration");
  const visitor = createHmac("sha256", token).update(ip).digest("hex");
  const response = await fetchWithTimeout(url, {
    method: "POST", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", incrementWindow, 1, `smog:requests:${windowMs}:${visitor}`, windowMs]),
  }, 3000);
  if (!response.ok) throw new Error("Rate limit service unavailable");
  const { result } = await response.json();
  if (!Array.isArray(result) || result.length !== 2 || !result.every(Number.isSafeInteger) ||
      result[0] < 1 || result[1] < 0) throw new Error("Invalid rate limit response");
  return { success: result[0] <= limit, limit, remaining: Math.max(0, limit - result[0]), resetMs: result[1] };
}

/**
 * Convenience helper to verify rate limit in API route handlers and return a 429 response if exceeded.
 */
export async function enforceRateLimit(
  request: NextRequest,
  limit = 60,
  windowMs = 60000
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  let result: RateLimitResult;
  try {
    result = await checkWindow(ip, limit, windowMs);
  } catch {
    return NextResponse.json({ error: { code: "LIMITER_UNAVAILABLE", message: "Please retry shortly." } },
      { status: 503, headers: { "Retry-After": "3" } });
  }

  if (!result.success) {
    const retrySec = Math.ceil(result.resetMs / 1000);
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Please retry in ${retrySec} seconds.`,
        },
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "Retry-After": String(retrySec),
        },
      }
    );
  }

  return null;
}
