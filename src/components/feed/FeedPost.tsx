"use client";
import "./feed.css";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { feedService } from "@/lib/feed/feedService";
import type { Post } from "@/lib/feed/types";
import { useFeedActions } from "./FeedContext";
import { FeedProvider } from "./FeedProvider";
import { useFeedVersion } from "./hooks";
import { PostCard } from "./PostCard";
import { ReplyRail } from "./ReplyRail";

export interface FeedPostProps {
  post?: Post;
  /** Yalnızca kimlik verilirse gönderi servisten (Firestore ya da örnek) yüklenir. */
  postId?: string;
  variant?: "feed" | "detail";
  showReplies?: boolean;
  onDeleted?: () => void;
  /** Kartın altında ek eylemler; işlev verilirse `deleted()` ile onDeleted tetiklenir. */
  extraActions?: ReactNode | ((api: { deleted: () => void }) => ReactNode);
}

function DetailSkeleton() {
  return (
    <div className="fd-skel" aria-hidden="true" data-testid="fd-skel">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><i style={{ width: 36, height: 36, borderRadius: 999 }} /><i style={{ width: 120, height: 14 }} /></div>
      <i style={{ marginTop: 10, aspectRatio: "4/3", width: "100%", borderRadius: 0 }} />
      <i style={{ marginTop: 10, width: "70%", height: 14 }} />
    </div>
  );
}

/**
 * Tek gönderi sunumu: PostCard + ortak raydaki popüler yanıtlar + "Yanıt zincirini aç". Akışta, profilde ve /p/<id> sayfasında aynı bileşen kullanılır.
 * Üstte FeedProvider yoksa kendi sağlayıcısını kurar.
 */
export function FeedPost(props: FeedPostProps) {
  return (
    <FeedProvider>
      <Inner {...props} />
    </FeedProvider>
  );
}

function Inner({ post: postProp, postId, variant = "feed", showReplies = true, onDeleted, extraActions }: FeedPostProps) {
  const { resolve, openChain } = useFeedActions();
  const version = useFeedVersion();
  const [loaded, setLoaded] = useState<{ id: string; post: Post | null } | null>(null);
  const wantId = postProp?.id ?? postId;

  useEffect(() => {
    if (postProp || !postId) return;
    let off = false;
    void feedService.getPost(postId).then((p) => { if (!off) setLoaded({ id: postId, post: p ?? null }); });
    return () => { off = true; };
  }, [postProp, postId]);

  const base: Post | null | undefined = postProp ?? (loaded && loaded.id === postId ? loaded.post : undefined);
  const rootForReplies = base && !base.replyTo ? base.id : null;
  useEffect(() => {
    // Akış sayfa yüklerken yanıtları kendisi getirir; ayrıntı görünümü kök gönderi için yanıt rayını hazırlar.
    if (variant === "detail" && showReplies && rootForReplies) void feedService.prepareReplies(rootForReplies);
  }, [variant, showReplies, rootForReplies]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => (base ? resolve(base) : null), [base, resolve, version]);

  if (base === undefined && wantId) return <DetailSkeleton />;
  if (live?.kind === "reels") {
    // Güvenlik ağı: Reels türü gönderi gönderi bileşeninde çizilmez; Reels akışına bağlantı gösterilir.
    return (
      <div className="fd-empty" data-testid="fd-reelsonly">
        Bu bir Reels.{" "}
        <a className="fd-ghost" style={{ padding: "0 14px", display: "inline-flex", alignItems: "center" }} href={`/reels?id=${encodeURIComponent(live.id)}`}>Reels&apos;te aç</a>
      </div>
    );
  }
  if (!live) {
    return (
      <div className="fd-empty" data-testid="fd-notfound">
        Gönderi bulunamadı.
      </div>
    );
  }

  const extra = typeof extraActions === "function" ? extraActions({ deleted: () => onDeleted?.() }) : extraActions;
  const isReply = !!live.replyTo;
  const rail = showReplies && !isReply && live.replyCount > 0;
  const detail = variant === "detail";

  const card = (
    <>
      {isReply ? (
        <button
          type="button"
          className="fd-ctx"
          data-testid="fd-replyhdr"
          onClick={(e) => openChain(live.replyTo!.rootId, e.currentTarget)}
        >
          <span aria-hidden="true">↪</span> Bir gönderiye yanıt · <b>Zinciri aç</b>
        </button>
      ) : null}
      <PostCard post={live} />
    </>
  );

  if (detail) {
    return (
      <div className="fd-detail" data-fp={live.id}>
        {card}
        {rail ? <ReplyRail root={live} /> : null}
        {extra ? <div className="fd-xtra">{extra}</div> : null}
      </div>
    );
  }
  // Akış: ayırıcı çizgiler ve DOM yapısı değişmez (yanıtı olan kart .fd-grp içinde, ray ile).
  return rail ? (
    <div className="fd-grp">
      {card}
      <ReplyRail root={live} />
      {extra ? <div className="fd-xtra">{extra}</div> : null}
    </div>
  ) : (
    <>
      {card}
      {extra ? <div className="fd-xtra">{extra}</div> : null}
    </>
  );
}
