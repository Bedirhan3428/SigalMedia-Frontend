"use client";
import { memo } from "react";
import { useFeedActions } from "./FeedContext";

/** Ana gönderi ile yanıtı bağlayan ince kıvrık ok; tüm satır zinciri açan bir düğmedir. */
export const ReplyConnector = memo(function ReplyConnector({ rootId, parentUsername, replyUsername, count }: { rootId: string; parentUsername: string; replyUsername: string; count: number }) {
  const { openChain } = useFeedActions();
  return (
    <button
      type="button"
      className="fd-link"
      data-chain={rootId}
      aria-label={`@${replyUsername} yanıtı. Yanıt zincirini aç, ${count} yanıt`}
      onClick={(e) => openChain(rootId, e.currentTarget)}
    >
      <svg className="fd-c" viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true">
        <path d="M30 0 V12 Q30 30 50 30 H58" />
        <path d="M53 25 L59 30 L53 35" />
      </svg>
      <span className="fd-lt">
        ↳ @{parentUsername}&apos;e yanıt<small>· zinciri aç ({count})</small>
      </span>
    </button>
  );
});
