"use client";
import { memo, type ReactNode } from "react";
import { feedService } from "@/lib/feed/feedService";
import type { Post } from "@/lib/feed/types";
import { useFeedActions } from "./FeedContext";
import { useFeedVersion } from "./hooks";
import { PostCard } from "./PostCard";

/** Dal: ortak dikey çizgiden ayrılan kıvrık ok. Her dal kendi yüksekliği kadar çizgi taşır, son dal çizgiyi keser. */
function Branch({ arrowY, children, className = "" }: { arrowY: number; children: ReactNode; className?: string }) {
  return (
    <div className={`fd-br ${className}`}>
      <svg className="fd-bc" viewBox="0 0 24 44" width="24" height="44" aria-hidden="true" style={{ top: arrowY - 24 }}>
        <path d="M0.65 12 Q0.65 24 14 24 H21" />
        <path d="M16 19 L22 24 L16 29" />
      </svg>
      {children}
    </div>
  );
}

/**
 * Bir gönderinin altındaki yanıt rayı: tek dikey çizgi, en popüler (en çok 2) yanıtlar tam kart olarak,
 * son dal "Yanıt zincirini aç (n)". Yanıt yoksa ray yoktur; yanıt var ama popüler yoksa yalnızca zincir satırı görünür.
 */
export const ReplyRail = memo(function ReplyRail({ root }: { root: Post }) {
  const { openChain } = useFeedActions();
  useFeedVersion();
  const popular = feedService.getPopularReplies(root.id, 2);
  const total = root.replyCount;
  if (total <= 0) return null;
  return (
    <div className="fd-rail" data-rail={root.id} data-branches={popular.length + 1}>
      {popular.map((r) => (
        <Branch key={r.id} arrowY={30} className="fd-br-card">
          <PostCard post={r} child />
        </Branch>
      ))}
      <Branch arrowY={22} className="fd-br-open">
        <button
          type="button"
          className="fd-link"
          data-chain={root.id}
          aria-label={`Yanıt zincirini aç, ${total} yanıt`}
          onClick={(e) => openChain(root.id, e.currentTarget)}
        >
          <span className="fd-lt">Yanıt zincirini aç ({total})</span>
        </button>
      </Branch>
    </div>
  );
});
