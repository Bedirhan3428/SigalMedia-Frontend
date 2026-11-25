import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseAuth } from "@/lib/backend";
import { safeNextPath } from "@/lib/supabase/redirect";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

/**
 * Supabase auth landing route (OAuth + PKCE email links + token_hash email templates).
 * Without a usable code it sends the visitor to /login, so it is safe to open directly.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));
  const toLogin = (reason?: string) =>
    NextResponse.redirect(`${origin}/login${reason ? `?error=${reason}` : ""}`);

  if (!isSupabaseAuth || !supabaseConfigured()) return toLogin();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (!code && !(tokenHash && type)) return toLogin();

  try {
    const supabase = await supabaseServer();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash as string });
    if (error) return toLogin("auth_callback");
  } catch {
    return toLogin("auth_callback");
  }

  // Recovery links land on the password form; everything else on the requested page (AuthContext routes onward).
  return NextResponse.redirect(`${origin}${type === "recovery" ? "/auth/reset-password" : next}`);
}
