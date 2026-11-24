"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Post } from "@/lib/feed/types";

export interface FeedActions {
  like: (post: Post) => void;
  vote: (pollId: string, optionId: string) => void;
  openChain: (rootId: string, opener?: HTMLElement | null) => void;
  openReply: (parent: Post, opener?: HTMLElement | null) => void;
  openProfile: (userId: string, opener?: HTMLElement | null) => void;
  toast: (msg: string, icon?: ReactNode) => void;
}

export const FeedActionsContext = createContext<FeedActions | null>(null);
export function useFeedActions(): FeedActions {
  const c = useContext(FeedActionsContext);
  if (!c) throw new Error("FeedActionsContext yok");
  return c;
}
