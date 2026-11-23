"use client";

import { useEffect } from "react";

/**
 * Pins a full-screen chat to the visual viewport while the on-screen keyboard is open.
 *
 * Mobile browsers (Android Chrome's default "resizes-visual" mode, iOS Safari) don't shrink the layout
 * viewport for the keyboard. They pan the page instead, which hides the chat header, and the composer can be
 * dragged down under the keyboard. Here the root follows the visual viewport (height + offset), the document
 * itself can't scroll, and touch drags only scroll elements that are actually scrollable (the message list,
 * a multi-line textarea, open sheets).
 *
 * The root element must be `position: fixed; top: 0; left: 0; right: 0`.
 */
export function useKeyboardViewport(root: HTMLElement | null) {
  useEffect(() => {
    if (!root || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    let raf = 0;
    const apply = () => {
      raf = 0;
      if (!vv) return;
      root.style.setProperty("height", `${Math.round(vv.height)}px`);
      const top = Math.max(0, Math.round(vv.offsetTop));
      root.style.setProperty("transform", top ? `translate3d(0, ${top}px, 0)` : "");
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);

    const canScroll = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      const scrollY = s.overflowY === "auto" || s.overflowY === "scroll";
      const scrollX = s.overflowX === "auto" || s.overflowX === "scroll";
      return (
        (scrollY && el.scrollHeight > el.clientHeight + 1) ||
        (scrollX && el.scrollWidth > el.clientWidth + 1)
      );
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1 || !e.cancelable) return;
      for (let n = e.target as Node | null; n && n !== root; n = n.parentNode) {
        if (n instanceof HTMLElement && canScroll(n)) return;
      }
      e.preventDefault();
    };
    root.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      root.removeEventListener("touchmove", onTouchMove);
      root.style.removeProperty("height");
      root.style.removeProperty("transform");
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [root]);
}
