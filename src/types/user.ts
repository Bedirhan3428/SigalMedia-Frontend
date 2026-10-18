import { Timestamp } from "firebase/firestore";

export interface UserStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

// [START] CREATED BY Umut
export interface MessageSettings {
  whoCanMessage: "everyone" | "following" | "followers" | "mutuals" | "none";
  readReceipts: boolean;
  showOnlineStatus: boolean;
}
// [END] CREATED BY Umut

export interface UserProfile {
  uid: string;
  email: string | null;
  username: string;
  username_lowercase: string;
  displayName: string;
  photoURL: string;
  bio: string;
  birthDate: string;
  age: number;
  isVerified: boolean;
  // [START] NexusAI
  isPrivate?: boolean;
  // [END] NexusAI
  emailVerified?: boolean;
  // [START] CREATED BY Umut
  messageSettings?: MessageSettings;
  // [END] CREATED BY Umut
  role: "user" | "admin";
  onboardingCompleted: boolean;
  stats: UserStats;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface UsernameDoc {
  uid: string;
  createdAt: Timestamp | string;
}
