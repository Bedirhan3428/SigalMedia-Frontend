import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next 16 renamed the `middleware` file convention to `proxy`. Session refresh only (supabase mode); otherwise a no-op.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|mp3|json|txt|xml)$).*)"],
};
