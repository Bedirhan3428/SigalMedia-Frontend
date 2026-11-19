"use client";

import { useEffect, useState } from "react";

/** Result of {@link usePresence}. */
export interface PresenceState {
  /** Render the element (true while open and during the exit animation). */
  rendered: boolean;
  /** True only while the exit animation runs (`open` is false but still rendered). */
  closing: boolean;
}

/**
 * Keeps an overlay mounted for `exitMs` after `open` turns false so an exit animation can play.
 * Re-opening during the exit cancels it. The timer is cleared on unmount / Activity hide.
 */
export function usePresence(open: boolean, exitMs = 200): PresenceState {
  const [rendered, setRendered] = useState(open);

  // Açılışta render sırasında senkron güncelle (effect beklemeden, titreme olmadan)
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (open || !rendered) return;
    const t = setTimeout(() => setRendered(false), exitMs);
    return () => clearTimeout(t);
  }, [open, rendered, exitMs]);

  return { rendered: open || rendered, closing: !open && rendered };
}
