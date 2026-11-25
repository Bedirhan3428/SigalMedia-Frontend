"use client";
import "./feed.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { feedService } from "@/lib/feed/feedService";
import { uploadQueue } from "@/lib/publish/uploadQueue";
import type { Post } from "@/lib/feed/types";
import { useFeedActions } from "./FeedContext";
import { FeedPost } from "./FeedPost";
import { FeedProvider } from "./FeedProvider";
import { Icon } from "./glyphs";

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

/** Ana akış: yalnızca liste ve sayfalama; gönderi sunumu ve sayfa yığını FeedProvider/FeedPost'tadır. */
export default function FeedList() {
  // Anket yayımlanınca akış yeniden çekilir (provider dışında tutulan liste durumu).
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  return (
    <FeedProvider testId="fd-feed" onPollPublished={() => refreshRef.current()}>
      <FeedListBody refreshRef={refreshRef} />
    </FeedProvider>
  );
}

function FeedListBody({ refreshRef }: { refreshRef: React.MutableRefObject<() => Promise<void>> }) {
  const { user } = useAuth();
  const uid = user?.uid ?? "guest";
  const { openChain, openPoll, toast } = useFeedActions();
  const router = useRouter();
  const pinId = useSearchParams().get("p");
  /** /?p=<id>: o gönderi akışın en üstüne sabitlenir, akış altından normal devam eder (kopya yok). */
  const [pinnedRaw, setPinned] = useState<Post | null>(null);
  const [pinDone, setPinDone] = useState<string | null>(null);
  const pinned = pinId ? pinnedRaw : null;

  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const doneRef = useRef(false);
  /** Editörden dönüş: /?highlight=<yeni yanıt kimliği> */
  const hlDone = useRef(false);
  const [hlTarget, setHlTarget] = useState<{ id: string; rootId: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

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
    doneRef.current = false;
    cursorRef.current = null;
    void loadMore(true);
    // yalnızca kullanıcı değişince yeniden yükle
  }, [uid, loadMore]);

  // Bağlantıyla gelen gönderi: Reels türüyse Reels akışına, bulunamazsa uyarıyla normal akışa.
  useEffect(() => {
    if (!pinId) return;
    let off = false;
    void feedService.getPost(pinId).then(async (p) => {
      if (off) return;
      if (!p) { setPinned(null); setPinDone(pinId); toast("Gönderi bulunamadı"); router.replace("/"); return; }
      if (p.kind === "reels") { router.replace(`/reels?id=${encodeURIComponent(p.id)}`); return; }
      // Yanıt ise zincirin kökü sabitlenir (yanıtlar akışta tek kart olmaz).
      const root = p.replyTo ? await feedService.getPost(p.replyTo.rootId) : p;
      if (off) return;
      if (!root || root.kind === "reels") { setPinned(null); setPinDone(pinId); toast("Gönderi bulunamadı"); router.replace("/"); return; }
      setPinned(root);
      setPinDone(pinId);
      window.scrollTo(0, 0);
    });
    return () => { off = true; };
    // toast/router kararlıdır; yalnızca bağlantı değişince
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinId]);

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

  /** Yeni gönderi/yanıttan sonra akışın ilk sayfasını yeniden çeker. */
  useEffect(() => {
    refreshRef.current = async () => {
      const page = await feedService.listFeed(undefined, PAGE);
      setItems(page.items);
      setCursor(page.nextCursor);
      cursorRef.current = page.nextCursor;
      doneRef.current = page.nextCursor === null;
    };
  }, [refreshRef]);

  // WP-37: arka planda yüklenen gönderi yayımlanınca akışın ilk sayfası yenilenir
  useEffect(() => uploadQueue.onPublished(() => void refreshRef.current().catch(() => {})), [refreshRef]);

  // Editörden dönüş: yeni yanıtı vurgula ya da anket yanıtı sayfasını aç.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hl = q.get("highlight");
    const pr = q.get("pollReplyTo");
    if (!hl && !pr) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (pr) {
      void feedService.getPost(pr).then((p) => { if (p) openPoll(p); });
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
      openChain(hlTarget.rootId);
      return;
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center" });
      el.classList.add("fd-hl");
      setTimeout(() => el.classList.remove("fd-hl"), 2600);
    });
  }, [hlTarget, items, loading, openChain]);

  return (
    <>
      <div role="feed" aria-label="Gönderi akışı" aria-busy={loading}>
        {pinId && pinDone !== pinId ? <Skeleton /> : null}
        {pinned ? <FeedPost key={pinned.id} post={pinned} /> : null}
        {items.filter((p) => p.id !== pinned?.id).map((post) => <FeedPost key={post.id} post={post} />)}
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
    </>
  );
}
