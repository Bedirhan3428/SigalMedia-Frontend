import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AuthServiceError, mapSupabaseAuthError } from "./errors.ts";
import type { AppUser, AuthService, SignUpResult } from "./types.ts";

type AuthClientLike = Pick<SupabaseClient, "auth">;

export interface SupabaseAuthOptions {
  /** Origin used to build redirect URLs (window.location.origin in the browser). */
  getOrigin: () => string;
}

const CALLBACK = "/auth/callback";

export function createSupabaseAuthService(client: AuthClientLike, options: SupabaseAuthOptions): AuthService {
  const auth = client.auth;
  let current: AppUser | null = null;

  const getIdToken = async (): Promise<string | null> => {
    const { data } = await auth.getSession();
    return data.session?.access_token ?? null;
  };

  const toAppUser = (u: User): AppUser => {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const app = (u.app_metadata ?? {}) as { provider?: string; providers?: string[] };
    const providers = app.providers?.length ? app.providers : app.provider ? [app.provider] : [];
    return {
      uid: u.id,
      email: u.email ?? null,
      displayName: (meta.full_name as string) || (meta.name as string) || null,
      photoURL: (meta.avatar_url as string) || (meta.picture as string) || null,
      emailVerified: Boolean(u.email_confirmed_at),
      providerData: providers.map((p) => ({ providerId: p === "google" ? "google.com" : p })),
      getIdToken: async () => (await getIdToken()) ?? "",
    };
  };

  const redirectTo = (next: string) => `${options.getOrigin()}${CALLBACK}?next=${encodeURIComponent(next)}`;

  return {
    backend: "supabase",

    onAuthStateChanged(callback) {
      let lastKey: string | null | undefined;
      const { data } = auth.onAuthStateChange((event, session) => {
        // TOKEN_REFRESHED fires every hour and on tab focus; the user did not change, so do not re-render the app.
        if (event === "TOKEN_REFRESHED" || event === "PASSWORD_RECOVERY") return;
        const u = session?.user ?? null;
        const key = u ? `${u.id}|${u.email_confirmed_at ?? ""}|${u.updated_at ?? ""}` : null;
        if (key === lastKey) return;
        lastKey = key;
        current = u ? toAppUser(u) : null;
        const next = current;
        // supabase-js holds a lock while invoking this callback; calling back into the client from it would deadlock,
        // so listeners (which fetch the profile) run on the next tick.
        setTimeout(() => callback(next), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    getCurrentUser: () => current,

    async signInWithGoogle() {
      const { error } = await auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo("/"), queryParams: { prompt: "select_account" } },
      });
      if (error) throw mapSupabaseAuthError(error);
    },

    async signInWithEmail(email, password) {
      const { data, error } = await auth.signInWithPassword({ email, password });
      if (error) throw mapSupabaseAuthError(error);
      if (!data.user) throw new AuthServiceError("unknown", "no user");
      return toAppUser(data.user);
    },

    async signUpWithEmail(email, password): Promise<SignUpResult> {
      const { data, error } = await auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo("/onboarding") },
      });
      if (error) throw mapSupabaseAuthError(error);
      // With email confirmation on, signing up an existing address returns an obfuscated user with no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new AuthServiceError("email-already-in-use", "identities_empty");
      }
      return {
        user: data.user ? toAppUser(data.user) : null,
        needsEmailConfirmation: !data.session,
      };
    },

    async signOut() {
      const { error } = await auth.signOut();
      current = null;
      if (error) throw mapSupabaseAuthError(error);
    },

    async resendVerificationEmail(email) {
      const { error } = await auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirectTo("/onboarding") },
      });
      if (error) throw mapSupabaseAuthError(error);
    },

    async sendPasswordReset(email) {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo: redirectTo("/auth/reset-password") });
      if (error) throw mapSupabaseAuthError(error);
    },

    async updatePassword(newPassword) {
      const { error } = await auth.updateUser({ password: newPassword });
      if (error) throw mapSupabaseAuthError(error);
    },

    getIdToken,
  };
}
