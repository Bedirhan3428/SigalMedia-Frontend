"use client";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { Post } from "@/lib/feed/types";

/** Gönderi ayarları sayfasındaki bir öğe; `confirm` verilirse seçilince onay adımı sorulur. */
export interface PostMenuItem {
  label: string;
  danger?: boolean;
  confirm?: string;
  onSelect: () => void;
}

export interface FeedActions {
  like: (post: Post) => void;
  /** Gönderiyi beğenir; zaten beğenilmişse beğenmeyi geri almaz (çift dokunma). */
  likeOnly: (post: Post) => void;
  save: (post: Post) => void;
  /** Sayfanın eklediği ek menü öğeleri. */
  postMenu?: (post: Post) => PostMenuItem[];
  openMenu: (post: Post, opener?: HTMLElement | null) => void;
  /** "Paylaş" sayfası: sohbetlere gönder, bağlantıyı kopyala. */
  openShare: (post: Post, opener?: HTMLElement | null) => void;
  vote: (pollId: string, optionId: string) => void;
  openChain: (rootId: string, opener?: HTMLElement | null) => void;
  openReply: (parent: Post, opener?: HTMLElement | null) => void;
  openProfile: (userId: string, opener?: HTMLElement | null) => void;
  openPoll: (parent: Post | null, opener?: HTMLElement | null) => void;
  /** Kısa bildirim; `action` verilirse düğme gösterilir ve bildirim daha uzun kalır (ör. "Tekrar dene"). */
  toast: (msg: string, icon?: ReactNode, action?: { label: string; onClick: () => void }) => void;
  /** Güncel gönderi: iyimser beğeni > servis önbelleği > verilen nesne. */
  resolve: (post: Post) => Post;
  /** Sayfa içi bir tam ekran katmanın (gönderi detayı) kapatma işlevini yığının tabanına kaydeder; Geri/Escape önce sayfaları, sonra bunu kapatır. */
  registerBase: (close: () => void) => () => void;
}

export const FeedActionsContext = createContext<FeedActions | null>(null);
export function useFeedActions(): FeedActions {
  const c = useContext(FeedActionsContext);
  if (!c) throw new Error("FeedActionsContext yok");
  return c;
}

/** Tam ekran katman açıkken Geri tuşu/Escape `onClose`u çağırır (sayfa yığınıyla tek geri girdisini paylaşır). */
export function useBaseLayer(onClose: () => void) {
  const { registerBase } = useFeedActions();
  const cb = useRef(onClose);
  useEffect(() => { cb.current = onClose; });
  useEffect(() => registerBase(() => cb.current()), [registerBase]);
}
