// Backend feature flags (docs/SUPABASE_PLAN.md section 8). Unset or any unknown value means "firebase".
export type BackendKind = "firebase" | "supabase";

export function resolveBackend(value: string | undefined | null): BackendKind {
  return value?.trim().toLowerCase() === "supabase" ? "supabase" : "firebase";
}

// NEXT_PUBLIC_* is inlined at build time, so this is a compile-time constant in the browser bundle.
export const BACKEND_AUTH: BackendKind = resolveBackend(process.env.NEXT_PUBLIC_BACKEND_AUTH);
export const isSupabaseAuth = BACKEND_AUTH === "supabase";
