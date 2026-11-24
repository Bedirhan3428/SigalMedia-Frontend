"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./glyphs";

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]';

interface Props {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Üst sınıflar (örn. kutlama sayfası). */
  className?: string;
  height?: string;
  hideHeader?: boolean;
  /** İlk odak için [data-first] öğesi yoksa kapat düğmesini atla. */
  opener?: HTMLElement | null;
}

/**
 * Alt sayfa kabuğu: role=dialog, odak içeri alınır ve tuzaklanır, kapanınca açan öğeye döner.
 * Escape ve Geri hareketi FeedList içindeki tek useBackLayer ile yönetilir.
 */
export function Sheet({ titleId, title, onClose, children, className = "", height, hideHeader, opener }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(opener ?? (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));

  useEffect(() => {
    const el = ref.current;
    const prev = openerRef.current;
    const t = setTimeout(() => {
      if (!el) return;
      const first = el.querySelector<HTMLElement>("[data-first]") ?? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].find((x) => !x.hasAttribute("data-close")) ?? el.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      if (prev && document.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch { /* yok */ }
      }
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  };

  return (
    <div className="fd-layer">
      <div className="fd-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`fd-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={height ? { height } : undefined} onKeyDown={onKey}>
        <div className="fd-grab" />
        {hideHeader ? null : (
          <div className="fd-sh">
            <h3 id={titleId}>{title}</h3>
            <button type="button" className="fd-ib" data-close aria-label="Kapat" onClick={onClose}><Icon id="i-x" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
