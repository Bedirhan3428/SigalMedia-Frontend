"use client";
import "./feed.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBackLayer } from "@/lib/chat/useBackLayer";
import { feedService } from "@/lib/feed/feedService";
import type { Badge, DurationKey, MediaDraft, Post } from "@/lib/feed/types";
import { BadgeCelebration } from "./BadgeCelebration";
import { BadgeIcon } from "./BadgeIcon";
import { BadgeShelfSheet } from "./BadgeShelfSheet";
import { ChainSheet } from "./ChainSheet";
import { ComposerSheet } from "./ComposerSheet";
import { FeedActionsContext, type FeedActions } from "./FeedContext";
import { GlyphSprite, Icon } from "./glyphs";
import { PollComposerSheet } from "./PollComposerSheet";
import { PostCard } from "./PostCard";
import { ReplyConnector } from "./ReplyConnector";
import { useFeedUser } from "./UserParts";

type SheetState = (
  | { t: "chain"; rootId: string }
  | { t: "compose"; parent: Post | null }
  | { t: "poll"; parent: Post | null }
  | { t: "profile"; userId: string }
  | { t: "cel"; badge: Badge }
) & { opener?: HTMLElement | null };

const PAGE = 5;

function Skeleton() {
  return (
    <div className="fd-skel" aria-hidden="true" data-testid="fd-skel">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><i style={{ width: 36, height: 36, borderRadius: 999 }} /><i style={{ width: 120, height: 14 }} /></div>
      <i style={{ marginTop: 10, aspectRatio: "4/3", width: "100%", borderRadius: 0 }} />
      <i style={{ marginTop: 10, width: "70%", height: 14 }} />
    </div>
  );
}

function ChainLink({ parent, reply }: { parent: Post; reply: Post }) {
  const p = useFeedUser(parent.authorId);
  const r = useFeedUser(reply.authorId);
  return <ReplyConnector rootId={parent.replyTo?.rootId ?? parent.id} parentUsername={p.username} replyUsername={r.username} count={parent.replyCount} />;
}

