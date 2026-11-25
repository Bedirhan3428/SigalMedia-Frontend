import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { TypedSupabaseClient } from "./client";
import type { Database } from "./types";

/**
 * Service-role client. Server only (the `server-only` import fails the build if a client component pulls this in).
 * Returns null when SUPABASE_SECRET_KEY is not set so callers can degrade gracefully.
 */
export function supabaseAdmin(): TypedSupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
