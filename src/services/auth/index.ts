import { isSupabaseAuth } from "@/lib/backend";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createFirebaseAuthService } from "./firebaseAuth";
import { createSupabaseAuthService } from "./supabaseAuth";
import type { AuthService } from "./types";

export { AuthServiceError } from "./errors";
export type { AppUser, AuthErrorCode, AuthService, SignUpResult } from "./types";

let instance: AuthService | null = null;

/** Picks the backend from NEXT_PUBLIC_BACKEND_AUTH (default firebase). Supabase code runs only when the flag is "supabase". */
export function getAuthService(): AuthService {
  return (instance ??= isSupabaseAuth
    ? createSupabaseAuthService(supabaseBrowser(), { getOrigin: () => window.location.origin })
    : createFirebaseAuthService());
}
