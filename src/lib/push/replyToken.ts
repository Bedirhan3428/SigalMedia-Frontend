// Short-lived signed token that lets a notification reply action send a message
// without a Firebase session. HMAC-SHA256 over a compact JSON payload.
import { createHmac, hkdfSync, timingSafeEqual } from "crypto";

export const REPLY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ReplyClaims {
  /** uid that will author the reply (the notification recipient) */
  from: string;
  /** uid the reply goes to (the original sender) */
  to: string;
  chatId: string;
  /** expiry, epoch ms */
  exp: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
export const chatIdOf = (a: string, b: string) => [a, b].sort().join("_");

/** Derives a dedicated HMAC key from an existing server secret (no new env var). */
export function deriveReplySecret(masterSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterSecret, "sigalmedia-push-reply", "reply-token-v1", 32));
}

const mac = (secret: Buffer, body: string) => createHmac("sha256", secret).update(body).digest();

export function signReplyToken(
  secret: Buffer,
  c: { from: string; to: string; chatId: string },
  now = Date.now()
): string {
  const claims: ReplyClaims = { ...c, exp: now + REPLY_TOKEN_TTL_MS };
  const body = b64u(JSON.stringify(claims));
  return `${body}.${b64u(mac(secret, body))}`;
}

/** Returns the claims, or null for any malformed / tampered / expired / inconsistent token. */
export function verifyReplyToken(secret: Buffer, token: unknown, now = Date.now()): ReplyClaims | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let c: ReplyClaims;
  try {
    c = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!c || typeof c.from !== "string" || typeof c.to !== "string" || typeof c.chatId !== "string" || typeof c.exp !== "number") return null;
  if (!c.from || !c.to || c.from === c.to) return null;
  if (c.exp <= now) return null;
  // direction/chat consistency: the chat must be exactly the pair (from, to)
  if (c.chatId !== chatIdOf(c.from, c.to)) return null;
  return c;
}
