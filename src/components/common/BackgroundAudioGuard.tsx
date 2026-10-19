"use client";

import { useEffect } from "react";

// [START] CREATED BY Bedirhan
/**
 * BackgroundAudioGuard
 * 1) 'visibilitychange' ve 'pagehide' olaylarında document.hidden olduğunda çalan tüm audio/video elementlerini derhal pause eder.
 * 2) navigator.mediaSession.playbackState = 'none' yaparak Android bildirim panelinde ve kilit ekranında medya çaların belirmesini kesin olarak engeller.
 */
export default function BackgroundAudioGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Aktif çalan tüm medya (Audio / Video) örneklerini hem DOM içi hem new Audio() düzeyinde izle
    const activeMediaElements = new Set<HTMLMediaElement>();

    // 1. HTMLMediaElement.prototype.play kancası ile bellek içi (new Audio) dahil tüm ses kaynaklarını yakala
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      activeMediaElements.add(this);

      // Android bildirim panelinde ve kilit ekranında medya çaların görünmesini engelle
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "none";
          navigator.mediaSession.metadata = null;
        } catch {}
      }

      const onEndOrPause = () => {
        activeMediaElements.delete(this);
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.playbackState = "none";
          } catch {}
        }
      };

      this.addEventListener("pause", onEndOrPause, { once: true });
      this.addEventListener("ended", onEndOrPause, { once: true });

      return originalPlay.apply(this, args);
    };

    // 2. 'visibilitychange' olayında document.hidden kontrolü
    const enforceNoBackgroundAudio = () => {
      if (document.hidden) {
        // Bellekteki tüm aktif çalarlar
        activeMediaElements.forEach((media) => {
          try {
            if (!media.paused) {
              media.pause();
            }
          } catch {}
        });
        activeMediaElements.clear();

        // DOM üzerindeki tüm audio ve video etiketleri
        const domMedia = document.querySelectorAll<HTMLMediaElement>("audio, video");
        domMedia.forEach((media) => {
          try {
            if (!media.paused) {
              media.pause();
            }
          } catch {}
        });

        // navigator.mediaSession.playbackState = 'none' yaparak Android bildirim paneli
        // ve kilit ekranında medya çaların görünmesini engelle
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.playbackState = "none";
            navigator.mediaSession.metadata = null;
            const actions: MediaSessionAction[] = [
              "play",
              "pause",
              "stop",
              "previoustrack",
              "nexttrack",
              "seekbackward",
              "seekforward",
              "seekto",
            ];
            actions.forEach((act) => {
              try {
                navigator.mediaSession.setActionHandler(act, null);
              } catch {}
            });
          } catch {}
        }
      }
    };

    document.addEventListener("visibilitychange", enforceNoBackgroundAudio);
    window.addEventListener("pagehide", enforceNoBackgroundAudio);

    // Başlangıçta da Android mediaSession'ı sessiz tut
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      } catch {}
    }

    return () => {
      document.removeEventListener("visibilitychange", enforceNoBackgroundAudio);
      window.removeEventListener("pagehide", enforceNoBackgroundAudio);
      HTMLMediaElement.prototype.play = originalPlay;
      activeMediaElements.clear();
    };
  }, []);

  return null;
}
// [END] CREATED BY Bedirhan
