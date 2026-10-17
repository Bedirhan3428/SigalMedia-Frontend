import { Timestamp } from "firebase/firestore";

export interface UserStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

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
  isPrivate?: boolean;
  emailVerified?: boolean;
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
