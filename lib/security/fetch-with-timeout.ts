/**
 * Fetch wrapper with configurable upstream timeout (default 8000ms).
 * Aborts hanging upstream requests cleanly to prevent worker exhaustion.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If signal was provided in options, link it
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if ((error as { name?: string }).name === "AbortError") {
      throw new Error(`Upstream request to ${new URL(url).hostname} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
