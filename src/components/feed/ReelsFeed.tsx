"use client";
import "./feed.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { feedService } from "@/lib/feed/feedService";
import type { Post } from "@/lib/feed/types";
import { ReelCard } from "./ReelCard";

const PAGE = 4;
const isReel = (p: Post | undefined): p is Post => !!p && p.type === "video" && !!p.mediaUrl && !p.replyTo;

/** Dikey Reels akışı: CSS scroll-snap (kaydırma başına tek reel), sonsuz yükleme, yalnızca görünen video oynar. */
export function ReelsFeed() {
  const { user } = useAuth();
  const uid = user?.uid ?? "guest";
  const router = useRouter();
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [gen, setGen] = useState(0);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async (first: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const page = await feedService.listReels(first ? undefined : cursorRef.current ?? undefined, PAGE);
      // Derin bağlantı: /reels?id=<gönderi> bu reelden başlar.
      const id = first ? new URLSearchParams(window.location.search).get("id") : null;
      const target = id ? await feedService.getPost(id).catch(() => undefined) : undefined;
      // Reels olmayan bir bağlantı (fotoğraf/anket/yanıt) ana akışta açılır; bulunamazsa ana akış uyarır.
      if (id && !isReel(target)) { router.replace(`/?p=${encodeURIComponent(id)}`); return; }
      setItems((prev) => {
        const base = first ? (isReel(target) ? [target] : []) : prev;
        const seen = new Set(base.map((p) => p.id));
        return [...base, ...page.items.filter((p) => !seen.has(p.id))];
      });
      if (first) { setCurrent(0); setGen((g) => g + 1); }
      setCursor(page.nextCursor);
      cursorRef.current = page.nextCursor;
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [router]);

  // Rota önbellekte (gizli) tutulup yeniden gösterilince ya da liste baştan yüklenince scroll-snap önceki öğeye yeniden yaslanabilir; her ilk yüklemede en üstten başla.
  useLayoutEffect(() => { if (box.current) box.current.scrollTop = 0; }, [gen]);

  useEffect(() => {
    cursorRef.current = null;
    void load(true);
  }, [uid, load]);

  // Görünen reel: %60'tan fazla görünen öğe "geçerli"dir.
  useEffect(() => {
    const root = box.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) setCurrent(Number((e.target as HTMLElement).dataset.index));
    }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-reel]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  // Sona yaklaşınca sonraki sayfa. Kaydırma/yaslanma bitince yüklenir: akış ortasında DOM eklemek scroll-snap'i bozabilir.
  useEffect(() => {
    if (!cursor || items.length === 0 || current < items.length - 2) return;
    const t = setTimeout(() => { if (!loadingRef.current) void load(false); }, 450);
    return () => clearTimeout(t);
  }, [current, items.length, cursor, load]);

  const empty = !loading && !error && items.length === 0;
  return (
    <div className="fd-reels" ref={box} data-testid="fd-reels" role="feed" aria-label="Reels akışı" aria-busy={loading}>
      {items.map((p, i) => (
        <ReelCard key={p.id} post={p} index={i} parked={Math.abs(i - current) > 1} next={i === current + 1} />
      ))}
      {loading && items.length === 0 ? (
        <div className="fd-rempty" data-testid="fd-reels-loading"><span className="fd-vspin fd-vspin-s" role="status" aria-label="Yükleniyor" /></div>
      ) : null}
      {empty ? (
        <div className="fd-rempty" data-testid="fd-reels-empty">
          <h2>Henüz Reels yok</h2>
          <p>Paylaşılan videolar burada görünecek.</p>
        </div>
      ) : null}
      {error ? (
        <div className="fd-rempty" data-testid="fd-reels-error">
          <p>Reels yüklenemedi.</p>
          <button type="button" className="fd-ghost" style={{ padding: "0 14px" }} onClick={() => void load(items.length === 0)}>Tekrar dene</button>
        </div>
      ) : null}
    </div>
  );
}
