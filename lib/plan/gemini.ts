import { PlanFacts, PlanInput, PlanNarrative } from "./types";
import { buildDeterministicNarrative } from "./narrative/fallback";
import { buildPlannerPrompt, GEMINI_NARRATIVE_RESPONSE_SCHEMA } from "./narrative/prompt";
import {
  PlanGenerationResult,
  ValidationFailureReason,
} from "./narrative/schema";
import { validatePlanNarrative } from "./narrative/validator";

export { NarrativeItemSchema, PlanNarrativeSchema } from "./narrative/schema";
export type {
  ValidationFailureReason,
  ValidationResult,
  PlanGenerationResult,
} from "./narrative/schema";
export {
  validatePlanNarrative,
  validateAndSanitizePlanNarrative,
} from "./narrative/validator";
export { buildDeterministicNarrative } from "./narrative/fallback";

const DEFAULT_PRIMARY_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_RETRY_MODEL = "gemini-flash-lite-latest";
const MAX_ATTEMPT_TIMEOUT_MS = 10000;
const MIN_ATTEMPT_TIMEOUT_MS = 50;

type AttemptFailureReason = "provider_error" | "invalid_output" | ValidationFailureReason;

type AttemptOutcome =
  | { success: true; modelUsed: string; narrative: PlanNarrative }
  | { success: false; reason: AttemptFailureReason; retryAfterHttp503Or429: boolean };

function resolveModelSequence(): string[] {
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_PRIMARY_MODEL;
  const retryModel =
    primaryModel === DEFAULT_PRIMARY_MODEL ? DEFAULT_RETRY_MODEL : DEFAULT_PRIMARY_MODEL;
  return [primaryModel, retryModel];
}

function computeAttemptTimeoutMs(overallDeadlineMs: number, modelsRemaining: number): number {
  const remainingMs = overallDeadlineMs - Date.now();
  const splitBudgetMs =
    modelsRemaining > 1 ? Math.floor(remainingMs / modelsRemaining) : remainingMs;
  return Math.min(MAX_ATTEMPT_TIMEOUT_MS, Math.max(MIN_ATTEMPT_TIMEOUT_MS, splitBudgetMs));
}

async function readResponseText(response: Response): Promise<string> {
  if (typeof response.text === "function") {
    return response.text();
  }
  if (typeof response.json === "function") {
    const jsonBody: unknown = await response.json();
    return typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody);
  }
  return "";
}

function parseGoogleErrorStatus(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as { error?: { status?: string } };
    return parsed?.error?.status;
  } catch {
    return undefined;
  }
}

