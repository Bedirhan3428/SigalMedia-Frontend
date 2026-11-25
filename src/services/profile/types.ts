import type { MessageSettings, UserProfile } from "../../types/user.ts";
import type { ProfileStyle } from "../../lib/profile/profileStyleStore.ts";

export type ProfileErrorCode =
  | "not-authenticated"
  | "invalid-username"
  | "username-unavailable"
  | "too-young"
  | "rate-limited"
  | "unknown";

export interface OnboardingInput {
  uid: string;
  email: string | null;
  username: string;
  displayName: string;
  /** ISO date yyyy-mm-dd */
  birthDate: string;
  age: number;
  /** Firebase mode only: avatar upload (supabase avatars arrive with the R2 presign work package). */
  avatarFile?: File | null;
  /** Firebase mode only: fallback photo (Google photo / generated). */
  photoURL?: string | null;
}

export interface ProfilePatch {
  displayName?: string;
  bio?: string;
  isPrivate?: boolean;
  messageSettings?: MessageSettings;
  profileStyle?: ProfileStyle;
  /** Supabase mode: R2 object key of the avatar (null clears it). */
  avatarKey?: string | null;
  /** Firebase mode only. */
  avatarFile?: File | null;
  photoRemoved?: boolean;
}

export interface ProfileService {
  readonly backend: "firebase" | "supabase";
  get(uid: string): Promise<UserProfile | null>;
  /** Accepts a uid, "@username" or "username". */
  getByIdOrUsername(idOrUsername: string): Promise<UserProfile | null>;
  checkUsernameAvailable(username: string): Promise<boolean>;
  /** Username -> login email (firebase mode only; supabase mode never exposes emails and returns null). */
  resolveEmailForUsername(username: string): Promise<string | null | "not-found">;
  completeOnboarding(input: OnboardingInput): Promise<void>;
  /** Resolves with the resulting photo URL when the avatar changed (firebase), otherwise undefined. */
  update(uid: string, patch: ProfilePatch): Promise<string | undefined>;
}
