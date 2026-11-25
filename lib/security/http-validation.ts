import { NextResponse } from "next/server";
import { z } from "zod";
import { Bounds } from "@/lib/map/regional-cells";

const SMOKE_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export const SmokeJobIdSchema = z
  .string()
  .regex(SMOKE_JOB_ID_PATTERN, "Invalid smoke job identifier");

function parseStrictFiniteNumber(rawValue: unknown): number | undefined {
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : undefined;
  }
  if (typeof rawValue !== "string") {
    return undefined;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function finiteRangeSchema(min: number, max: number, fieldName: string) {
  return z.preprocess(
    parseStrictFiniteNumber,
    z
      .number({
        required_error: `${fieldName} must be a finite number`,
        invalid_type_error: `${fieldName} must be a finite number`,
      })
      .min(min, `${fieldName} must be between ${min} and ${max}`)
      .max(max, `${fieldName} must be between ${min} and ${max}`)
  );
}

const CoordinatesSchema = z.object({
  lat: finiteRangeSchema(-90, 90, "lat"),
  lon: finiteRangeSchema(-180, 180, "lon"),
});

const BoundingBoxSchema = z
  .object({
    west: finiteRangeSchema(-180, 180, "west"),
    south: finiteRangeSchema(-90, 90, "south"),
    east: finiteRangeSchema(-180, 180, "east"),
    north: finiteRangeSchema(-90, 90, "north"),
  })
  .refine((box) => box.north >= box.south, {
    message: "north bound must be greater than or equal to south bound",
  });

export const LocationSearchQuerySchema = z.object({
  q: z.string().trim().max(100, "Search query is too long"),
});

export type QueryValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export function validateCoordinatesParams(
  searchParams: URLSearchParams,
  missingMessage: string,
  invalidMessage: string
): QueryValidationResult<{ lat: number; lon: number }> {
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");

  if (!latParam || !lonParam) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: missingMessage } },
        { status: 400 }
      ),
    };
  }

  const parsed = CoordinatesSchema.safeParse({ lat: latParam, lon: lonParam });
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: invalidMessage } },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export function validateBoundingBoxParams(
  searchParams: URLSearchParams,
  missingMessage: string,
  invalidMessage: string
): QueryValidationResult<Bounds> {
  const west = searchParams.get("west");
  const south = searchParams.get("south");
  const east = searchParams.get("east");
  const north = searchParams.get("north");

  if (!west || !south || !east || !north) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: missingMessage } },
        { status: 400 }
      ),
    };
  }

  const parsed = BoundingBoxSchema.safeParse({ west, south, east, north });
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "INVALID_COORDINATES", message: invalidMessage } },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Validates and normalizes an upstream smoke service URL without trailing slashes or query strings.
 */
export function normalizeServiceUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return null;
  }
}

/**
 * Reads an upstream response body as JSON without throwing on empty or HTML proxy errors.
 */
export async function readSafeJsonResponse(
  response: Response
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const rawBody = await response.text();
    if (!rawBody) {
      return { ok: false };
    }
    const parsed: unknown = JSON.parse(rawBody);
    return { ok: true, data: parsed };
  } catch {
    return { ok: false };
  }
}

/**
 * Extracts a bounded, key-redacted error message safe for server diagnostic logs.
 */
export function formatSafeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown_error";
  }
  return error.message
    .replace(/([?&](?:key|token|apiKey)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .slice(0, 200);
}
