import type { ProfileErrorCode } from "./types.ts";

export class ProfileServiceError extends Error {
  code: ProfileErrorCode;
  constructor(code: ProfileErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ProfileServiceError";
    this.code = code;
  }
}

/** Maps a PostgrestError (or anything thrown) from the onboarding / profile RPCs to a stable code. */
export function mapProfileError(err: unknown): ProfileServiceError {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const text = [e.message, e.details].filter((x): x is string => typeof x === "string").join(" ");
  const code = typeof e.code === "string" ? e.code : "";
  if (/too_young/.test(text)) return new ProfileServiceError("too-young", text);
  if (/username_unavailable/.test(text) || code === "23505") return new ProfileServiceError("username-unavailable", text);
  if (/rate_limited/.test(text) || code === "P0429") return new ProfileServiceError("rate-limited", text);
  if (/not_authenticated/.test(text) || code === "28000") return new ProfileServiceError("not-authenticated", text);
  if (/invalid_username/.test(text)) return new ProfileServiceError("invalid-username", text);
  return new ProfileServiceError("unknown", text || code || undefined);
}
