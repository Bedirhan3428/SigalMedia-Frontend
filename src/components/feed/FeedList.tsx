"use client";
import "./feed.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useBackLayer } from "@/lib/chat/useBackLayer";
import { feedService } from "@/lib/feed/feedService";
import type { Badge, DurationKey, Post } from "@/lib/feed/types";
import { BadgeCelebration } from "./BadgeCelebration";
import { BadgeIcon } from "./BadgeIcon";
import { BadgeShelfSheet } from "./BadgeShelfSheet";
import { ChainSheet } from "./ChainSheet";
import { FeedActionsContext, type FeedActions } from "./FeedContext";
import { GlyphSprite, Icon } from "./glyphs";
import { PollComposerSheet } from "./PollComposerSheet";
import { PostCard } from "./PostCard";
import { ReplyRail } from "./ReplyRail";

type SheetState = (
  | { t: "chain"; rootId: string }
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

export default function FeedList() {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? "guest";
  const router = useRouter();
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
  /** Editörden dönüş: /?highlight=<yeni yanıt kimliği> */
  const hlDone = useRef(false);
  const [hlTarget, setHlTarget] = useState<{ id: string; rootId: string } | null>(null);
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
    void extraOriginal;
    const page = await feedService.listFeed(undefined, PAGE);
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

  // Foto/video yanıtı gerçek editörde verilir (WP-27); anket yanıtı akışta kalır.
  // Yanıta yanıt yoktur: yanıt kartındaki ok da kökü hedefler.
  const goReply = useCallback((parent: Post) => router.push(`/share?replyTo=${encodeURIComponent(parent.replyTo?.rootId ?? parent.id)}`), [router]);

  // Editörden dönüş: yeni yanıtı vurgula ya da anket yanıtı sayfasını aç.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hl = q.get("highlight");
    const pr = q.get("pollReplyTo");
    if (!hl && !pr) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (pr) {
      void feedService.getPost(pr).then((p) => { if (p) push({ t: "poll", parent: p }); });
    }
    if (hl) {
      setTimeout(() => toast("Yanıtın zincire eklendi", <Icon id="i-check" />), 0);
      void feedService.getPost(hl).then((p) => {
        if (p) setHlTarget({ id: p.id, rootId: p.replyTo?.rootId ?? p.id });
      });
    }
    // yalnızca açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hlTarget || hlDone.current || items.length === 0 || loading) return;
    const el = document.getElementById(`c-${hlTarget.id}`) ?? document.getElementById(`c-${hlTarget.rootId}`);
    hlDone.current = true;
    if (!el) {
      // Kök gönderi henüz yüklü sayfalarda değil: yanıtı zincir sayfasında göster
      push({ t: "chain", rootId: hlTarget.rootId });
      return;
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center" });
      el.classList.add("fd-hl");
      setTimeout(() => el.classList.remove("fd-hl"), 2600);
    });
  }, [hlTarget, items, loading, push]);

  const actions = useMemo<FeedActions>(() => ({
    like,
    vote,
    openChain: (rootId, opener) => push({ t: "chain", rootId, opener }),
    openReply: (parent) => goReply(parent),
    openProfile: (userId, opener) => push({ t: "profile", userId, opener }),
    toast,
  }), [like, vote, push, toast, goReply]);

  /** Sayfa katmanı kapanırken geri girdisi temizlenir (history.back); gezinmeyi bundan sonra yap. */
  const replyFromSheet = (p: Post) => {
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener("popstate", go); goReply(p); };
    window.addEventListener("popstate", go);
    setTimeout(go, 200);
    closeAll();
  };
  const submitPoll = async (parent: Post | null, d: { question: string; options: string[]; durationKey: DurationKey }) => {
    const draft = { kind: "poll" as const, ...d };
    if (parent) await feedService.createReply(parent.id, draft); else await feedService.createPost(draft);
    closeAll();
    await refresh(!parent);
    toast(parent ? "Anketin zincire eklendi" : "Anketin yayında", <Icon id="i-check" />);
  };

  const top = stack[stack.length - 1];
  const sheet = top ? (
    top.t === "chain" ? (
      <ChainSheet key={`chain-${top.rootId}`} rootId={top.rootId} opener={top.opener} onClose={popTop} onReply={(p) => replyFromSheet(p)} />
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
          {items.map((post) =>
            post.replyCount > 0 ? (
              <div className="fd-grp" key={post.id}>
                <PostCard post={post} />
                <ReplyRail root={post} />
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
