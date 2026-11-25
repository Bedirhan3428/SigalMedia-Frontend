"use client";

import { useEffect } from "react";
import { CHAT_VIEWING_HEARTBEAT_MS } from "@/lib/chat/peerViewing";
import { setChatViewing } from "@/services/messageService";

type TestWin = Window & { __SIGAL_TEST_VIEWING__?: (viewing: boolean) => void };

function postToSw(msg: Record<string, unknown>) {
  try {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    // controller is null on a hard reload / before clients.claim(); the registration's active worker always works.
    if (sw.controller) sw.controller.postMessage(msg);
    else void sw.getRegistration("/").then((r) => r?.active?.postMessage(msg)).catch(() => {});
  } catch {
    /* best effort */
  }
}

/**
 * While this chat page is open AND visible: heartbeat to (a) RTDB chatPresence (so the peer hides "Görüldü"),
 * (b) the service worker (so it skips the push for this chat). Cleared on hide / pagehide / unmount.
 * TODO(Supabase cutover): replace (a) with a Realtime presence/broadcast channel, see docs/SUPABASE_PLAN.md §5.
 */
export function useChatViewing(chatId: string | undefined, uid: string | undefined) {
  useEffect(() => {
    if (!chatId) return;
    let on = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const emit = (v: boolean) => {
      const hook = (window as TestWin).__SIGAL_TEST_VIEWING__;
      if (hook) hook(v);
      else if (uid) void setChatViewing(chatId, uid, v);
    };
    const beat = () => {
      emit(true);
      postToSw({ type: "viewing", chatId, visible: true });
    };
    const start = () => {
      if (on || document.visibilityState === "hidden") return;
      on = true;
      beat();
      timer = setInterval(beat, CHAT_VIEWING_HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (!on) return;
      on = false;
      emit(false);
      postToSw({ type: "viewing", chatId, visible: false });
    };
    const onVis = () => (document.visibilityState === "hidden" ? stop() : start());
    // Pick up a freshly deployed sw.js without waiting for the browser's own (cache-limited) update check.
    try {
      void navigator.serviceWorker?.getRegistration("/").then((r) => r?.update()).catch(() => {});
    } catch {
      /* ignore */
    }
    start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", start);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", start);
      stop();
    };
  }, [chatId, uid]);
}
