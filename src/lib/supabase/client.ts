// @ts-nocheck -- WP-39 stub: `@supabase/supabase-js` is not installed yet and this file is NOT imported anywhere.
// When wiring (see docs/SUPABASE_PLAN.md): `npm i @supabase/supabase-js @supabase/ssr`, then remove the line above.
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let browser: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser singleton (anon key; RLS protects data). */
export function supabaseBrowser() {
  return (browser ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}

/** Public media URL: R2 custom domain on Cloudflare CDN + immutable object key. */
export function mediaUrl(key: string | null | undefined): string | undefined {
  const base = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  return key && base ? `${base.replace(/\/$/, "")}/${key}` : undefined;
}

// Server side (route handlers / server components): use createServerClient from "@supabase/ssr" with next/headers cookies().
