"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { feedService } from "@/lib/feed/feedService";

export function useReducedMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setRm(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return rm;
}

/** Servis her değiştiğinde (rozet açılması, kullanıcı bilgisi) yeniden render eder. */
export function useFeedVersion(): number {
  return useSyncExternalStore(
    (cb) => feedService.subscribe(cb),
    () => feedService.getVersion(),
    () => 0,
  );
}
