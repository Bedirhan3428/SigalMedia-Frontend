import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAuth } from "../backend";
import { supabaseConfigured, supabaseServer } from "./server";
import type { TypedSupabaseClient } from "./client";

export function notSupabase(): NextResponse | null {
  if (isSupabaseAuth && supabaseConfigured()) return null;
  return NextResponse.json({ error: "not_implemented", message: "Account API is available only with NEXT_PUBLIC_BACKEND_AUTH=supabase" }, { status: 501 });
}

/** Same-origin check for cookie-authenticated, state-changing requests. */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function requireUser(): Promise<{ supabase: TypedSupabaseClient; userId: string } | NextResponse> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser(); // verifies the JWT with the auth server; never trust getSession() here
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return { supabase, userId: data.user.id };
}
