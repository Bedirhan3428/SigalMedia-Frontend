"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Search,
  Music,
  Play,
  Pause,
  Loader2,
  Check,
  ChevronDown,
  Heart,
} from "lucide-react";
import {
  SoundTrack,
  searchTracks,
  formatSeconds,
  PREVIEW_SEC,
} from "@/services/soundService";
import { ShareMode, StoryAudioMeta } from "@/lib/canvas-editor";
import { EditorPortal } from "./common/EditorPortal";
import { useBackLayer } from "./common/hooks/useEditorBackStack";
import { useBodyScrollLock } from "./common/hooks/useBodyScrollLock";

interface MusicPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMusic: (meta: StoryAudioMeta) => void;
  currentMusic?: StoryAudioMeta | null;
  mode?: ShareMode;
  // Reels: timeline toplam süresi (sn)
  clipDuration?: number;
}

type PickerTab = "discover" | "recent" | "saved";

// Hikaye ses süresi: Sabit 30 saniye; Reels'te timeline süresi (5-60 sn)
const STORY_DURATION = 30;
const REELS_MIN_DURATION = 5;
const REELS_MAX_DURATION = 60;
// Görünür pencere: aktif pencerenin her iki yanında %25 soluk alan
const EDGE_RATIO = 0.25;
// Listede şarkıya dokununca çalan kısa önizleme süresi
const LIST_PREVIEW_SEC = 15;
// v2: iTunes kimlikleri (eski YouTube kimlikli kayıtlar okunmaz)
const RECENT_KEY = "sigal_music_recent_v2";
const SAVED_KEY = "sigal_music_saved_v2";
// Eski kayıtlarda iTunes önizleme adresi olmayanları ele
function isPlayableTrack(t: unknown): t is SoundTrack {
  return Boolean(t && typeof (t as SoundTrack).streamUrl === "string" && (t as SoundTrack).id);
}
const MAX_STORED_TRACKS = 30;

function readStoredTracks(key: string): SoundTrack[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isPlayableTrack) : [];
  } catch {
    return [];
  }
}

function writeStoredTracks(key: string, list: SoundTrack[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_STORED_TRACKS)));
  } catch {}
}
// Saniye başına çizgi yoğunluğu
const BARS_PER_SEC = 1.5;
const BAR_WIDTH_PX = 2.5;

/**
 * Şarkı kimliğine (ID) göre deterministik ve estetik ses dalgası çubukları üretir
 */
function generateWaveformBars(seed: string, count: number = 48): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.sin(hash + i * 0.55) * 10000;
    const rnd = x - Math.floor(x);
    const envelope = Math.sin((i / count) * Math.PI) * 0.35 + 0.65;
    const height = Math.round((22 + rnd * 70) * envelope);
    bars.push(Math.max(20, Math.min(96, height)));
  }
  return bars;
}

