"use client";
import "./feed.css";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useBackLayer } from "@/lib/chat/useBackLayer";
import { feedService } from "@/lib/feed/feedService";
import type { Badge, DurationKey, Post } from "@/lib/feed/types";
import { BadgeCelebration } from "./BadgeCelebration";
import { BadgeIcon } from "./BadgeIcon";
import { BadgeShelfSheet } from "./BadgeShelfSheet";
import { ChainSheet } from "./ChainSheet";
import { FeedActionsContext, type FeedActions, type PostMenuItem } from "./FeedContext";
import { PostMenuSheet } from "./PostMenuSheet";
import { ShareSheet } from "./ShareSheet";
import { GlyphSprite, Icon } from "./glyphs";
import { PollComposerSheet } from "./PollComposerSheet";

type SheetState = (
  | { t: "chain"; rootId: string }
  | { t: "poll"; parent: Post | null }
  | { t: "profile"; userId: string }
  | { t: "cel"; badge: Badge }
  | { t: "menu"; post: Post }
  | { t: "share"; post: Post }
) & { opener?: HTMLElement | null };

interface Props {
  children: ReactNode;
  /** Kök kapsayıcının data-testid değeri. */
  testId?: string;
  /** Anket yayımlanınca (liste sahibi akışı yenileyebilsin diye). */
  onPollPublished?: (parent: Post | null) => void | Promise<void>;
  /** Gönderi ayarları sayfasına eklenecek sayfaya özel öğeler (örn. Sil). */
  postMenu?: (post: Post) => PostMenuItem[];
}

/**
 * Gönderi sunumunun ortak durumu: sayfa yığını (zincir, anket, rozet rafı, kutlama), toast, beğeni/oy/yanıt eylemleri.
 * Sayfada bir kez bağlanır; üstte zaten bir FeedProvider varsa içteki ikinci bir yığın oluşturmaz.
 */
export function FeedProvider(props: Props) {
  const outer = useContext(FeedActionsContext);
  if (outer) return <>{props.children}</>;
  return <Root {...props} />;
}

