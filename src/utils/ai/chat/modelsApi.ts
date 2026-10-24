/**
 * `GET {baseUrl}/models` — the only way to discover what an endpoint actually
 * serves, and the connectivity test the settings page uses ("模型搜索").
 *
 * Payload shapes differ across OpenAI-compatible services, so all of these are
 * accepted:
 *   OpenAI / DeepSeek / Kimi …  { data: [{ id: "gpt-4o" }, …] }
 *   Ollama (v1 compat)          { data: [{ id }] } or { models: [{ name }] }
 *   some gateways               { models: ["a", "b"] } / ["a", "b"]
 */
import { AiError } from "../errors";
import { createHttpError, httpFetch, normalizeThrown, readErrorDetail } from "../http";
import { modelsUrl, normalizeBaseUrl } from "./endpoints";

const MODELS_TIMEOUT_MS = 20_000;

function collectModelIds(payload: unknown): string[] {
  const ids = new Set<string>();

  const takeEntry = (entry: unknown) => {
    if (typeof entry === "string") {
      if (entry.trim()) ids.add(entry.trim());
      return;
    }
    if (typeof entry !== "object" || entry === null) return;
    const record = entry as Record<string, unknown>;
    for (const key of ["id", "name", "model"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        ids.add(value.trim());
        return;
      }
    }
  };

  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(takeEntry);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    for (const key of ["data", "models", "results"]) {
      if (key in record) walk(record[key]);
    }
  };

  walk(payload);
  return [...ids];
}

/**
 * Fetch the model ids an endpoint serves.
 *
 * Errors carry the resolved URL in `detail`: the most common failure is a base
 * URL that needs (or must not have) a `/v1` segment, and "401" alone does not
 * tell the user which URL was actually hit.
 */
export async function fetchRemoteModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = modelsUrl(baseUrl);
  if (!normalizeBaseUrl(baseUrl)) throw new AiError("bad-response", "empty base url");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  let response: Response;
  try {
    response = await httpFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new AiError("aborted");
    if (controller.signal.aborted) {
      throw new AiError("network", `${url} · timeout`);
    }
    const normalized = normalizeThrown(error);
    throw new AiError(normalized.code, `${url} · ${normalized.detail ?? ""}`.trim());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const error = createHttpError(response.status, detail);
    throw new AiError(error.code, `${url} · ${detail}`.trim(), error.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AiError(
      "bad-response",
      `${url} · 返回的不是 JSON，可能该地址不是 OpenAI 兼容接口`,
    );
  }

  const ids = collectModelIds(payload).sort((a, b) => a.localeCompare(b));
  if (!ids.length) {
    throw new AiError("bad-response", `${url} · 该地址没有返回任何模型`);
  }
  return ids;
}
