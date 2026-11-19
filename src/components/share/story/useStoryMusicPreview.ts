"use client";

import { useEffect, useRef } from "react";
import type { CanvasEngine, StoryAudioMeta } from "@/lib/canvas-editor";

/**
 * Hikaye müzik önizlemesi (B12).
 * - Fotoğraf: seçilen kesit (startTime..startTime+duration) sürekli döngüde çalar.
 * - Video: motorun zamanına senkron; kesit videodan kısaysa döner.
 * - suspended / sayfa gizli / video duraklatıldığında susar. Temizlikte audio elemanı bırakılır.
 */
export function useStoryMusicPreview(
  engine: CanvasEngine,
  music: StoryAudioMeta | null,
  volume: number,
  suspended: boolean
) {
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const url = music?.streamUrl;
  const start = music?.startTime ?? 0;
  const dur = music?.duration ?? 30;

  useEffect(() => {
    if (!url) return;
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.src = url;
    const segStart = Math.max(0, start);
    const segLen = Math.max(1, dur);

    const tick = () => {
      const visible = document.visibilityState === "visible";
      const vs = engine.getVideoState();
      const shouldPlay = !suspended && visible && (!vs.isVideo || engine.isPlaying());
      audio.volume = Math.max(0, Math.min(1, volumeRef.current));
      if (!shouldPlay) {
        if (!audio.paused) audio.pause();
        return;
      }
      let target: number | null = null;
      if (vs.isVideo) {
        const rel = Math.max(0, engine.getCurrentTime() - (vs.trimStart || 0));
        target = segStart + (rel % segLen);
        if (Math.abs(audio.currentTime - target) > 0.45) {
          try {
            audio.currentTime = target;
          } catch {}
        }
      } else if (audio.currentTime < segStart - 0.3 || audio.currentTime >= segStart + segLen - 0.05) {
        try {
          audio.currentTime = segStart;
        } catch {}
      }
      if (audio.paused) audio.play().catch(() => {});
    };

    const onVisibility = () => {
      if (document.hidden && !audio.paused) audio.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(tick, 150);
    tick();

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [engine, url, start, dur, suspended]);
}