function Root({ children, testId = "fd-prov", onPollPublished, postMenu }: Props) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? "guest";
  const router = useRouter();
  const username = profile?.username || profile?.displayName || "sen";
  const photo = profile?.photoURL || undefined;

  const [stack, setStack] = useState<SheetState[]>([]);
  const [baseActive, setBaseActive] = useState(false);
  const [toastState, setToastState] = useState<{ id: number; msg: string; icon?: ReactNode } | null>(null);
  const [opt, setOpt] = useState<Record<string, Post>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const baseRef = useRef<(() => void) | null>(null);

  // Güncel kullanıcı servise bildirilir (alt bileşenlerin ilk etkisinden önce çalışması için render sırasında da hazır olur).
  useEffect(() => {
    feedService.setCurrentUser({ id: uid, username, avatarUrl: photo });
  }, [uid, username, photo]);

  const toast = useCallback((msg: string, icon?: ReactNode) => {
    clearTimeout(toastTimer.current);
    setToastState({ id: Date.now(), msg, icon });
    toastTimer.current = setTimeout(() => setToastState(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const like = useCallback((post: Post) => {
    const flipped = { ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) } as Post;
    const clear = () => setOpt((o) => { const { [post.id]: _drop, ...rest } = o; void _drop; return rest; });
    setOpt((o) => ({ ...o, [post.id]: flipped }));
    feedService.toggleLike(post.id).then(clear).catch(clear);
  }, []);

  const likeOnly = useCallback((post: Post) => { if (!post.likedByMe) like(post); }, [like]);

  const save = useCallback((post: Post) => {
    const next = !post.savedByMe;
    const flipped = { ...post, savedByMe: next } as Post;
    const clear = () => setOpt((o) => { const { [post.id]: _drop, ...rest } = o; void _drop; return rest; });
    setOpt((o) => ({ ...o, [post.id]: flipped }));
    feedService.toggleSave(post.id).then(clear).catch(clear);
    toast(next ? "Kaydedildi" : "Kaydedilenlerden çıkarıldı", next ? <Icon id="i-bookmark" /> : undefined);
  }, [toast]);

  const vote = useCallback((pollId: string, optionId: string) => {
    feedService.vote(pollId, optionId).then(() => {
      const left = feedService.votesToKahin();
      toast(left > 0 ? `Oyun kaydedildi. Kahin rozetine ${left} oy kaldı!` : "Oyun kaydedildi.", <BadgeIcon id="kahin" />);
    }).catch(() => toast("Oy verilemedi."));
  }, [toast]);

  // Sayfa yığını (tek geri katmanı), rozet kutlaması kuyruğu
  const stackRef = useRef<SheetState[]>([]);
  const queueRef = useRef<Badge[]>([]);
  const setSheets = useCallback((next: SheetState[]) => { stackRef.current = next; setStack(next); }, []);
  const withQueue = useCallback((next: SheetState[]): SheetState[] => (next.length === 0 && queueRef.current.length ? [{ t: "cel", badge: queueRef.current.shift()!, opener: null }] : next), []);
  const push = useCallback((s: SheetState) => setSheets([...stackRef.current, { ...s, opener: s.opener ?? (document.activeElement as HTMLElement | null) }]), [setSheets]);
  const popTop = useCallback((): boolean => { const next = withQueue(stackRef.current.slice(0, -1)); setSheets(next); return next.length > 0; }, [setSheets, withQueue]);
  const closeAll = useCallback(() => setSheets(withQueue([])), [setSheets, withQueue]);

  const registerBase = useCallback((close: () => void) => {
    baseRef.current = close;
    setBaseActive(true);
    return () => { if (baseRef.current === close) { baseRef.current = null; setBaseActive(false); } };
  }, []);

  /** Geri/Escape: önce üstteki sayfa, sayfa yoksa tam ekran katman kapanır. true: katman açık kalır. */
  const back = useCallback((): boolean => {
    if (stackRef.current.length > 0) {
      const more = popTop();
      return more || !!baseRef.current;
    }
    if (baseRef.current) baseRef.current();
    return false;
  }, [popTop]);

  const layered = stack.length > 0 || baseActive;
  useBackLayer(layered, back);
  useEffect(() => {
    if (!layered) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); if (stackRef.current.length > 0) popTop(); else baseRef.current?.(); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [layered, popTop]);
  useEffect(() => feedService.onBadgeUnlocked((b) => {
    queueRef.current.push(b);
    if (stackRef.current.length === 0) closeAll();
  }), [closeAll]);

  // Foto/video yanıtı gerçek editörde verilir (WP-27); anket yanıtı akışta kalır.
  // Yanıta yanıt yoktur: yanıt kartındaki ok da kökü hedefler.
  const goReply = useCallback((parent: Post) => router.push(`/share?replyTo=${encodeURIComponent(parent.replyTo?.rootId ?? parent.id)}`), [router]);

  const actions = useMemo<FeedActions>(() => ({
    like,
    likeOnly,
    save,
    postMenu,
    openMenu: (post, opener) => { clearTimeout(toastTimer.current); setToastState(null); push({ t: "menu", post, opener }); },
    openShare: (post, opener) => { clearTimeout(toastTimer.current); setToastState(null); push({ t: "share", post, opener }); },
    vote,
    openChain: (rootId, opener) => push({ t: "chain", rootId, opener }),
    openReply: (parent) => goReply(parent),
    openProfile: (userId, opener) => push({ t: "profile", userId, opener }),
    openPoll: (parent, opener) => push({ t: "poll", parent, opener }),
    toast,
    resolve: (p) => opt[p.id] ?? feedService.peekPost(p.id) ?? p,
    registerBase,
  }), [like, likeOnly, save, postMenu, vote, push, toast, goReply, opt, registerBase]);

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
    await onPollPublished?.(parent);
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
    ) : top.t === "menu" ? (
      <PostMenuSheet key={`menu-${top.post.id}`} post={top.post} opener={top.opener} onClose={popTop} onDone={closeAll} />
    ) : top.t === "share" ? (
      <ShareSheet key={`share-${top.post.id}`} post={top.post} opener={top.opener} onClose={popTop} />
    ) : (
      <BadgeCelebration key={`cel-${top.badge.id}`} badge={top.badge} opener={top.opener} onClose={popTop} />
    )
  ) : null;

  return (
    <FeedActionsContext.Provider value={actions}>
      <div className="fd-root" data-testid={testId}>
        <GlyphSprite />
        {children}
        {toastState ? <div className="fd-toast" role="status" aria-live="polite" key={toastState.id}>{toastState.icon}<p>{toastState.msg}</p></div> : null}
        {sheet}
      </div>
    </FeedActionsContext.Provider>
  );
}
