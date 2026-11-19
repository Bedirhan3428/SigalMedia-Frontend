"use client";

import { useMemo, useSyncExternalStore, type CSSProperties } from "react";

/** Snapshot of `window.visualViewport`, in CSS px. */
export interface VisualViewportState {
  /** Visible height (layout height minus the on-screen keyboard). */
  height: number;
  /** Visible width. */
  width: number;
  /** Distance the visual viewport is scrolled down inside the layout viewport (iOS). */
  offsetTop: number;
  /** Height covered at the bottom by the on-screen keyboard (0 when closed). */
  keyboardInset: number;
  /** True when a keyboard (or similar) covers more than ~80 px at the bottom. */
  keyboardOpen: boolean;
}

// Klavye açıkken bile küçük farkları (adres çubuğu vb.) yok say
const KEYBOARD_THRESHOLD = 80;

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

// İlkel (string) anlık görüntü: useSyncExternalStore gereksiz render yapmaz
function getSnapshot(): string {
  const vv = window.visualViewport;
  const innerH = window.innerHeight;
  const innerW = window.innerWidth;
  if (!vv) return `${innerH}|${innerW}|0|${innerH}`;
  return `${Math.round(vv.height)}|${Math.round(vv.width)}|${Math.round(vv.offsetTop)}|${innerH}`;
}

function getServerSnapshot(): string {
  return "";
}

/**
 * Tracks `window.visualViewport` (on-screen keyboard aware). Returns `null` during SSR /
 * before hydration. Listeners are removed automatically on unmount and on Activity hide.
 */
export function useVisualViewport(): VisualViewportState | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    if (!snap) return null;
    const [height, width, offsetTop, innerHeight] = snap.split("|").map(Number);
    const keyboardInset = Math.max(0, innerHeight - height - offsetTop);
    return {
      height,
      width,
      offsetTop,
      keyboardInset,
      keyboardOpen: keyboardInset > KEYBOARD_THRESHOLD || offsetTop > KEYBOARD_THRESHOLD,
    };
  }, [snap]);
}

/**
 * Inline style for a `position: fixed` full-screen layer that must stay inside the visible
 * area (above the keyboard). Without a keyboard it returns `undefined`, so the caller's
 * `inset-0` / `h-[100dvh]` classes apply unchanged.
 */
export function useVisualViewportFrameStyle(): CSSProperties | undefined {
  const vv = useVisualViewport();
  return useMemo(() => {
    if (!vv || !vv.keyboardOpen) return undefined;
    return {
      top: vv.offsetTop,
      bottom: "auto",
      height: vv.height,
    };
  }, [vv]);
}
