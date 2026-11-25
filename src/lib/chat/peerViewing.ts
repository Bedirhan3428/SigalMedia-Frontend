/** Peer "is inside this chat" signal: RTDB chatPresence/{chatId}/{uid} = heartbeat timestamp (ms). */
export const CHAT_VIEWING_HEARTBEAT_MS = 15000;
/** A numeric heartbeat that has not changed for this long (measured on the receiver's clock) counts as gone. */
export const CHAT_VIEWING_STALE_MS = 45000;

/**
 * Turns raw node values into a boolean "peer is viewing" with stale protection.
 * feed(number) -> true, goes false by itself when no new value arrives within staleMs; feed(null/false) -> false.
 */
export function createViewingTracker(cb: (viewing: boolean) => void, staleMs: number = CHAT_VIEWING_STALE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    feed(val: unknown) {
      clear();
      const on = Boolean(val);
      cb(on);
      if (on && typeof val === "number") timer = setTimeout(() => cb(false), staleMs);
    },
    dispose: clear,
  };
}
