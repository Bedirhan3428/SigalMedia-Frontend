import { isSupabaseAuth } from "@/lib/backend";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createFirebaseProfileService } from "./firebaseProfile";
import { createSupabaseProfileService } from "./supabaseProfile";
import type { ProfileService } from "./types";

export { ProfileServiceError } from "./errors";
export type { OnboardingInput, ProfileErrorCode, ProfilePatch, ProfileService } from "./types";

let instance: ProfileService | null = null;

export function getProfileService(): ProfileService {
  return (instance ??= isSupabaseAuth ? createSupabaseProfileService(supabaseBrowser()) : createFirebaseProfileService());
}
