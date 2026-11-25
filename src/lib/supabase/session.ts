import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAuth } from "../backend";

/**
 * Refreshes the Supabase session cookies on each request (called from src/proxy.ts).
 * No-op unless NEXT_PUBLIC_BACKEND_AUTH=supabase. Never redirects: the app guards routes client-side.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!isSupabaseAuth || !url || !key) return response;
  // Only requests carrying auth cookies can have a session to refresh.
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  try {
    await supabase.auth.getClaims(); // verifies the JWT and rotates the cookies when it is about to expire
  } catch {
    // A failed refresh must never break page loads.
  }
  return response;
}
