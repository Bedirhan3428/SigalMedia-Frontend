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
  Flame,
  ChevronDown,
} from "lucide-react";
import {
  SoundTrack,
  searchTracks,
  getAudioStreamUrl,
  getTrackHotChunks,
  getTrackLyrics,
  warmTrackAudio,
  formatSeconds,
  LyricLine,
  HotChunk,
} from "@/services/soundService";
import { StoryAudioMeta } from "@/lib/canvas-editor";

interface MusicPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMusic: (meta: StoryAudioMeta) => void;
  currentMusic?: StoryAudioMeta | null;
}

// Instagram Story ses süresi: Sabit 30 saniye
const FIXED_DURATION = 30;
// Görünür pencere: 7.5s soluk + 30s aktif + 7.5s soluk
const EDGE_SEC = 7.5;
const VIEW_WINDOW_SEC = FIXED_DURATION + EDGE_SEC * 2;
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
}: MusicPickerDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [tracks, setTracks] = useState<SoundTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SoundTrack | null>(null);

  // Saniye ve Oynatma Durumları
  const [selectedStartSec, setSelectedStartSec] = useState<number>(0);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioErrorTrackId, setAudioErrorTrackId] = useState<string | null>(null);
  const [hotChunks, setHotChunks] = useState<HotChunk[]>([]);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentLyricSnippet, setCurrentLyricSnippet] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  const lyricRef = useRef("");
  startRef.current = selectedStartSec;
  ppsRef.current = viewportWidth > 0 ? viewportWidth / VIEW_WINDOW_SEC : 0;

  // Yükleme durumu için emniyet zaman aşımı (maksimum 2 saniye sonra yükleniyor zorla kapanır)
  useEffect(() => {
    if (!isAudioLoading) return;
    const timer = setTimeout(() => {
      setIsAudioLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isAudioLoading]);

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
    const dur = selectedTrack?.duration || 180;
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
      setIsPlaying(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);

    searchTracks(searchQuery || "trend", 20).then((res) => {
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
            duration: currentMusic.totalDuration || 180,
            durationFormatted: formatSeconds(currentMusic.totalDuration || 180),
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

    // Karakter Kotası: 1 harfli aramalar YouTube backend'ini anlamsızca yormaması için tetiklenmez
    if (trimmed.length === 1) {
      setIsSearching(false);
      return;
    }

    // 400ms İdeal Eşik: Kullanıcı yazmayı bitirdiğinde gecikme hissettirmeden tetiklenir
    searchTimeoutRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      searchAbortControllerRef.current = abortController;
      setIsSearching(true);

      const queryToSearch = trimmed.length === 0 ? "trend" : trimmed;
      const results = await searchTracks(queryToSearch, 20, abortController.signal);

      // Sadece istek iptal edilmediyse sonuçları ekrana bas (eski yanıtlar yenilerin üstüne yazılamaz)
      if (!abortController.signal.aborted) {
        setTracks(results);
        setIsSearching(false);
      }
    }, 400);
  };

  // 3. Şarkı Seçimi & Ses Yükleme
  const handleSelectTrack = useCallback((track: SoundTrack) => {
    setSelectedTrack(track);
    setAudioErrorTrackId(null);
    setIsAudioLoading(true);

    warmTrackAudio(track.id);

    const maxStart = Math.max(0, track.duration - FIXED_DURATION);
    const defaultStart = Math.min(30, Math.floor(maxStart * 0.2));
    setSelectedStartSec(defaultStart);
    setCurrentPlayTime(defaultStart);
    pendingSeekRef.current = defaultStart;

    getTrackHotChunks(track.id).then((chunks) => setHotChunks(chunks));
    getTrackLyrics(track.id, track.title, track.artist).then((lyr) => setLyrics(lyr));

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}

      audioRef.current.src = getAudioStreamUrl(track.id);
      audioRef.current.load();

      // Not: currentTime burada atanmaz; ses metadata'sı yüklendiğinde onCanPlay içinde pendingSeekRef ile atanır.
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsAudioLoading(false);
        })
        .catch(() => {
          // Hızlı şarkı geçişlerinde 'play() request interrupted by new load' hatasını yut
          setIsPlaying(false);
          setIsAudioLoading(false);
        });
    }
  }, []);

  // Hover Debounce Ön-Isıtma (Kullanıcı fareyle şarkının üzerinde 800ms durursa sessizce ön-yükle)
  const hoverWarmupTimerRef = useRef<{ [trackId: string]: NodeJS.Timeout }>({});
  const handleTrackHover = useCallback((trackId: string) => {
    if (hoverWarmupTimerRef.current[trackId]) return;
    hoverWarmupTimerRef.current[trackId] = setTimeout(() => {
      warmTrackAudio(trackId);
      delete hoverWarmupTimerRef.current[trackId];
    }, 800);
  }, []);

  const handleTrackLeave = useCallback((trackId: string) => {
    if (hoverWarmupTimerRef.current[trackId]) {
      clearTimeout(hoverWarmupTimerRef.current[trackId]);
      delete hoverWarmupTimerRef.current[trackId];
    }
  }, []);

  // 4. Oynat / Duraklat Toggle
  const togglePlayPause = () => {
    if (!audioRef.current || !selectedTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsAudioLoading(true);
      setAudioErrorTrackId(null);
      const cur = audioRef.current.currentTime;
      if (cur < selectedStartSec || cur >= selectedStartSec + FIXED_DURATION) {
        audioRef.current.currentTime = selectedStartSec;
        setCurrentPlayTime(selectedStartSec);
      }
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsAudioLoading(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setIsAudioLoading(false);
        });
    }
  };

  // 5. Başlangıç Saniyesi Değişimi (Şarkı sonu sınırını 0.5s pay ile korur, EOF taşmasını engeller)
  const getMaxStart = () => {
    const audioDur = audioRef.current?.duration;
    const dur =
      audioDur && !isNaN(audioDur) && isFinite(audioDur) && audioDur > 0
        ? audioDur
        : (selectedTrack?.duration || 0);
    return Math.max(0, Math.floor(dur - FIXED_DURATION - 0.5));
  };
  const clampStart = (sec: number) =>
    Math.round(Math.min(getMaxStart(), Math.max(0, sec)) * 10) / 10;
  const getPxPerSec = () =>
    viewportWidth > 0 ? viewportWidth / VIEW_WINDOW_SEC : 0;

  const handleSeek = (rawSec: number) => {
    const newSec = clampStart(rawSec);
    setSelectedStartSec(newSec);
    setCurrentPlayTime(newSec);
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = newSec;
      } catch {}
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
    if (!selectedTrack || getPxPerSec() === 0) return;
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
    const elapsed = Math.max(0, Math.min(FIXED_DURATION, t - startRef.current));
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
        const now = performance.now();
        const cur = audio.currentTime;
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
        const endSec = start + FIXED_DURATION;
        const isAtLoopEnd =
          cur >= endSec ||
          (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && cur >= audio.duration - 0.4);
        if (isAtLoopEnd) {
          audio.currentTime = start;
          lastAudioTime = start;
          lastStamp = now;
          paintProgress(start);
        } else {
          paintProgress(Math.min(smooth, endSec));
        }

        // Söz senkronizasyonu (yalnızca değiştiğinde state güncellenir)
        if (lyrics.length > 0) {
          const curMs = cur * 1000;
          const matched = lyrics.find(
            (l) => curMs >= l.startMs && curMs <= l.endMs + 300
          );
          if (matched && matched.text !== lyricRef.current) {
            lyricRef.current = matched.text;
            setCurrentLyricSnippet(matched.text);
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    animFrameRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, lyrics, paintProgress]);

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
      streamUrl: getAudioStreamUrl(selectedTrack.id),
      startTime: selectedStartSec,
      duration: FIXED_DURATION,
      totalDuration: selectedTrack.duration,
      lyricsSnippet: currentLyricSnippet || undefined,
    };

    onSelectMusic(audioMeta);
    onClose();
  };

  if (!isOpen) return null;

  // Sabit Çerçeve / Kaydırılabilir Dalga Formu Hesaplamaları
  const pxPerSec = viewportWidth > 0 ? viewportWidth / VIEW_WINDOW_SEC : 0;
  const barPitchPx = pxPerSec / BARS_PER_SEC;
  const clipEndSec = selectedStartSec + FIXED_DURATION;
  // Şarkının 0. saniyesi, aktif çerçevenin sol sınırına (7.5s) hizalanır
  const trackOffsetPx = (EDGE_SEC - selectedStartSec) * pxPerSec;
  const frameLeftPercent = (EDGE_SEC / VIEW_WINDOW_SEC) * 100;
  const frameWidthPercent = (FIXED_DURATION / VIEW_WINDOW_SEC) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/98 text-white backdrop-blur-2xl animate-in slide-in-from-bottom duration-300 ease-out select-none">
      {/* Görünmez Canlı Ses Akışı Oynatıcısı */}
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onCanPlay={() => {
          setIsAudioLoading(false);
          setAudioErrorTrackId(null);
          if (audioRef.current && pendingSeekRef.current !== null) {
            try {
              audioRef.current.currentTime = pendingSeekRef.current;
            } catch {}
            pendingSeekRef.current = null;
          }
        }}
        onPlaying={() => {
          setIsAudioLoading(false);
        }}
        onSeeked={() => {
          setIsAudioLoading(false);
        }}
        onWaiting={() => {
          setIsAudioLoading(true);
        }}
        onTimeUpdate={() => {
          if (audioRef.current && !dragRef.current) {
            const cur = audioRef.current.currentTime;
            const endSec = selectedStartSec + FIXED_DURATION;
            const dur = audioRef.current.duration;
            const isAtLoopEnd =
              cur >= endSec ||
              (dur && !isNaN(dur) && isFinite(dur) && cur >= dur - 0.4);
            if (isAtLoopEnd) {
              try {
                audioRef.current.currentTime = selectedStartSec;
              } catch {}
            }
          }
        }}
        onError={() => {
          setIsPlaying(false);
          setIsAudioLoading(false);
          // Eğer 30s alanının sonuna gelindiyse veya dosya sonu hatasıysa başa al
          if (audioRef.current) {
            try {
              audioRef.current.currentTime = selectedStartSec;
            } catch {}
          }
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
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (audioRef.current) audioRef.current.pause();
            onClose();
          }}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white flex items-center justify-center transition-all"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-pink-400" />
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
          <div className="w-9 h-9" />
        )}
      </div>

      {/* 2. ARAMA KUTUSU */}
      <div className="p-4 pb-2 shrink-0">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white/5 border border-white/10 focus-within:border-pink-500/50 focus-within:bg-white/10 transition-all">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Şarkı veya sanatçı ara..."
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="p-1 rounded-full text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearching && (
            <Loader2 className="w-4 h-4 text-pink-400 animate-spin shrink-0" />
          )}
        </div>
      </div>

      {/* 3. ŞARKI LİSTESİ */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 no-scrollbar">
        {tracks.map((track) => {
          const isSelected = selectedTrack?.id === track.id;
          return (
            <div
              key={track.id}
              onClick={() => handleSelectTrack(track)}
              onMouseEnter={() => handleTrackHover(track.id)}
              onMouseLeave={() => handleTrackLeave(track.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition-all active:scale-[0.99] ${
                isSelected
                  ? "bg-pink-500/15 border-pink-500/40 text-white shadow-xl shadow-pink-500/10"
                  : "bg-white/5 hover:bg-white/10 border-white/5 text-white"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 overflow-hidden relative shrink-0 flex items-center justify-center shadow-md">
                  {track.thumbnail ? (
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <Music className="w-5 h-5 text-pink-400" />
                  )}
                  {isSelected && isPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Pause className="w-4 h-4 text-pink-400 fill-current" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {track.title}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {track.artist}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2 pl-2">
                <span className="text-[11px] text-zinc-400 font-mono">
                  {track.durationFormatted}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSelected) {
                      togglePlayPause();
                    } else {
                      handleSelectTrack(track);
                    }
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-pink-500 text-white"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {isSelected && isAudioLoading ? (
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  ) : isSelected && isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {tracks.length === 0 && !isSearching && (
          <div className="py-16 text-center text-xs text-zinc-500">
            Sonuç bulunamadı
          </div>
        )}
      </div>

      {/* 4. INSTAGRAM STİLİ 15 SANİYELİK AYARLAMA BARI (INSTAGRAM MUSIC TRIMMER) */}
      {selectedTrack && (
        <div className="shrink-0 p-4 pb-6 border-t border-white/10 bg-neutral-900/95 backdrop-blur-2xl flex flex-col gap-3.5 animate-in slide-in-from-bottom duration-200">
          {/* Üst Satır: Şarkı Bilgisi, Canlı Saniye Göstergesi & Popüler Nakarat */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-bold text-white font-mono bg-white/10 px-2.5 py-1 rounded-full">
                {formatSeconds(selectedStartSec)} -{" "}
                {formatSeconds(selectedStartSec + FIXED_DURATION)}
              </span>
              <span className="text-[11px] text-zinc-400">
                / {selectedTrack.durationFormatted}
              </span>
            </div>

            {/* Popüler Nakarat Rozeti (Varsa) */}
            {hotChunks.length > 0 && (
              <button
                type="button"
                onClick={() => handleSeek(hotChunks[0].start)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all text-[11px] font-semibold"
              >
                <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>Nakarat ({formatSeconds(hotChunks[0].start)})</span>
              </button>
            )}
          </div>

          {/* Senkronize Şarkı Sözü Satırı */}
          {currentLyricSnippet && (
            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-center animate-in fade-in duration-150">
              <p className="text-xs text-pink-200 font-semibold italic truncate">
                "{currentLyricSnippet}"
              </p>
            </div>
          )}

          {/* INSTAGRAM SES DALGASI VE 30s PENCERE BARI */}
          <div className="flex items-center gap-3">
            {/* Oynat / Duraklat Düğmesi */}
            <button
              type="button"
              onClick={togglePlayPause}
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

            {/* Sabit 30s Çerçeve + Kaydırılabilir Dalga Formu (45s görünür alan) */}
            <div
              ref={setViewportEl}
              onPointerDown={handleWavePointerDown}
              onPointerMove={handleWavePointerMove}
              onPointerUp={handleWavePointerUp}
              onPointerCancel={handleWavePointerUp}
              onWheel={handleWaveWheel}
              className={`flex-1 relative h-12 bg-black/60 rounded-2xl border border-white/10 overflow-hidden touch-none ${
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
                        isInsideClip ? "bg-white/85" : "bg-white/20"
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
                          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-t from-pink-500 via-rose-400 to-amber-300"
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

              {/* Sabit Aktif Çerçeve (30s) */}
              <div
                className="absolute inset-y-0.5 rounded-xl border-2 border-white/90 pointer-events-none"
                style={{
                  left: `${frameLeftPercent}%`,
                  width: `${frameWidthPercent}%`,
                }}
              />
            </div>
          </div>

          {/* Instagram Stili "Hikayeye Ekle" Butonu */}
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:opacity-95 active:scale-[0.98] text-white font-bold text-sm shadow-xl shadow-pink-500/25 transition-all flex items-center justify-center gap-2"
          >
            <span>Hikayeye Ekle</span>
            <Check className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}
    </div>
  );
}
