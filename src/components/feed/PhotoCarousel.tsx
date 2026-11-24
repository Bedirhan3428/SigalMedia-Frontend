"use client";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PhotoItem } from "@/lib/feed/types";
import { Art } from "./Art";

/**
 * Çoklu fotoğraf kaydırıcısı: CSS scroll-snap (mandatory + stop always), bir kaydırma en çok bir fotoğraf ilerletir.
 * Noktalar, "1/7" sayacı, masaüstünde ok tuşları ve düğmeler. İlk görsel dışındakiler tembel yüklenir.
 */
export const PhotoCarousel = memo(function PhotoCarousel({ photos, alt }: { photos: PhotoItem[]; alt: string }) {
  const trk = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const raf = useRef(0);
  const n = photos.length;

  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = trk.current;
      if (el && el.clientWidth) setI(Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / el.clientWidth))));
    });
  }, [n]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const go = (to: number) => {
    const el = trk.current;
    if (!el) return;
    const t = Math.max(0, Math.min(n - 1, to));
    el.scrollTo({ left: t * el.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <div className="fd-car" data-photos={n}>
      <div
        ref={trk}
        className="fd-trk"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${alt}, ${n} fotoğraf`}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
        }}
      >
        {photos.map((p, k) => (
          <div className="fd-slide" key={k} role="group" aria-roledescription="slide" aria-label={`${k + 1} / ${n}`} data-slide={k}>
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt={`${alt} ${k + 1}`} loading={k === 0 ? "eager" : "lazy"} decoding="async" draggable={false} />
            ) : (
              <Art k={p.art ?? "sunset"} />
            )}
          </div>
        ))}
      </div>
      <span className="fd-cnt-badge" aria-hidden="true" data-testid="fd-carcount">{i + 1}/{n}</span>
      <button type="button" className="fd-cnav fd-prev" aria-label="Önceki fotoğraf" disabled={i === 0} onClick={() => go(i - 1)}>‹</button>
      <button type="button" className="fd-cnav fd-next" aria-label="Sonraki fotoğraf" disabled={i === n - 1} onClick={() => go(i + 1)}>›</button>
      <div className="fd-dots" aria-hidden="true">
        {photos.map((_, k) => <i key={k} className={k === i ? "fd-on" : ""} />)}
      </div>
    </div>
  );
});
