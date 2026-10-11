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
}
