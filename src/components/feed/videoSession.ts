// Videoların uygulama genelindeki ortak oturum durumu: ses tercihi ve "aynı anda tek video" kuralı.
import { useSyncExternalStore } from "react";

let muted = true;
const subs = new Set<() => void>();

export function getMuted(): boolean { return muted; }
/** Kullanıcının son ses seçimi oturum boyunca hatırlanır (sayfalar arası, bellekte). */
export function setMuted(v: boolean) {
  if (v === muted) return;
  muted = v;
  subs.forEach((f) => f());
}
export function useMuted(): boolean {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, getMuted, () => true);
}

let active: { id: string; pause: () => void } | null = null;
/** Bu videoyu etkin yapar; öncekini duraklatır. */
export function claimActive(id: string, pause: () => void) {
  if (active && active.id !== id) active.pause();
  active = { id, pause };
}
export function releaseActive(id: string) {
  if (active?.id === id) active = null;
}