async function executeSingleModelAttempt(params: {
  requestId: string;
  attemptNumber: number;
  modelName: string;
  apiKey: string;
  prompt: string;
  facts: PlanFacts;
  input: PlanInput;
  timeoutMs: number;
  fetchFn: typeof fetch;
}): Promise<AttemptOutcome> {
  const { requestId, attemptNumber, modelName, apiKey, prompt, facts, input, timeoutMs, fetchFn } =
    params;

  const startTimeIso = new Date().toISOString();
  const attemptStartMs = Date.now();
  const abortController = new AbortController();
  let headersReceived = false;
  let timedOutPhase: "before_headers" | "reading_body" | null = null;

  const timeoutHandle = setTimeout(() => {
    timedOutPhase = headersReceived ? "reading_body" : "before_headers";
    abortController.abort();
  }, timeoutMs);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent`;

    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
          responseSchema: GEMINI_NARRATIVE_RESPONSE_SCHEMA,
        },
      }),
      signal: abortController.signal,
    });

    headersReceived = true;
    const rawBodyText = await readResponseText(response);
    clearTimeout(timeoutHandle);
    const elapsedMs = Date.now() - attemptStartMs;

    if (!response.ok) {
      const googleErrorStatus = parseGoogleErrorStatus(rawBodyText);
      console.log(
        `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=http_error status=${response.status}${
          googleErrorStatus ? ` googleStatus=${googleErrorStatus}` : ""
        }`
      );
      return {
        success: false,
        reason: "provider_error",
        retryAfterHttp503Or429: response.status === 503 || response.status === 429,
      };
    }

    let parsedCandidateJson: unknown;
    try {
      const envelope = JSON.parse(rawBodyText) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const candidateText = envelope?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        console.log(
          `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=empty_output`
        );
        return { success: false, reason: "invalid_output", retryAfterHttp503Or429: false };
      }
      parsedCandidateJson = JSON.parse(candidateText);
    } catch {
      console.log(
        `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=invalid_output`
      );
      return { success: false, reason: "invalid_output", retryAfterHttp503Or429: false };
    }

    const validationResult = validatePlanNarrative(parsedCandidateJson, facts, input);
    if (!validationResult.success) {
      console.log(
        `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=validation_error reason=${validationResult.reason}`
      );
      return { success: false, reason: validationResult.reason, retryAfterHttp503Or429: false };
    }

    console.log(
      `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=success`
    );
    return {
      success: true,
      modelUsed: modelName,
      narrative: validationResult.narrative,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutHandle);
    const elapsedMs = Date.now() - attemptStartMs;
    const isAbortError =
      (error as { name?: string })?.name === "AbortError" || timedOutPhase !== null;

    if (isAbortError && timedOutPhase) {
      console.log(
        `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=timeout phase=${timedOutPhase}`
      );
    } else {
      console.log(
        `[plan:${requestId}] Attempt ${attemptNumber} (${modelName}) start=${startTimeIso} elapsed=${elapsedMs}ms outcome=network_error`
      );
    }
    return { success: false, reason: "provider_error", retryAfterHttp503Or429: false };
  }
}

/**
 * Calls Gemini API with structured output and verified factual inputs,
 * attempting primary and retry models confirmed available to the project,
 * parsing and validating inside the retry loop, keeping the abort timer active
 * until the response body has been read, and enforcing an overall deadline.
 * Falls back gracefully to deterministic facts if unconfigured, invalid, or timed out.
 */
export async function generatePlan(
  input: PlanInput,
  facts: PlanFacts,
  apiKey?: string,
  overallTimeoutMs: number = 35000,
  requestId?: string,
  sleepFn: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  fetchFn: typeof fetch = (...args) => fetch(...args)
): Promise<PlanGenerationResult> {
  const correlationId = requestId || crypto.randomUUID();
  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!resolvedApiKey || resolvedApiKey === "your-gemini-api-key") {
    console.log(
      `[plan:${correlationId}] Plan result: status=deterministic_fallback, modelUsed=none, reason=missing_key`
    );
    return {
      status: "deterministic_fallback",
      modelUsed: null,
      narrative: buildDeterministicNarrative(input, facts),
      fallbackReason: "missing_key",
    };
  }

  const prompt = buildPlannerPrompt(input, facts);
  const modelsToTry = resolveModelSequence();
  const overallDeadlineMs = Date.now() + overallTimeoutMs;
  let lastFallbackReason: AttemptFailureReason = "provider_error";

  for (let index = 0; index < modelsToTry.length; index++) {
    const remainingMs = overallDeadlineMs - Date.now();
    if (remainingMs <= 20) {
      console.log(
        `[plan:${correlationId}] Overall request deadline reached (${remainingMs}ms remaining), falling back to deterministic plan`
      );
      break;
    }

    const attemptOutcome = await executeSingleModelAttempt({
      requestId: correlationId,
      attemptNumber: index + 1,
      modelName: modelsToTry[index],
      apiKey: resolvedApiKey,
      prompt,
      facts,
      input,
      timeoutMs: computeAttemptTimeoutMs(overallDeadlineMs, modelsToTry.length - index),
      fetchFn,
    });

    if (attemptOutcome.success) {
      console.log(
        `[plan:${correlationId}] Plan result: status=gemini_generated, modelUsed=${attemptOutcome.modelUsed}, reason=none`
      );
      return {
        status: "gemini_generated",
        modelUsed: attemptOutcome.modelUsed,
        narrative: attemptOutcome.narrative,
      };
    }

    lastFallbackReason = attemptOutcome.reason;
    const hasRemainingAttempt = index + 1 < modelsToTry.length && overallDeadlineMs - Date.now() > 1000;
    if (attemptOutcome.retryAfterHttp503Or429 && hasRemainingAttempt) {
      const backoffMs = Math.min(1500, Math.max(0, overallDeadlineMs - Date.now() - 500));
      if (backoffMs > 0) {
        await sleepFn(backoffMs);
      }
    }
  }

  console.log(
    `[plan:${correlationId}] Plan result: status=deterministic_fallback, modelUsed=none, reason=${lastFallbackReason}`
  );

  return {
    status: "deterministic_fallback",
    modelUsed: null,
    narrative: buildDeterministicNarrative(input, facts),
    fallbackReason: lastFallbackReason,
  };
}
