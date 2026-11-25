import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let browser: TypedSupabaseClient | null = null;

/** Browser singleton (publishable key; RLS protects data). Only call when NEXT_PUBLIC_BACKEND_AUTH=supabase. */
export function supabaseBrowser(): TypedSupabaseClient {
  if (browser) return browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set when NEXT_PUBLIC_BACKEND_AUTH=supabase");
  }
  browser = createBrowserClient<Database>(url, key);
  return browser;
}
