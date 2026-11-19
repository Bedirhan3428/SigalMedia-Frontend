"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Options for {@link useEditorSession}. */
export interface EditorSessionOptions {
  /**
   * Runs once each time the editor route is hidden by `<Activity>` (user navigated away) or
   * unmounted. Use it to stop media, abort exports, revoke URLs and destroy the engine.
   * It runs right after the hiding commit (same task, before paint), never during the React
   * StrictMode dev double-invoke.
   */
  onHide?: () => void;
}

/** Result of {@link useEditorSession}. */
export interface EditorSession {
  /**
   * Changes every time the route is hidden, so it differs whenever `/share` becomes visible again.
   * Use it as `key` of the editor subtree: `<EditorShell key={sessionKey} />`. The keyed subtree
   * remounts while still hidden, so the user never sees stale state when coming back.
   */
  sessionKey: number;
  /**
   * Starts a fresh session immediately (e.g. after a successful publish, before navigating, or
   * to change mode after media was loaded). Call it, then navigate.
   */
  newSession: () => void;
}

/**
 * Session lifecycle for the `/share` editor under `cacheComponents` (routes are hidden with
 * `<Activity>`, not unmounted). Call it in the page component that **wraps** the editor and key
 * the editor with `sessionKey`; state that lives in the calling component itself is not reset.
 *
 * Implementation: a `useLayoutEffect` cleanup marks the session hidden; a microtask then confirms
 * the route is still hidden (StrictMode re-mounts synchronously, Activity does not), runs
 * `onHide` and bumps `sessionKey`.
 */
export function useEditorSession(options: EditorSessionOptions = {}): EditorSession {
  const [sessionKey, setSessionKey] = useState(0);
  const onHideRef = useRef(options.onHide);
  const hiddenRef = useRef(false);

  useLayoutEffect(() => {
    onHideRef.current = options.onHide;
  });

  useLayoutEffect(() => {
    hiddenRef.current = false;
    return () => {
      hiddenRef.current = true;
      queueMicrotask(() => {
        if (!hiddenRef.current) return; // StrictMode: hemen yeniden bağlandı
        try {
          onHideRef.current?.();
        } catch (err) {
          console.error("[useEditorSession] onHide", err);
        }
        setSessionKey((k) => k + 1);
      });
    };
  }, []);

  const newSession = useCallback(() => setSessionKey((k) => k + 1), []);

  return { sessionKey, newSession };
}
