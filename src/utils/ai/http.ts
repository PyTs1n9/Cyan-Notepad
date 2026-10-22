/**
 * Shared HTTP plumbing for AI provider adapters.
 *
 * Requests must go through Tauri's http plugin: the webview origin cannot
 * reach third-party API hosts directly because they send no CORS headers.
 * In a plain browser (`npm run dev`) the plugin is absent, so fall back to
 * window.fetch — that path only works if the user opens the dev server with
 * CORS disabled, but it keeps the module importable.
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { AiError } from "./errors";

export const httpFetch: typeof fetch =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? (tauriFetch as unknown as typeof fetch)
    : window.fetch.bind(window);

export async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string };
        message?: string;
        msg?: string;
      };
      return (
        parsed.error?.message ?? parsed.message ?? parsed.msg ?? text
      ).slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

export function createHttpError(status: number, detail: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError("unauthorized", detail, status);
  }
  if (status === 402) {
    return new AiError("insufficient-balance", detail, status);
  }
  if (status === 429) {
    return new AiError("rate-limited", detail, status);
  }
  if (status >= 500) {
    return new AiError("server", detail, status);
  }
  return new AiError("bad-response", detail, status);
}

export function normalizeThrown(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AiError("aborted");
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") return new AiError("aborted");
    return new AiError("network", error.message);
  }
  return new AiError("network", String(error));
}

/**
 * Run a one-shot request with a hard deadline.
 *
 * `testKey` is the caller that needs this: without a deadline a stalled
 * connection leaves the settings panel in its "testing" state, which keeps
 * every key button disabled until the app restarts. The abort this helper
 * causes is reported as a network failure (not "aborted"/stopped), because
 * the user never asked to cancel anything.
 */
export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new AiError("network", "timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
