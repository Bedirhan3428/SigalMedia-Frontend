// [START] AeroCode
import { Timestamp } from "firebase/firestore";

export interface FollowRecord {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Timestamp | string;
}

export interface FollowUserData {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  isFollowing: boolean;
  followersCount?: number;
}
// [END] AeroCode
