"use client";

import { useLayoutEffect } from "react";

// Referans sayımlı kilit: iç içe açılan sheet/modal'lar tek bir kilidi paylaşır.
let lockCount = 0;
let saved: {
  htmlOverflow: string;
  bodyOverflow: string;
  htmlOverscroll: string;
  bodyOverscroll: string;
} | null = null;

function lock() {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount > 1) return;
  const html = document.documentElement;
  const body = document.body;
  saved = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyOverscroll: body.style.overscrollBehavior,
  };
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  body.style.overscrollBehavior = "none";
}

function unlock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0 || !saved) return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = saved.htmlOverflow;
  body.style.overflow = saved.bodyOverflow;
  html.style.overscrollBehavior = saved.htmlOverscroll;
  body.style.overscrollBehavior = saved.bodyOverscroll;
  saved = null;
}

/**
 * Locks page scroll (html + body `overflow: hidden`, `overscroll-behavior: none`) while `active`.
 *
 * - Reference counted: several overlays may lock at once; the original inline styles are
 *   restored only when the last one releases.
 * - Uses a `useLayoutEffect` cleanup, so the lock is released synchronously on unmount **and**
 *   when the route is hidden by React `<Activity>` (cacheComponents), and re-acquired when shown.
 */
export function useBodyScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
