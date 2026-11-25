/** Provider-neutral user. A Firebase `User` satisfies this structurally, so firebase mode passes it through untouched. */
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerData: { providerId: string }[];
  getIdToken(): Promise<string>;
}

export type AuthErrorCode =
  | "invalid-email"
  | "invalid-credential"
  | "email-already-in-use"
  | "weak-password"
  | "email-not-confirmed"
  | "popup-closed"
  | "rate-limited"
  | "expired-link"
  | "unknown";

export interface SignUpResult {
  user: AppUser | null;
  /** True when the user must click an emailed link before a session exists (supabase mode). */
  needsEmailConfirmation: boolean;
}

export interface AuthService {
  readonly backend: "firebase" | "supabase";
  /** Immediately-or-soon calls back with the current user (null when signed out), then on every change. Returns unsubscribe. */
  onAuthStateChanged(callback: (user: AppUser | null) => void): () => void;
  /** Sync snapshot of the signed-in user (null until the first auth event). */
  getCurrentUser(): AppUser | null;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<AppUser>;
  signUpWithEmail(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  /** Re-sends the account confirmation email (supabase mode; firebase mode uses the 4-digit code API). */
  resendVerificationEmail(email: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Sets a new password for the signed-in (recovery) session. */
  updatePassword(newPassword: string): Promise<void>;
  getIdToken(): Promise<string | null>;
}
