/**
 * One place that turns a user-visible reasoning level into the concrete call
 * target: which model id to send, plus the reasoning wire fields.
 *
 * `"off"` sends `thinking: {type:"disabled"}` and no `reasoning_effort` at all —
 * an effort value is meaningless once the reasoning phase is disabled, and some
 * compatible servers reject the combination.
 *
 * A model that cannot think gets **no thinking field whatsoever**: unknown
 * top-level fields make some OpenAI-compatible servers reject the request, so
 * "unsupported" must not be expressed as `disabled`.
 */
import type { ModelTarget, ProviderModel, ThinkingLevel } from "./chat/types";

export interface ThinkingWire {
  thinking: "enabled" | "disabled";
  reasoningEffort?: "low" | "high";
}

export function thinkingWire(level: ThinkingLevel): ThinkingWire {
  if (level === "off") return { thinking: "disabled" };
  return { thinking: "enabled", reasoningEffort: level };
}

/**
 * Resolve a level for one concrete model of a provider.
 *
 * `model` falls back to the provider's default entry, which is what an
 * unspecified request would hit anyway. The capability comes from the model
 * itself (`ProviderModel.supportsThinking`), never from the vendor: one endpoint
 * can serve both reasoning and plain models.
 */
export function resolveModelTarget(
  models: ProviderModel[],
  defaultModel: string,
  level: ThinkingLevel,
  model?: string,
): ModelTarget {
  const id = model ?? defaultModel;
  const entry = models.find((item) => item.id === id);
  if (!entry?.supportsThinking) return { model: id };
  return { model: id, ...thinkingWire(level) };
}
