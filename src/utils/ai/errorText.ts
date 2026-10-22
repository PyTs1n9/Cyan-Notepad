import { t } from "@/utils/i18n";
import type { AiErrorCode } from "./provider";

/** Map `AiError` codes to localized user-facing text. */
export function aiErrorText(code: AiErrorCode | null, lang: "zh" | "en"): string {
  switch (code) {
    case "missing-key":
      return t(lang, "aiErrorMissingKey");
    case "unauthorized":
      return t(lang, "aiErrorUnauthorized");
    case "insufficient-balance":
      return t(lang, "aiErrorBalance");
    case "rate-limited":
      return t(lang, "aiErrorRateLimit");
    case "server":
      return t(lang, "aiErrorServer");
    case "bad-response":
      return t(lang, "aiErrorBadResponse");
    case "aborted":
      return t(lang, "aiErrorAborted");
    case "network":
    default:
      return t(lang, "aiErrorNetwork");
  }
}
