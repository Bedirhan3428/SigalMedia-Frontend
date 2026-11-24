"use client";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { Post } from "@/lib/feed/types";
import { useFeedActions } from "./FeedContext";

/**
 * Çift dokunma ile beğeni: 300 ms içinde, az hareketle iki dokunuş; dokunma noktasında gradyanlı kalp çıkar.
 * Kaydırma pointercancel/büyük hareket olduğundan sayılmaz. Düğmeler hariçtir (allowButton ile eşleşenler dahil).
 */
export function useDoubleTapLike(post: Post, opts: { allowButton?: string; onDouble?: () => void } = {}) {
  const { likeOnly } = useFeedActions();
  const [heart, setHeart] = useState<{ n: number; x: number; y: number; r: number } | null>(null);
  const tapRef = useRef<{ t: number; x: number; y: number; at: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const postRef = useRef(post);
  const optsRef = useRef(opts);
  useEffect(() => { postRef.current = post; optsRef.current = opts; });
  useEffect(() => {
    if (!heart) return;
    const t = setTimeout(() => setHeart(null), 1500);
    return () => clearTimeout(t);
  }, [heart]);

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (btn && !(optsRef.current.allowButton && btn.matches(optsRef.current.allowButton))) { tapRef.current = null; return; }
    tapRef.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, at: Date.now() };
  };
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const d = tapRef.current;
    if (d && (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10)) tapRef.current = null;
  };
  const onPointerUp = (e: RPointerEvent<HTMLElement>) => {
    const d = tapRef.current;
    tapRef.current = null;
    if (!d || e.timeStamp - d.t > 350) { lastTap.current = null; return; }
    const prev = lastTap.current;
    if (prev && d.at - prev.t <= 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
      lastTap.current = null;
      likeOnly(postRef.current);
      optsRef.current.onDouble?.();
      const box = e.currentTarget.getBoundingClientRect();
      setHeart((h) => ({ n: (h?.n ?? 0) + 1, x: e.clientX - box.left, y: e.clientY - box.top, r: Math.round(Math.random() * 24 - 12) }));
    } else lastTap.current = { t: d.at, x: e.clientX, y: e.clientY };
  };

  const heartNode: ReactNode = heart ? (
    <svg key={heart.n} className="fd-bigheart" data-testid="fd-bigheart" viewBox="0 0 24 24" aria-hidden="true" style={{ left: heart.x, top: heart.y, ["--r" as string]: `${heart.r}deg` }}>
      <defs><linearGradient id={`fd-hg-${post.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7eb3" /><stop offset=".5" stopColor="#ff3d6e" /><stop offset="1" stopColor="#ff9a3d" /></linearGradient></defs>
      <path d="M12 20.6l-1.3-1.2C6.1 15.2 3.2 12.6 3.2 9.4 3.2 6.8 5.2 4.8 7.8 4.8c1.6 0 3.2.8 4.2 2 1-1.2 2.6-2 4.2-2 2.6 0 4.6 2 4.6 4.6 0 3.2-2.9 5.8-7.5 10z" fill={`url(#fd-hg-${post.id})`} />
    </svg>
  ) : null;

  return { bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => { tapRef.current = null; } }, heartNode };
}