export default function FeedList() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? "guest";
  const username = profile?.username || profile?.displayName || "sen";
  const photo = profile?.photoURL || undefined;

  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stack, setStack] = useState<SheetState[]>([]);
  const [toastState, setToastState] = useState<{ id: number; msg: string; icon?: ReactNode } | null>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const doneRef = useRef(false);
  const itemsRef = useRef<Post[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { itemsRef.current = items; }, [items]);

  // Güncel kullanıcı servise bildirilir, sonra ilk sayfa yüklenir.

  const loadMore = useCallback(async (first = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const page = await feedService.listFeed(first ? undefined : cursorRef.current ?? undefined, PAGE);
      setItems((prev) => {
        if (first) return page.items;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
      });
      setCursor(page.nextCursor);
      cursorRef.current = page.nextCursor;
      doneRef.current = page.nextCursor === null;
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    feedService.setCurrentUser({ id: uid, username, avatarUrl: photo });
  }, [uid, username, photo]);
  useEffect(() => {
    doneRef.current = false;
    cursorRef.current = null;
    void loadMore(true);
    // yalnızca kullanıcı değişince yeniden yükle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, loadMore]);

  // Sonsuz kaydırma
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && !doneRef.current && !loadingRef.current && cursorRef.current) void loadMore(false);
    }, { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, items.length]);

  /** Yeni gönderi/yanıttan sonra yüklenmiş kadar orijinal gönderiyi yeniden çeker. */
  const refresh = useCallback(async (extraOriginal: boolean) => {
    const originals = itemsRef.current.filter((p) => !p.replyTo).length + (extraOriginal ? 1 : 0);
    const page = await feedService.listFeed(undefined, Math.max(PAGE, originals));
    setItems(page.items);
    setCursor(page.nextCursor);
    cursorRef.current = page.nextCursor;
    doneRef.current = page.nextCursor === null;
  }, []);

  const toast = useCallback((msg: string, icon?: ReactNode) => {
    clearTimeout(toastTimer.current);
    setToastState({ id: Date.now(), msg, icon });
    toastTimer.current = setTimeout(() => setToastState(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const patch = useCallback((p: Post) => setItems((prev) => prev.map((x) => (x.id === p.id ? p : x))), []);

  const like = useCallback((post: Post) => {
    const flipped = { ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) } as Post;
    patch(flipped);
    feedService.toggleLike(post.id).then(patch).catch(() => patch(post));
  }, [patch]);

  const vote = useCallback((pollId: string, optionId: string) => {
    feedService.vote(pollId, optionId).then((p) => {
      patch(p);
      const left = feedService.votesToKahin();
      toast(left > 0 ? `Oyun kaydedildi. Kahin rozetine ${left} oy kaldı!` : "Oyun kaydedildi.", <BadgeIcon id="kahin" />);
    }).catch(() => toast("Oy verilemedi."));
  }, [patch, toast]);

  // Sayfa yığını (tek geri katmanı), rozet kutlaması kuyruğu
  const stackRef = useRef<SheetState[]>([]);
  const queueRef = useRef<Badge[]>([]);
  const setSheets = useCallback((next: SheetState[]) => { stackRef.current = next; setStack(next); }, []);
  const withQueue = useCallback((next: SheetState[]): SheetState[] => (next.length === 0 && queueRef.current.length ? [{ t: "cel", badge: queueRef.current.shift()!, opener: null }] : next), []);
  const push = useCallback((s: SheetState) => setSheets([...stackRef.current, { ...s, opener: s.opener ?? (document.activeElement as HTMLElement | null) }]), [setSheets]);
  const replaceTop = useCallback((s: SheetState) => { const st = stackRef.current; setSheets([...st.slice(0, -1), { ...s, opener: st[st.length - 1]?.opener }]); }, [setSheets]);
  const popTop = useCallback((): boolean => { const next = withQueue(stackRef.current.slice(0, -1)); setSheets(next); return next.length > 0; }, [setSheets, withQueue]);
  const closeAll = useCallback(() => setSheets(withQueue([])), [setSheets, withQueue]);
  useBackLayer(stack.length > 0, popTop);
  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); popTop(); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [stack.length, popTop]);
  useEffect(() => feedService.onBadgeUnlocked((b) => {
    queueRef.current.push(b);
    if (stackRef.current.length === 0) closeAll();
  }), [closeAll]);

  const actions = useMemo<FeedActions>(() => ({
    like,
    vote,
    openChain: (rootId, opener) => push({ t: "chain", rootId, opener }),
    openReply: (parent, opener) => push({ t: "compose", parent, opener }),
    openProfile: (userId, opener) => push({ t: "profile", userId, opener }),
    toast,
  }), [like, vote, push, toast]);

  const submitMedia = async (parent: Post | null, d: MediaDraft) => {
    const created = parent ? await feedService.createReply(parent.id, d) : await feedService.createPost(d);
    closeAll();
    await refresh(!parent);
    toast(parent ? "Yanıtın zincire eklendi" : "Gönderin paylaşıldı", <Icon id="i-check" />);
    return created;
  };
  const submitPoll = async (parent: Post | null, d: { question: string; options: string[]; durationKey: DurationKey }) => {
    const draft = { kind: "poll" as const, ...d };
    if (parent) await feedService.createReply(parent.id, draft); else await feedService.createPost(draft);
    closeAll();
    await refresh(!parent);
    toast(parent ? "Anketin zincire eklendi" : "Anketin yayında", <Icon id="i-check" />);
  };

  // Ebeveyn + ilk yanıt gruplama
  const groups = useMemo(() => {
    const out: { post: Post; reply?: Post }[] = [];
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (p.replyTo) continue;
      const n = items[i + 1];
      if (n?.replyTo && n.replyTo.parentId === p.id) { out.push({ post: p, reply: n }); i++; } else out.push({ post: p });
    }
    return out;
  }, [items]);

  const top = stack[stack.length - 1];
  const sheet = top ? (
    top.t === "chain" ? (
      <ChainSheet key={`chain-${top.rootId}`} rootId={top.rootId} opener={top.opener} onClose={popTop} onReply={(p) => replaceTop({ t: "compose", parent: p, opener: undefined })} />
    ) : top.t === "compose" ? (
      <ComposerSheet key="compose" parent={top.parent} opener={top.opener} onClose={popTop} onPoll={() => replaceTop({ t: "poll", parent: top.parent })} onSubmit={async (d) => { await submitMedia(top.parent, d); }} />
    ) : top.t === "poll" ? (
      <PollComposerSheet key="poll" parent={top.parent} opener={top.opener} onClose={popTop} onSubmit={(d) => submitPoll(top.parent, d)} />
    ) : top.t === "profile" ? (
      <BadgeShelfSheet key={`prof-${top.userId}`} userId={top.userId} opener={top.opener} onClose={popTop} />
    ) : (
      <BadgeCelebration key={`cel-${top.badge.id}`} badge={top.badge} opener={top.opener} onClose={popTop} />
    )
  ) : null;

  return (
    <FeedActionsContext.Provider value={actions}>
      <div className="fd-root" data-testid="fd-feed">
        <GlyphSprite />
        <div role="feed" aria-label="Gönderi akışı" aria-busy={loading}>
          {groups.map(({ post, reply }) =>
            reply ? (
              <div className="fd-grp" key={post.id}>
                <PostCard post={post} />
                <ChainLink parent={post} reply={reply} />
                <PostCard post={reply} child />
              </div>
            ) : (
              <PostCard key={post.id} post={post} />
            ),
          )}
          {loading ? <><Skeleton /><Skeleton /></> : null}
        </div>
        {error ? (
          <div className="fd-empty">
            Akış yüklenemedi.{" "}
            <button type="button" className="fd-ghost" style={{ padding: "0 14px" }} onClick={() => void loadMore(items.length === 0)}>Tekrar dene</button>
          </div>
        ) : null}
        {!loading && !error && cursor === null && items.length > 0 ? <p className="fd-empty">Hepsi bu kadar. Yeni gönderiler için daha sonra gel.</p> : null}
        <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
        {toastState ? <div className="fd-toast" role="status" aria-live="polite" key={toastState.id}>{toastState.icon}<p>{toastState.msg}</p></div> : null}
        {sheet}
      </div>
    </FeedActionsContext.Provider>
  );
}