export default function MusicPickerDrawer({
  isOpen,
  onClose,
  onSelectMusic,
  currentMusic,
  mode = "story",
  clipDuration,
}: MusicPickerDrawerProps) {
  const windowSec =
    mode === "reels"
      ? Math.round(
          Math.max(REELS_MIN_DURATION, Math.min(REELS_MAX_DURATION, clipDuration || STORY_DURATION))
        )
      : STORY_DURATION;
  const edgeSec = windowSec * EDGE_RATIO;
  const viewWindowSec = windowSec + edgeSec * 2;
  const windowSecRef = useRef(windowSec);
  windowSecRef.current = windowSec;
  const confirmLabel = mode === "reels" ? "Reels'e Ekle" : "Hikayeye Ekle";

  const [activeTab, setActiveTab] = useState<PickerTab>("discover");
  const [recentTracks, setRecentTracks] = useState<SoundTrack[]>([]);
  const [savedTracks, setSavedTracks] = useState<SoundTrack[]>([]);

  // Liste önizlemesi (kırpıcıdan bağımsız kısa dinleme)
  const listPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const listPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const stopListPreview = useCallback(() => {
    if (listPreviewTimerRef.current) {
      clearTimeout(listPreviewTimerRef.current);
      listPreviewTimerRef.current = null;
    }
    if (listPreviewAudioRef.current && !listPreviewAudioRef.current.paused) {
      listPreviewAudioRef.current.pause();
    }
    setPreviewTrackId(null);
    setIsPreviewLoading(false);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [tracks, setTracks] = useState<SoundTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SoundTrack | null>(null);

  // Saniye ve Tampon (Buffered) Durumları
  const [selectedStartSec, setSelectedStartSec] = useState<number>(0);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioErrorTrackId, setAudioErrorTrackId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bufferedEndRef = useRef<number>(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; startSec: number; lastSec: number } | null>(null);
  const wheelSecRef = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef(0);
  const ppsRef = useRef(0);
  const lastTimeUpdateRef = useRef<number>(0);
  const emaDeltaRef = useRef<number>(0.22); // Senaryo 3: Lookahead EMA gecikme tamponu (varsayılan 0.22s)
  startRef.current = selectedStartSec;
  ppsRef.current = viewportWidth > 0 ? viewportWidth / viewWindowSec : 0;

  /**
   * HTML5 audio.buffered aralıklarını izleyerek en son inmiş saniyeyi (bufferedEnd) günceller
   */
  const syncBufferedEnd = useCallback((): number => {
    const audio = audioRef.current;
    if (!audio || !audio.buffered || audio.buffered.length === 0) {
      return bufferedEndRef.current;
    }
    let maxEnd = 0;
    for (let i = 0; i < audio.buffered.length; i++) {
      try {
        const end = audio.buffered.end(i);
        if (end > maxEnd) maxEnd = end;
      } catch {}
    }
    if (Math.abs(maxEnd - bufferedEndRef.current) > 0.01) {
      bufferedEndRef.current = maxEnd;
      setBufferedEnd(maxEnd);
    }
    return maxEnd;
  }, []);

  // Dalga formu görünür alan genişliğini izle
  useEffect(() => {
    if (!viewportEl) return;
    setViewportWidth(viewportEl.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setViewportWidth(entries[0].contentRect.width);
    });
    ro.observe(viewportEl);
    return () => ro.disconnect();
  }, [viewportEl]);

  // Şarkının tüm süresini kapsayan dalga formu (saniye başına sabit yoğunluk)
  const waveformBars = useMemo(() => {
    const dur = selectedTrack?.duration || PREVIEW_SEC;
    return generateWaveformBars(
      selectedTrack?.id || "sigal",
      Math.max(1, Math.ceil(dur * BARS_PER_SEC))
    );
  }, [selectedTrack?.id, selectedTrack?.duration]);

  // 1. Çekmece açıldığında şarkıları getir
  useEffect(() => {
    if (!isOpen) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      stopListPreview();
      setIsPlaying(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    setRecentTracks(readStoredTracks(RECENT_KEY));
    setSavedTracks(readStoredTracks(SAVED_KEY));
    // Değiştir akışında önceki seçim taşınmaz
    if (!currentMusic) setSelectedTrack(null);

    searchTracks(searchQuery, 20).then((res) => {
      if (!isMounted) return;
      setTracks(res);
      setIsSearching(false);

      if (currentMusic) {
        const found = res.find((t) => t.id === currentMusic.id);
        if (found) {
          setSelectedTrack(found);
          setSelectedStartSec(currentMusic.startTime || 0);
        } else {
          setSelectedTrack({
            id: currentMusic.id,
            title: currentMusic.title,
            artist: currentMusic.artist,
            duration: currentMusic.totalDuration || PREVIEW_SEC,
            durationFormatted: formatSeconds(currentMusic.totalDuration || PREVIEW_SEC),
            thumbnail: currentMusic.thumbnail,
            streamUrl: currentMusic.streamUrl,
          });
          setSelectedStartSec(currentMusic.startTime || 0);
        }
      }
    });

    return () => {
      isMounted = false;
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (searchAbortControllerRef.current) searchAbortControllerRef.current.abort();
    };
  }, [isOpen]);

  // Arka plana geçildiğinde (document.hidden) çalan önizleme müziğini derhal durdur ve Android medya çaları gizle
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && listPreviewAudioRef.current && !listPreviewAudioRef.current.paused) {
        listPreviewAudioRef.current.pause();
        setPreviewTrackId(null);
      }
      if (document.hidden && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.playbackState = "none";
            navigator.mediaSession.metadata = null;
          } catch {}
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleVisibilityChange);
    };
  }, []);

  // 2. Arama Sorgusu (400ms İdeal Eşik + Karakter Kotası + AbortController)
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    // Önceki uçuşta olan HTTP isteğini tarayıcı seviyesinde hemen sonlandır
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }

    const trimmed = val.trim();

    // Karakter Kotası: 1 harfli aramalar iTunes rate limitini boşa harcamaması için tetiklenmez
    if (trimmed.length === 1) {
      setIsSearching(false);
      return;
    }

    // 250ms İdeal Eşik: Kullanıcı yazmayı bitirdiğinde gecikme hissettirmeden tetiklenir
    searchTimeoutRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      searchAbortControllerRef.current = abortController;
      setIsSearching(true);

      const results = await searchTracks(trimmed, 20, abortController.signal);

      // Sadece istek iptal edilmediyse sonuçları ekrana bas (eski yanıtlar yenilerin üstüne yazılamaz)
      if (!abortController.signal.aborted) {
        setTracks(results);
        setIsSearching(false);
      }
    }, 250);
  };

  // 2b. Liste Önizlemesi: satıra dokununca önizlemenin başından 15 sn çalar
  const toggleListPreview = (track: SoundTrack) => {
    if (previewTrackId === track.id) {
      stopListPreview();
      return;
    }
    stopListPreview();
    // Kırpıcı çalıyorsa iki ses üst üste binmesin
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    if (!listPreviewAudioRef.current) {
      listPreviewAudioRef.current = new Audio();
      listPreviewAudioRef.current.preload = "auto";
    }
    const audio = listPreviewAudioRef.current;
    audio.src = track.streamUrl;
    setPreviewTrackId(track.id);
    setIsPreviewLoading(true);

    audio
      .play()
      .then(() => {
        setIsPreviewLoading(false);
        listPreviewTimerRef.current = setTimeout(stopListPreview, LIST_PREVIEW_SEC * 1000);
      })
      .catch(() => {
        setIsPreviewLoading(false);
        setPreviewTrackId(null);
      });
  };

  useEffect(() => stopListPreview, [stopListPreview]);

  // Geri hareketi çekmeceyi kapatır; kaydırma kilidi kapanınca serbest kalır
  useBackLayer(isOpen, onClose);
  useBodyScrollLock(isOpen);

  // Kapanışta / unmount'ta sesleri durdur ve kaynağı bırak
  useEffect(() => {
    if (!isOpen) return;
    const audioEl = audioRef.current;
    return () => {
      stopListPreview();
      const listAudio = listPreviewAudioRef.current;
      if (listAudio) {
        listAudio.pause();
        listAudio.removeAttribute("src");
        listAudio.load();
      }
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute("src");
        audioEl.load();
      }
    };
  }, [isOpen, stopListPreview]);

  const savedIds = useMemo(() => new Set(savedTracks.map((t) => t.id)), [savedTracks]);

  const toggleSavedTrack = (track: SoundTrack) => {
    const next = savedIds.has(track.id)
      ? savedTracks.filter((t) => t.id !== track.id)
      : [track, ...savedTracks];
    setSavedTracks(next);
    writeStoredTracks(SAVED_KEY, next);
  };

  // 3. Şarkı Seçimi & Ses Yükleme
  const handleSelectTrack = useCallback((track: SoundTrack) => {
    stopListPreview();
    setSelectedTrack(track);
    setAudioErrorTrackId(null);
    setIsAudioLoading(true);
    bufferedEndRef.current = 0;
    setBufferedEnd(0);

    const defaultStart = 0;
    setSelectedStartSec(defaultStart);
    setCurrentPlayTime(defaultStart);
    pendingSeekRef.current = defaultStart;

    if (audioRef.current) {
      const audio = audioRef.current;
      audio.pause();
      // play() dokunma olayı içinde kalmalı (iOS); ağ beklenmez
      if (audio.src !== track.streamUrl) {
        audio.src = track.streamUrl;
      }
      try {
        audio.currentTime = defaultStart;
      } catch {}
      audio.play().catch(() => {});
    }
  }, [stopListPreview]);

  // 4. Oynat / Duraklat Toggle
  const togglePlayPause = () => {
    if (!audioRef.current || !selectedTrack) return;
    const audio = audioRef.current;
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      stopListPreview();
      setIsAudioLoading(true);
      setAudioErrorTrackId(null);
      const cur = audio.currentTime;
      if (cur < selectedStartSec || cur >= selectedStartSec + windowSec) {
        try {
          audio.currentTime = selectedStartSec;
          setCurrentPlayTime(selectedStartSec);
        } catch {}
      }
      audio.play().catch(() => {
        setIsAudioLoading(false);
      });
    }
  };

  // 5. Dinamik Sınır Kenetlemesi
  const calculateDeltaSafe = (effDur: number) => {
    return 0.45 + 0.0065 * effDur;
  };

  const getMaxStart = () => {
    const audioDur = audioRef.current?.duration;
    const effDur =
      audioDur && !isNaN(audioDur) && isFinite(audioDur) && audioDur > 0
        ? audioDur
        : (selectedTrack?.duration || 0);
    const deltaSafe = calculateDeltaSafe(effDur);
    return Math.max(0, effDur - windowSec - deltaSafe);
  };

  const clampStart = (sec: number) => {
    const maxVal = getMaxStart();
    const clamped = Math.min(maxVal, Math.max(0, sec));
    return Math.round(clamped * 1000) / 1000;
  };

  const getPxPerSec = () =>
    viewportWidth > 0 ? viewportWidth / viewWindowSec : 0;

  const handleSeek = (rawSec: number) => {
    const newSec = clampStart(rawSec);
    setSelectedStartSec(newSec);
    setCurrentPlayTime(newSec);
    lastTimeUpdateRef.current = newSec;
    if (audioRef.current) {
      if (audioRef.current.readyState >= 1) {
        try {
          audioRef.current.currentTime = newSec;
        } catch {}
      } else {
        pendingSeekRef.current = newSec;
      }
      setIsAudioLoading(true);
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsAudioLoading(false);
        })
        .catch(() => {
          setIsAudioLoading(false);
        });
    }
  };

  // 5b. Dalga Formunu Sürükleme (Sabit çerçeve, hareketli şarkı)
  const handleWavePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pps = getPxPerSec();
    if (!selectedTrack || pps === 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      startSec: selectedStartSec,
      lastSec: selectedStartSec,
    };
    setIsDragging(true);
  };

  const handleWavePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pps = getPxPerSec();
    if (!pps) return;
    const next = clampStart(drag.startSec - (e.clientX - drag.x) / pps);
    drag.lastSec = next;
    setSelectedStartSec(next);
    setCurrentPlayTime(next);
  };

  const handleWavePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    handleSeek(drag.lastSec);
  };

  const handleWaveWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const pps = getPxPerSec();
    if (!selectedTrack || !pps) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const base = wheelSecRef.current ?? selectedStartSec;
    const next = clampStart(base + delta / pps);
    wheelSecRef.current = next;
    setSelectedStartSec(next);
    setCurrentPlayTime(next);
    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      wheelSecRef.current = null;
      handleSeek(next);
    }, 180);
  };

  // 6. Gerçek Zamanlı 60fps Analog İlerleme (DOM'a doğrudan yazılır, React render tetiklemez)
  const paintProgress = useCallback((t: number) => {
    const el = progressRef.current;
    if (!el) return;
    const pps = ppsRef.current;
    const elapsed = Math.max(0, Math.min(windowSecRef.current, t - startRef.current));
    el.style.width = `${elapsed * pps}px`;
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let lastAudioTime = -1;
    let lastStamp = performance.now();

    const updatePlayhead = () => {
      const audio = audioRef.current;
      if (audio && !dragRef.current) {
        syncBufferedEnd();
        const now = performance.now();
        let cur = audio.currentTime;


        if (cur !== lastAudioTime) {
          lastAudioTime = cur;
          lastStamp = now;
        }
        // Tarayıcı currentTime'ı kaba adımlarla güncellediğinde aradaki kareleri interpolasyonla doldur
        const smooth = audio.paused
          ? cur
          : lastAudioTime +
            (Math.min(now - lastStamp, 250) / 1000) * (audio.playbackRate || 1);

        const start = startRef.current;
        const endSec = start + windowSecRef.current;
        // Senaryo 3: Lookahead Döngü Yakalama (t_k + Delta_t_EMA >= endSec)
        const predictedNext = cur + emaDeltaRef.current;
        const isAtLoopEnd =
          predictedNext >= endSec ||
          cur >= endSec ||
          (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && cur >= audio.duration - 0.4);
        if (isAtLoopEnd) {
          audio.currentTime = start;
          lastAudioTime = start;
          lastStamp = now;
          lastTimeUpdateRef.current = start;
          paintProgress(start);
        } else {
          paintProgress(Math.min(smooth, endSec));
        }
      }
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    animFrameRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, paintProgress, syncBufferedEnd]);

  // Başlangıç değiştiğinde veya boyut değiştiğinde ilerlemeyi yeniden hizala
  useEffect(() => {
    if (dragRef.current) {
      paintProgress(selectedStartSec);
      return;
    }
    paintProgress(audioRef.current?.currentTime ?? selectedStartSec);
  }, [selectedStartSec, viewportWidth, paintProgress]);

  // 7. Onay ve Çıkış
  const handleConfirm = () => {
    if (!selectedTrack) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audioMeta: StoryAudioMeta = {
      id: selectedTrack.id,
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      album: selectedTrack.album,
      thumbnail: selectedTrack.thumbnail,
      streamUrl: selectedTrack.streamUrl,
      startTime: selectedStartSec,
      // Önizleme 30 sn: Reels penceresi daha uzunsa müzik bloğu önizleme sonunda biter
      duration: Math.min(windowSec, selectedTrack.duration || PREVIEW_SEC),
      totalDuration: selectedTrack.duration,
    };

    const nextRecent = [
      selectedTrack,
      ...readStoredTracks(RECENT_KEY).filter((t) => t.id !== selectedTrack.id),
    ];
    setRecentTracks(nextRecent);
    writeStoredTracks(RECENT_KEY, nextRecent);

    onSelectMusic(audioMeta);
    onClose();
  };

  if (!isOpen) return null;

  // Sabit Çerçeve / Kaydırılabilir Dalga Formu Hesaplamaları
  const pxPerSec = viewportWidth > 0 ? viewportWidth / viewWindowSec : 0;
  const barPitchPx = pxPerSec / BARS_PER_SEC;
  const clipEndSec = selectedStartSec + windowSec;
  // Şarkının 0. saniyesi, aktif çerçevenin sol sınırına (edgeSec) hizalanır
  const trackOffsetPx = (edgeSec - selectedStartSec) * pxPerSec;
  const frameLeftPercent = (edgeSec / viewWindowSec) * 100;
  const frameWidthPercent = (windowSec / viewWindowSec) * 100;

  const isSearchActive = searchQuery.trim().length > 0;
  const visibleTracks = isSearchActive
    ? tracks
    : activeTab === "recent"
      ? recentTracks
      : activeTab === "saved"
        ? savedTracks
        : tracks;

  return (
    <EditorPortal>
    <div role="dialog" aria-modal="true" aria-label="Müzik Seç" className="fixed inset-0 z-sheet flex flex-col bg-neutral-950/98 text-white backdrop-blur-2xl animate-in slide-in-from-bottom duration-300 ease-out pt-safe pb-safe">
      {/* Görünmez Canlı Ses Akışı Oynatıcısı */}
      <audio
        ref={audioRef}
        onProgress={() => {
          syncBufferedEnd();
        }}
        onLoadedMetadata={() => {
          syncBufferedEnd();
        }}
        onLoadedData={() => {
          syncBufferedEnd();
        }}
        onPlay={() => {
          setIsPlaying(true);
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setIsAudioLoading(false);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onCanPlay={() => {
          setIsAudioLoading(false);
          setAudioErrorTrackId(null);
          syncBufferedEnd();
          if (audioRef.current && pendingSeekRef.current !== null) {
            const target = pendingSeekRef.current;
            pendingSeekRef.current = null;
            if (target > 0) {
              try {
                audioRef.current.currentTime = target;
              } catch {}
            }
          }
        }}
        onSeeking={() => {
          setIsAudioLoading(true);
        }}
        onSeeked={() => {
          setIsAudioLoading(false);
        }}
        onWaiting={() => {
          setIsAudioLoading(true);
        }}
        onTimeUpdate={() => {
          syncBufferedEnd();
          if (audioRef.current && !dragRef.current) {
            let cur = audioRef.current.currentTime;
            const dur = audioRef.current.duration;
            const endSec = selectedStartSec + windowSec;

            // EMA Delta hesaplama (alfa = 0.3)
            if (lastTimeUpdateRef.current > 0 && cur > lastTimeUpdateRef.current) {
              const dt = Math.max(0.05, Math.min(0.4, cur - lastTimeUpdateRef.current));
              emaDeltaRef.current = 0.3 * dt + 0.7 * emaDeltaRef.current;
            }
            lastTimeUpdateRef.current = cur;

            // Senaryo 3: Lookahead Döngü Yakalama (t_k + Delta_t_EMA >= endSec)
            const predictedNext = cur + emaDeltaRef.current;
            const isAtLoopEnd =
              predictedNext >= endSec ||
              cur >= endSec ||
              (dur && !isNaN(dur) && isFinite(dur) && cur >= dur - 0.4);

            if (isAtLoopEnd) {
              try {
                audioRef.current.currentTime = selectedStartSec;
                lastTimeUpdateRef.current = selectedStartSec;
              } catch {}
            }
          }
        }}
        onError={() => {
          setIsPlaying(false);
          setIsAudioLoading(false);
          if (selectedTrack) {
            setAudioErrorTrackId(selectedTrack.id);
          }
        }}
        onEnded={() => {
          setIsAudioLoading(false);
          if (audioRef.current) {
            try {
              audioRef.current.currentTime = selectedStartSec;
              audioRef.current.play().catch(() => {});
            } catch {}
          }
        }}
        preload="auto"
      />

      {/* 1. ÜST BAŞLIK BARI */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--ed-line,#2a303a)] shrink-0">
        <button
          type="button"
          onClick={() => {
            if (audioRef.current) audioRef.current.pause();
            onClose();
          }}
          aria-label="Müzik seçiciyi kapat"
          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition-all"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-[var(--ed-ac,#38d5c8)]" />
          <h2 className="text-sm font-bold tracking-wide">Müzik Seç</h2>
        </div>

        {selectedTrack ? (
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-black font-bold text-xs shadow-lg hover:bg-neutral-100 active:scale-95 transition-all"
          >
            <span>Bitti</span>
            <Check className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="w-11 h-11" />
        )}
      </div>

      {/* 2. ARAMA KUTUSU */}
      <div className="p-4 pb-2 shrink-0">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] focus-within:border-[var(--ed-ac,#38d5c8)] focus-within:bg-white/10 transition-all">
          <Search className="w-4 h-4 text-[var(--ed-tx2,#98a2b3)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Şarkı veya sanatçı ara..."
            className="w-full bg-transparent text-sm text-white placeholder:text-[var(--ed-tx3,#5b6574)] outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              aria-label="Aramayı temizle"
              className="p-1 rounded-full text-[var(--ed-tx2,#98a2b3)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearching && (
            <Loader2 className="w-4 h-4 text-[var(--ed-ac,#38d5c8)] animate-spin shrink-0" />
          )}
        </div>
      </div>

      {/* 2b. SEKMELER (Arama yapılırken gizlenir) */}
      {!isSearchActive && (
        <div className="px-4 pb-1 shrink-0">
          <div className="grid grid-cols-3 gap-1 bg-[var(--ed-bg2,#1a1e25)] p-1 rounded-2xl border border-[var(--ed-line,#2a303a)]">
            {([
              ["discover", "Keşfet"],
              ["recent", "Son Kullanılanlar"],
              ["saved", "Kaydedilenler"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-pressed={activeTab === key}
                className={`py-1.5 rounded-xl text-[11px] font-bold transition-all truncate ${
                  activeTab === key
                    ? "bg-white text-black shadow-sm"
                    : "text-[var(--ed-tx2,#98a2b3)] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. ŞARKI LİSTESİ */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 no-scrollbar">
        {visibleTracks.map((track) => {
          const isSelected = selectedTrack?.id === track.id;
          const isPreviewing = previewTrackId === track.id;
          const isSaved = savedIds.has(track.id);
          return (
            <div
              key={track.id}
              onClick={() => toggleListPreview(track)}
              className={`w-full flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition-all active:scale-[0.99] ${
                isSelected
                  ? "bg-[rgba(56,213,200,0.15)] border-[rgba(56,213,200,0.40)] text-white "
                  : "bg-[var(--ed-bg2,#1a1e25)] hover:bg-white/10 border-[var(--ed-line,#2a303a)] text-white"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[var(--ed-bg3,#232932)] overflow-hidden relative shrink-0 flex items-center justify-center shadow-md">
                  {track.thumbnail ? (
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <Music className="w-5 h-5 text-[var(--ed-ac,#38d5c8)]" />
                  )}
                  <div
                    className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                      isPreviewing ? "bg-black/50 opacity-100" : "bg-black/30 opacity-0"
                    }`}
                  >
                    {isPreviewing && isPreviewLoading ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : isPreviewing ? (
                      <Pause className="w-4 h-4 text-white fill-current" />
                    ) : (
                      <Play className="w-4 h-4 text-white fill-current" />
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {track.title}
                  </p>
                  <p className="text-[11px] text-[var(--ed-tx2,#98a2b3)] truncate mt-0.5">
                    {track.artist}
                  </p>
                  {isPreviewing && !isPreviewLoading && (
                    <div className="mt-1.5 h-0.5 w-24 rounded-full bg-white/15 overflow-hidden">
                      <div
                        className="h-full bg-[var(--ed-ac,#38d5c8)] rounded-full"
                        style={{
                          animation: `musicPreviewBar ${LIST_PREVIEW_SEC}s linear forwards`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1.5 pl-2">
                <span className="text-[11px] text-[var(--ed-tx2,#98a2b3)] font-mono">
                  {track.durationFormatted}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSavedTrack(track);
                  }}
                  aria-label={isSaved ? `Kaydedilenlerden çıkar: ${track.title}` : `Kaydet: ${track.title}`}
                  aria-pressed={isSaved}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--ed-tx2,#98a2b3)] hover:text-white transition-all active:scale-90"
                >
                  <Heart
                    className={`w-4 h-4 ${isSaved ? "fill-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac,#38d5c8)]" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSelected) handleSelectTrack(track);
                  }}
                  aria-label={isSelected ? `Seçili: ${track.title}` : `Kullan: ${track.title}`}
                  className={`h-11 min-w-11 px-3 rounded-full flex items-center justify-center gap-1 text-[11px] font-bold transition-all active:scale-95 ${
                    isSelected
                      ? "bg-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac-tx,#04201e)]"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {isSelected ? <Check className="w-3.5 h-3.5" /> : <span>Kullan</span>}
                </button>
              </div>
            </div>
          );
        })}

        {visibleTracks.length === 0 && !isSearching && (
          <div className="py-16 text-center text-xs text-[var(--ed-tx3,#5b6574)]">
            Şarkı yok
          </div>
        )}
      </div>
      <style>{`@keyframes musicPreviewBar { from { width: 0% } to { width: 100% } }`}</style>

      {/* 4. KIRPICI BAR (Hikaye 30 sn / Reels timeline süresi) */}
      {selectedTrack && (
        <div className="shrink-0 p-4 pb-6 border-t border-[var(--ed-line,#2a303a)] bg-neutral-900/95 backdrop-blur-2xl flex flex-col gap-3.5 animate-in slide-in-from-bottom duration-200">
          {/* Üst Satır: Şarkı Bilgisi & Canlı Saniye Göstergesi */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-bold text-white font-mono bg-white/10 px-2.5 py-1 rounded-full">
                {formatSeconds(selectedStartSec)} -{" "}
                {formatSeconds(Math.min(selectedStartSec + windowSec, selectedTrack.duration))}
              </span>
              <span className="text-[11px] text-[var(--ed-tx2,#98a2b3)]">
                / {selectedTrack.durationFormatted}
              </span>
            </div>
          </div>

          {/* Reels penceresi önizlemeden uzunsa uyarı */}
          {windowSec > selectedTrack.duration && (
            <p className="text-[11px] text-amber-300/90 text-center">
              Önizleme {Math.round(selectedTrack.duration)} sn — müzik klibin ortasında biter
            </p>
          )}

          {/* INSTAGRAM SES DALGASI VE AKTİF PENCERE BARI */}
          <div className="flex items-center gap-3">
            {/* Oynat / Duraklat Düğmesi */}
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? "Duraklat" : "Oynat"}
              className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0 shadow-xl hover:bg-neutral-100 active:scale-95 transition-all"
            >
              {isAudioLoading ? (
                <Loader2 className="w-5 h-5 text-black animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            {/* Sabit Çerçeve + Kaydırılabilir Dalga Formu (pencere + iki yanda %25) */}
            <div
              ref={setViewportEl}
              onPointerDown={handleWavePointerDown}
              onPointerMove={handleWavePointerMove}
              onPointerUp={handleWavePointerUp}
              onPointerCancel={handleWavePointerUp}
              onWheel={handleWaveWheel}
              className={`flex-1 relative h-12 bg-black/60 rounded-2xl border border-[var(--ed-line,#2a303a)] overflow-hidden touch-none ${
                isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              {/* Hareketli Şarkı İzi */}
              <div
                className={`absolute inset-y-2 left-0 will-change-transform ${
                  isDragging ? "" : "transition-transform duration-200 ease-out"
                }`}
                style={{ transform: `translate3d(${trackOffsetPx}px, 0, 0)` }}
              >
                {/* Taban Çizgiler (soluk kenarlar / parlak aktif alan) */}
                {waveformBars.map((height, idx) => {
                  const barSec = idx / BARS_PER_SEC;
                  const isInsideClip = barSec >= selectedStartSec && barSec < clipEndSec;

                  return (
                    <div
                      key={idx}
                      className={`absolute top-1/2 -translate-y-1/2 rounded-full ${
                        isInsideClip ? "bg-white/90" : "bg-white/20"
                      }`}
                      style={{
                        left: `${idx * barPitchPx}px`,
                        width: `${BAR_WIDTH_PX}px`,
                        height: `${height}%`,
                      }}
                    />
                  );
                })}

                {/* Analog Dolum Katmanı: genişliği rAF ile piksel piksel artar */}
                <div
                  ref={progressRef}
                  className="absolute top-0 bottom-0 overflow-hidden pointer-events-none"
                  style={{ left: `${selectedStartSec * pxPerSec}px` }}
                >
                  <div
                    className="absolute top-0 bottom-0"
                    style={{ left: `${-selectedStartSec * pxPerSec}px` }}
                  >
                    {waveformBars.map((height, idx) => {
                      const barSec = idx / BARS_PER_SEC;
                      if (barSec < selectedStartSec || barSec >= clipEndSec) return null;
                      return (
                        <div
                          key={idx}
                          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-[var(--ed-ac,#38d5c8)]"
                          style={{
                            left: `${idx * barPitchPx}px`,
                            width: `${BAR_WIDTH_PX}px`,
                            height: `${height}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sabit Aktif Çerçeve */}
              <div
                className="absolute inset-y-0.5 rounded-xl border-2 border-white/90 pointer-events-none"
                style={{
                  left: `${frameLeftPercent}%`,
                  width: `${frameWidthPercent}%`,
                }}
              />
            </div>
          </div>

          {/* Moda Göre Ekle Butonu */}
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 rounded-2xl bg-[var(--ed-ac,#38d5c8)] hover:opacity-95 active:scale-[0.98] text-[var(--ed-ac-tx,#04201e)] font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            <span>{confirmLabel}</span>
            <Check className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}
    </div>
    </EditorPortal>
  );
}
