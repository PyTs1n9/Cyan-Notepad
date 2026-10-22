/**
 * Error taxonomy shared by every AI provider adapter (chat and search).
 * Kept provider-agnostic: adapters map their own failures onto these codes
 * so the UI layer can render one error vocabulary regardless of vendor.
 */

export type AiErrorCode =
  | "missing-key"
  | "unauthorized"
  | "insufficient-balance"
  | "rate-limited"
  | "network"
  | "aborted"
  | "server"
  | "bad-response";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;
  readonly detail?: string;

  constructor(code: AiErrorCode, detail?: string, status?: number) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}
