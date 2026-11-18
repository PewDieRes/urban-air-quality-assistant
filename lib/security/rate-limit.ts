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

/**
 * Extracts client IP from request headers (x-forwarded-for, x-real-ip) or falls back to loopback.
 */
export function getClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Convenience helper to verify rate limit in API route handlers and return a 429 response if exceeded.
 */
export function enforceRateLimit(
  request: NextRequest,
  limit = 60,
  windowMs = 60000
): NextResponse | null {
  const ip = getClientIp(request);
  const result = rateLimit(ip, limit, windowMs);

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
