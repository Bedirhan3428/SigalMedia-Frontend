import { Timestamp } from "firebase/firestore";

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorPhotoURL?: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  type: "post" | "reels";
  caption?: string;
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp | any;
  /** Yanıt ise (WP-28): zincirler düz, parentId = rootId, depth = 1. */
  replyTo?: { parentId: string; rootId: string; depth: number };
}
