import type { AuthErrorCode } from "./types.ts";

export class AuthServiceError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthServiceError";
    this.code = code;
  }
}

export function mapFirebaseAuthError(err: unknown): AuthServiceError {
  const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : "";
  switch (code) {
    case "auth/invalid-email":
      return new AuthServiceError("invalid-email", code);
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return new AuthServiceError("invalid-credential", code);
    case "auth/email-already-in-use":
      return new AuthServiceError("email-already-in-use", code);
    case "auth/weak-password":
      return new AuthServiceError("weak-password", code);
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return new AuthServiceError("popup-closed", code);
    case "auth/too-many-requests":
      return new AuthServiceError("rate-limited", code);
    case "auth/expired-action-code":
    case "auth/invalid-action-code":
      return new AuthServiceError("expired-link", code);
    default:
      return new AuthServiceError("unknown", code || undefined);
  }
}

/** Maps an AuthError from supabase-js (has `code` like "invalid_credentials" and a numeric `status`). */
export function mapSupabaseAuthError(err: unknown): AuthServiceError {
  const e = (err ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  if (code === "invalid_credentials") return new AuthServiceError("invalid-credential", code);
  if (code === "email_not_confirmed") return new AuthServiceError("email-not-confirmed", code);
  if (code === "user_already_exists" || code === "email_exists") return new AuthServiceError("email-already-in-use", code);
  if (code === "weak_password") return new AuthServiceError("weak-password", code);
  if (code === "validation_failed" || code === "email_address_invalid") return new AuthServiceError("invalid-email", code);
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || e.status === 429) {
    return new AuthServiceError("rate-limited", code || "429");
  }
  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found") {
    return new AuthServiceError("expired-link", code);
  }
  if (/invalid login credentials/i.test(message)) return new AuthServiceError("invalid-credential", message);
  if (/email not confirmed/i.test(message)) return new AuthServiceError("email-not-confirmed", message);
  return new AuthServiceError("unknown", code || message || undefined);
}
