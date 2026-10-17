import { Timestamp } from "firebase/firestore";

export interface BlockRecord {
  blockerUid: string;
  blockedUid: string;
  createdAt: Timestamp | string;
}

export interface BlockedUserData {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  blockedAt?: Timestamp | string;
}

export interface FollowRequestData {
  requestId: string;
  requesterUid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  createdAt: Timestamp | string;
}
