import type { MessageSettings, UserProfile } from "../../types/user.ts";
import type { ProfileStyle } from "../../lib/profile/profileStyleStore.ts";
import type { ProfileRow } from "../../lib/supabase/types.ts";
import type { TypedSupabaseClient } from "../../lib/supabase/client.ts";
import { mediaUrl as defaultMediaUrl } from "../../lib/supabase/media.ts";
import { mapProfileError, ProfileServiceError } from "./errors.ts";
import type { OnboardingInput, ProfilePatch, ProfileService } from "./types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-z0-9_]{3,15}$/;

export function profileRowToUserProfile(row: ProfileRow, mediaUrl: (k: string | null | undefined) => string | undefined = defaultMediaUrl): UserProfile {
  const username = row.username ?? "";
  return {
    uid: row.id,
    email: null, // emails are not stored in profiles (RLS-readable); AuthContext keeps the session email
    username,
    username_lowercase: username.toLowerCase(),
    displayName: row.display_name,
    photoURL: mediaUrl(row.avatar_key) ?? "",
    bio: row.bio,
    birthDate: "", // private; never exposed by profiles
    age: 0,
    isVerified: row.is_verified,
    isPrivate: row.is_private,
    emailVerified: true,
    messageSettings: {
      whoCanMessage: row.who_can_message,
      readReceipts: row.read_receipts,
      showOnlineStatus: row.show_online_status,
    },
    profileStyle: row.profile_style as unknown as ProfileStyle,
    role: row.role === "admin" ? "admin" : "user",
    onboardingCompleted: row.onboarding_completed,
    stats: {
      postsCount: row.posts_count,
      followersCount: row.followers_count,
      followingCount: row.following_count,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageColumns(m: MessageSettings) {
  return { who_can_message: m.whoCanMessage, read_receipts: m.readReceipts, show_online_status: m.showOnlineStatus };
}

export function createSupabaseProfileService(
  client: TypedSupabaseClient,
  mediaUrl: (k: string | null | undefined) => string | undefined = defaultMediaUrl,
): ProfileService {
  const byColumn = async (column: "id" | "username", value: string): Promise<UserProfile | null> => {
    const { data, error } = await client.from("profiles").select("*").eq(column, value).maybeSingle();
    if (error) throw mapProfileError(error);
    return data ? profileRowToUserProfile(data as ProfileRow, mediaUrl) : null;
  };

  return {
    backend: "supabase",

    get: (uid) => byColumn("id", uid),

    async getByIdOrUsername(idOrUsername) {
      const raw = decodeURIComponent(idOrUsername).trim();
      if (UUID_RE.test(raw)) {
        const byId = await byColumn("id", raw.toLowerCase());
        if (byId) return byId;
      }
      const clean = raw.replace(/^@/, "").toLowerCase();
      return USERNAME_RE.test(clean) ? byColumn("username", clean) : null;
    },

    async checkUsernameAvailable(username) {
      const clean = username.trim().toLowerCase();
      if (!USERNAME_RE.test(clean)) return false;
      const { data, error } = await client.rpc("check_username_available", { p_username: clean });
      if (error) throw mapProfileError(error);
      return data === true;
    },

    // Emails are never readable from profiles, so username login is not available in supabase mode.
    resolveEmailForUsername: async () => null,

    async completeOnboarding(input: OnboardingInput) {
      // Same rule as the RPC (too_young); checked first so a minor never reaches the network.
      if (input.age < 13) throw new ProfileServiceError("too-young", "age < 13");
      const username = input.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) throw new ProfileServiceError("invalid-username", username);
      const { error } = await client.rpc("complete_onboarding", {
        p_username: username,
        p_display_name: input.displayName.trim().slice(0, 50) || username,
        p_birth_date: input.birthDate,
      });
      if (error) throw mapProfileError(error);
    },

    async update(uid, patch: ProfilePatch) {
      const columns: Partial<ProfileRow> = {};
      if (patch.displayName !== undefined) columns.display_name = patch.displayName.trim().slice(0, 50);
      if (patch.bio !== undefined) columns.bio = patch.bio;
      if (patch.isPrivate !== undefined) columns.is_private = patch.isPrivate;
      if (patch.messageSettings) Object.assign(columns, messageColumns(patch.messageSettings));
      if (patch.profileStyle !== undefined) columns.profile_style = patch.profileStyle as unknown as ProfileRow["profile_style"];
      if (patch.avatarKey !== undefined) columns.avatar_key = patch.avatarKey;
      if (Object.keys(columns).length === 0) return undefined;
      const { error } = await client.from("profiles").update(columns).eq("id", uid);
      if (error) throw mapProfileError(error);
      return undefined;
    },
  };
}
