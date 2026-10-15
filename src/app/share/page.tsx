"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import {
  CanvasEngine,
  BaseLayer,
  TextLayer,
  OverlayImageLayer,
  MusicStickerLayer,
  FontPreset,
  TextBgPreset,
  FONT_PRESET_CONFIGS,
  StoryAudioMeta,
} from "@/lib/canvas-editor";
import {
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  AtSign,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CaseSensitive,
  Sticker,
  Music,
  CircleChevronRight,
  X,
  Search,
  Sparkles,
  Play,
  Pause,
  Flame,
  Check,
} from "lucide-react";
import { getSongHeatmapAndHotspot, processSongShareAndGetUrl } from "@/services/audioTracker";
import { ChunkSlice } from "@/utils/audioChunkMath";

// 18 Canlı Instagram Hikaye Renk Paleti
const STORY_COLORS = [
  "#FFFFFF", // Beyaz
  "#000000", // Siyah
  "#737373", // Nötr Gri
  "#EF4444", // Kırmızı
  "#F97316", // Turuncu
  "#F59E0B", // Kehribar
  "#EAB308", // Sarı
  "#84CC16", // Fıstık Yeşili
  "#10B981", // Zümrüt Yeşili
  "#06B6D4", // Camgöbeği
  "#0EA5E9", // Gökyüzü Mavisi
  "#3B82F6", // Mavi
  "#6366F1", // İndigo
  "#8B5CF6", // Menekşe
  "#A855F7", // Mor
  "#D946EF", // Fuşya
  "#EC4899", // Pembe
  "#F43F5E", // Gül
];

type ActiveDrawer = "none" | "sticker_sheet" | "music" | "tag";

let hasHandledShareReload = false;

export default function ShareStoryPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  // Canvas ve Motor Referansları
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const baseFileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayFileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardTriggeredRef = useRef(false);

  // Editör Durumları
  const [canvasKey, setCanvasKey] = useState<number>(0);
  const [hasMedia, setHasMedia] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<BaseLayer | null>(null);
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [activeFilterGradient, setActiveFilterGradient] = useState<string>("#000000");
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>("none");
  const [selectedMusic, setSelectedMusic] = useState<StoryAudioMeta | null>(null);

  // Mıknatıslı Çöp Kutusu Durumu
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isTrashHot, setIsTrashHot] = useState(false);

  // Canlı Metin Düzenleme Modu (Instagram Story Focus Overlay)
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [activeFontPreset, setActiveFontPreset] = useState<FontPreset>("modern");
  const [activeBgPreset, setActiveBgPreset] = useState<TextBgPreset>("solid");
  const [activeTextColor, setActiveTextColor] = useState("#FFFFFF");
  const [activeTextAlign, setActiveTextAlign] = useState<"left" | "center" | "right">("center");

  // Müzik Durumları & HTML5 Ses Oynatıcı
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [previewTrack, setPreviewTrack] = useState<any | null>(null);
  const [musicResults, setMusicResults] = useState<any[]>([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  const [selectedStartSec, setSelectedStartSec] = useState<number>(0);
  const [hotspot, setHotspot] = useState<ChunkSlice | null>(null);
  const [heatmapChunks, setHeatmapChunks] = useState<ChunkSlice[]>([]);
  const [searchMusicQuery, setSearchMusicQuery] = useState("");

  // İşlem Durumları
  const [isPublishing, setIsPublishing] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const openTextEditorRef = useRef<(layer?: TextLayer) => void>(() => {});

  // 0. SAYFA YENİLENİRSE DOĞRUDAN ANA SAYFAYA YÖNLENDİR (RELOAD KORUMASI)
  // & EDİTÖRE HER GİRİŞTE HER ŞEYİ BAŞTAN BAŞLAT
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Eski hatalı sessionStorage bayraklarını tamamen temizle
      sessionStorage.removeItem("sigal_editor_reloaded");
      sessionStorage.removeItem("sigal_editor_active");

      // Yalnızca /share üzerinde tarayıcı yenilemesi (F5 / Reload) yapılmışsa ana sayfaya yönlendir
      if (!hasHandledShareReload) {
        hasHandledShareReload = true;
        const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        const isReload = navEntries.length > 0 && navEntries[0].type === "reload";
        const wasOnShare = navEntries.length > 0 && (navEntries[0].name.endsWith("/share") || navEntries[0].name.includes("/share?"));

        if (isReload && wasOnShare) {
          router.replace("/");
          return;
        }
      }
    }

    // Tuvali ve arkaplanı kesin olarak sıfırla, yeni bir tuval anahtarı üret
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setCanvasKey((prev) => prev + 1);
    setMounted(true);
    guardTriggeredRef.current = false;
    if (baseFileInputRef.current) baseFileInputRef.current.value = "";
    if (overlayFileInputRef.current) overlayFileInputRef.current.value = "";

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        engineRef.current?.requestRender();
      });
    }

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };
  }, [router]);

  // Editörü Tamamen Temizleme Fonksiyonu
  const resetEditor = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setCanvasKey((prev) => prev + 1);
    if (baseFileInputRef.current) baseFileInputRef.current.value = "";
    if (overlayFileInputRef.current) overlayFileInputRef.current.value = "";

    setHasMedia(false);
    setSelectedLayer(null);
    setFilterToast(null);
    setActiveFilterGradient("#000000");
    setActiveDrawer("none");
    setSelectedMusic(null);
    setPreviewTrack(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setIsPlayingAudio(false);
    setIsDraggingObject(false);
    setIsTrashHot(false);
    setIsTextEditing(false);
    setEditingText("");
    setActiveFontPreset("modern");
    setActiveBgPreset("solid");
    setActiveTextColor("#FFFFFF");
    setActiveTextAlign("center");
    setShowExitConfirm(false);
    guardTriggeredRef.current = false;
  }, []);

  // Sayfadan çıkışta sesi tamamen durdur
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // 15 Saniyelik Kesintisiz Döngü (Instagram Reels & Stories Loop)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.currentTime >= selectedStartSec + 15 || audio.currentTime < selectedStartSec) {
        audio.currentTime = selectedStartSec;
      }
    };

    const handleEnded = () => {
      audio.currentTime = selectedStartSec;
      audio.play().catch(() => {});
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [selectedStartSec]);

  // Canlı Müzik Arama (YouTube Music Arama Motoru Debounced)
  useEffect(() => {
    if (activeDrawer !== "music") return;

    const trimmed = searchMusicQuery.trim();
    const q = trimmed || "popüler türkçe";
    setIsSearchingMusic(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/music/proxy?type=search&q=${encodeURIComponent(q)}&limit=20`);
        const json = await res.json();
        const items = json?.data || json?.results || (Array.isArray(json) ? json : []);
        setMusicResults(items);
      } catch (err) {
        console.error("Music search error:", err);
      } finally {
        setIsSearchingMusic(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchMusicQuery, activeDrawer]);

  // Geri Butonu Tıklaması
  const handleBackClick = () => {
    if (hasMedia) {
      setShowExitConfirm(true);
    } else {
      router.back();
    }
  };

  // Çıkışı Onaylama: Editörü Temizle ve Ana Sayfaya Dön
  const handleConfirmExit = () => {
    resetEditor();
    router.replace("/");
  };

  // Tarayıcı / Mobil Geri Tuşunda Onay Modalı Çıkarma
  useEffect(() => {
    if (!hasMedia) return;

    window.history.pushState({ inEditor: true }, "");

    const handlePopState = () => {
      setShowExitConfirm(true);
      window.history.pushState({ inEditor: true }, "");
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasMedia]);

  // Sayfa Kapatma / Yenileme Öncesi Tarayıcı Güvenlik Uyarısı
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasMedia) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasMedia]);

  // Tuval Motorunu Başlatma (Tam Ekran Uygulama Boyutları)
  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) return engineRef.current;
    if (!canvasRef.current) return null;

    const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
    const aspect = vh / (vw || 1);
    const canvasWidth = 1080;
    const canvasHeight = Math.round(1080 * aspect);

    const engine = new CanvasEngine({
      canvas: canvasRef.current,
      width: canvasWidth,
      height: canvasHeight,
      fitMode: "contain",
    });

    // Katman Seçimi
    engine.on("select", (layer: BaseLayer | null) => {
      setSelectedLayer(layer);
      if (layer instanceof TextLayer) {
        setActiveFontPreset(layer.fontPreset);
        setActiveBgPreset(layer.bgPreset);
        setActiveTextColor(layer.style.color || "#FFFFFF");
        setActiveTextAlign(layer.style.textAlign || "center");
      }
    });

    // Tek Dokunma:
    // - Metin katmanı ise 5 ana arketip arasında geçiş yapar (Modern ➔ Klasik ➔ Neon ➔ Daktilo ➔ Güçlü)
    // - İkincil fotoğraf ise 5 kesim maskesi arasında geçiş yapar (Kare ➔ Daire ➔ Polaroid ➔ Kalp ➔ Yıldız)
    engine.on("single-tap", (layer: BaseLayer) => {
      if (layer instanceof TextLayer) {
        const nextFont = layer.cycleFontPreset(() => engine.requestRender());
        setActiveFontPreset(nextFont);
        engine.requestRender();
      } else if (layer instanceof OverlayImageLayer) {
        layer.cycleShapeMode();
        engine.requestRender();
      }
    });

    // Çift Dokunma: Doğrudan Canlı Metin Yazma Ekranını Aç
    engine.on("double-tap", (layer?: BaseLayer) => {
      if (layer instanceof TextLayer) {
        openTextEditorRef.current(layer);
      } else {
        openTextEditorRef.current();
      }
    });

    // Filtre Kaydırma (Swipe): 0.5s minimal rozet ve radyal gradyan arka plan
    engine.on("filter-swipe", (_dir: string, filterName: string) => {
      const currentPreset = engine.getCurrentFilterPreset();
      setActiveFilterGradient(currentPreset.backgroundGradient);
      setFilterToast(filterName);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setFilterToast(null);
      }, 500);
    });

    // Mıknatıslı Çöp Kutusu Sürükleme Takibi
    engine.on("drag-move", (info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }) => {
      if (info.layer.type === "media") return;
      setIsDraggingObject(true);

      const trashCenterX = window.innerWidth / 2;
      const trashCenterY = window.innerHeight - 68;
      const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);
      const isOver = dist < 75;

      setIsTrashHot(isOver);
    });

    // Mıknatıslı Çöp Kutusu Bırakma Takibi
    engine.on("drag-end", (info: { layer: BaseLayer; clientX: number; clientY: number }) => {
      setIsDraggingObject(false);

      if (info.layer && info.layer.type !== "media") {
        const trashCenterX = window.innerWidth / 2;
        const trashCenterY = window.innerHeight - 68;
        const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);

        if (dist < 75) {
          if (info.layer instanceof MusicStickerLayer) {
            setSelectedMusic(null);
            setPreviewTrack(null);
            if (audioRef.current) {
              audioRef.current.pause();
            }
            setIsPlayingAudio(false);
          }
          engine.removeLayer(info.layer.id);
          setSelectedLayer(null);

          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(40);
          }
        }
      }
      setIsTrashHot(false);
    });

    engineRef.current = engine;
    return engine;
  }, []);

  // Pencere boyutu değiştiğinde tuval çözünürlüğünü dinamik olarak güncelle
  useEffect(() => {
    const handleResize = () => {
      if (engineRef.current && canvasRef.current) {
        const vw = window.innerWidth || 1080;
        const vh = window.innerHeight || 1920;
        const aspect = vh / (vw || 1);
        const w = 1080;
        const h = Math.round(1080 * aspect);
        engineRef.current.updateCanvasResolution(w, h);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 1. TABAN MEDYA GİRİŞ GÜVENLİĞİ (BASE MEDIA GUARD)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mounted && !hasMedia && !guardTriggeredRef.current) {
      guardTriggeredRef.current = true;
      setTimeout(() => {
        baseFileInputRef.current?.click();
      }, 80);
    }
  }, [mounted, hasMedia]);

  const handleBaseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      await engine.loadMedia(file, undefined, false);
      setHasMedia(true);
      e.target.value = "";
    } catch (err) {
      console.error("Taban görsel yüklenemedi:", err);
      if (!hasMedia) {
        router.back();
      }
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. İKİNCİL FOTOĞRAF ÇIKARTMASI (FOTOĞRAF ÜZERİNE FOTOĞRAF)
  // Tuval genişliğinin %40'ı boyutunda ortada açılır
  // ─────────────────────────────────────────────────────────────
  const handleOverlayFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      await engine.addOverlayImage(file, 0.5, 0.5);
      e.target.value = "";
    } catch (err) {
      console.error("İkincil görsel eklenemedi:", err);
      e.target.value = "";
    }
  };



  // ─────────────────────────────────────────────────────────────
  // 3. TİPOGRAFİ VE CANLI METİN DÜZENLEME AKIŞI (ODAK MODU)
  // ─────────────────────────────────────────────────────────────
  const openTextEditor = (layer?: TextLayer) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    let target = layer;
    if (!target) {
      target = engine.addText(
        "",
        {
          fontSize: 54,
          color: activeTextColor,
        },
        0.5,
        0.45
      );
      target.setFontPreset(activeFontPreset);
      target.setBgPreset(activeBgPreset);
    }

    setSelectedLayer(target);
    setEditingText(target.style.text === "Yazı Ekleyin" ? "" : target.style.text);
    setActiveFontPreset(target.fontPreset);
    setActiveBgPreset(target.bgPreset);
    setActiveTextColor(target.style.color || "#FFFFFF");
    setActiveTextAlign(target.style.textAlign || "center");
    setIsTextEditing(true);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 60);
  };
  openTextEditorRef.current = openTextEditor;

  const closeTextEditor = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      if (!editingText.trim()) {
        engineRef.current.removeLayer(selectedLayer.id);
        setSelectedLayer(null);
      } else {
        selectedLayer.setText(editingText);
        engineRef.current.requestRender();
      }
    }
    setIsTextEditing(false);
  };

  const handleLiveTextChange = (text: string) => {
    setEditingText(text);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setText(text);
      engineRef.current.requestRender();
    }
  };

  // Font Preset Değiştir: Modern ➔ Klasik ➔ Neon ➔ Daktilo ➔ Güçlü
  const handleCycleFont = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      const nextFont = selectedLayer.cycleFontPreset(() => engineRef.current?.requestRender());
      setActiveFontPreset(nextFont);
      engineRef.current.requestRender();
    }
  };

  // Arka Plan Hapı Değiştir (A): Saf Yazı ➔ Tam Dolgulu Kutu ➔ Yarı Saydam Buzlu Kutu ➔ Neon Dış Parlama
  const handleCycleBg = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      const nextBg = selectedLayer.cycleBgPreset(() => engineRef.current?.requestRender());
      setActiveBgPreset(nextBg);
      engineRef.current.requestRender();
    }
  };

  // Hizalama Değiştir
  const handleToggleAlign = () => {
    const order: Array<"left" | "center" | "right"> = ["center", "left", "right"];
    const nextAlign = order[(order.indexOf(activeTextAlign) + 1) % order.length];
    setActiveTextAlign(nextAlign);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setStyle({ textAlign: nextAlign });
      engineRef.current.requestRender();
    }
  };

  // Renk Değiştir (18 renk)
  const handleSelectColor = (color: string) => {
    setActiveTextColor(color);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setStyle({ color });
      if (selectedLayer.fontPreset === "neon" || selectedLayer.bgPreset === "neon") {
        selectedLayer.setStyle({ shadowColor: color });
      }
      engineRef.current.requestRender();
    }
  };

  // @Bahset Çıkartması Ekle
  const handleAddTagSticker = (customTag?: string) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    const tagText = customTag || (profile?.username ? `@${profile.username}` : "@sigalmedia");
    const layer = engine.addText(
      tagText,
      {
        fontSize: 48,
        color: "#000000",
        backgroundColor: "#ffffff",
        borderRadius: 12,
        backgroundPadding: 16,
        fontWeight: "800",
        fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, sans-serif",
      },
      0.5,
      0.5
    );

    setSelectedLayer(layer);
  };

  // Şarkıyı Seç ve Önizleme Çal (Isı Haritası ve Popüler Kısım ile Sıfır Bekleme)
  const handlePreviewTrack = async (track: any) => {
    // 1. Aynı şarkıya tıklandıysa: Oynat / Durdur (Toggle)
    if (previewTrack?.id === track.id && audioRef.current) {
      if (isPlayingAudio) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      } else {
        audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
      }
      return;
    }

    try {
      setAudioLoading(true);
      setPreviewTrack(track);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.pause();
      audio.src = `/api/music/stream?id=${track.id}`;
      audio.currentTime = 0;
      setSelectedStartSec(0);

      audio.oncanplay = () => {
        setAudioLoading(false);
      };
      audio.onerror = () => {
        setAudioLoading(false);
        setIsPlayingAudio(false);
      };

      // Anında oynatmayı başlat (Kullanıcı jesti bağlamında beklemesiz)
      audio.play().then(() => {
        setIsPlayingAudio(true);
        setAudioLoading(false);
      }).catch((playErr) => {
        console.warn("Audio play warning:", playErr);
        setIsPlayingAudio(false);
        setAudioLoading(false);
      });

      // Isı haritası ve patlayan yeri arka planda asenkron al (Oynatmayı engellemez)
      const dur = track.duration || 180;
      getSongHeatmapAndHotspot(db, track.id, dur).then(({ slices, hotspot: hot }) => {
        setHeatmapChunks(slices);
        setHotspot(hot);
        const startSec = hot?.start || 0;
        if (startSec > 0) {
          setSelectedStartSec(startSec);
          if (audioRef.current && audioRef.current.currentTime < 2) {
            audioRef.current.currentTime = startSec;
          }
        }
      }).catch((hmErr) => {
        console.warn("Heatmap fetch skipped:", hmErr);
      });

    } catch (err) {
      console.error("Audio preview error:", err);
      setIsPlayingAudio(false);
      setAudioLoading(false);
    }
  };

  // Slider İle 15 Saniyelik Dilimi Değiştirme
  const handleSeekChunk = (sec: number) => {
    setSelectedStartSec(sec);
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      if (audioRef.current.paused) {
        audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
      }
    }
  };

  // Seçilen Müziği Hikayeye Ekle
  const handleConfirmAddMusic = () => {
    if (!previewTrack) return;
    const engine = getOrCreateEngine();
    if (!engine) return;

    const meta: StoryAudioMeta = {
      id: previewTrack.id,
      title: previewTrack.title,
      artist: previewTrack.artist,
      url: `/api/music/stream?id=${previewTrack.id}`,
      duration: 15,
      startTime: selectedStartSec,
      coverUrl: previewTrack.thumbnail,
    };

    setSelectedMusic(meta);
    engine.addMusicSticker(meta, 0.5, 0.68);
    setActiveDrawer("none");
  };

  // Çalan Müziği Duraklat / Devam Ettir
  const handleTogglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  // Müziği Hikayeden Kaldır
  const handleRemoveMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setIsPlayingAudio(false);
    setSelectedMusic(null);
    setPreviewTrack(null);
    const engine = engineRef.current;
    if (engine) {
      const sticker = engine.getMusicSticker();
      if (sticker) {
        engine.removeLayer(sticker.id);
      }
    }
  };

  // Cihaza WebP İndir
  const handleDownloadImage = async () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    try {
      await engine.downloadImage(`sigalmedia_${Date.now()}.webp`, {
        mimeType: "image/webp",
        quality: 0.95,
      });
    } catch (e) {
      console.error("İndirme hatası:", e);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 4. HİKAYEYİ / GÖNDERİYİ PAYLAŞ (AKILLI HİBRİT ÇIKTI MODELİ)
  // Saniyelerce video bekleme süresi yerine 15ms WebP + Müzik metaverisi
  // ─────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!profile?.uid || !engineRef.current || isPublishing) return;

    try {
      setIsPublishing(true);

      // 15 milisaniyede yüksek kaliteli 1080x1920 WebP çıktısı
      const blob = await engineRef.current.exportImage({
        mimeType: "image/webp",
        quality: 0.92,
      });

      const timestamp = Date.now();
      const filename = `story_${profile.uid}_${timestamp}.webp`;
      const storageRef = ref(storage, `posts/${profile.uid}/${filename}`);

      await uploadBytes(storageRef, blob, {
        contentType: "image/webp",
      });

      const mediaUrl = await getDownloadURL(storageRef);

      const postData: Record<string, unknown> = {
        authorId: profile.uid,
        authorUsername: profile.username || "kullanici",
        authorDisplayName: profile.displayName || "Kullanıcı",
        authorPhotoURL: profile.photoURL || "",
        mediaUrl,
        mediaType: "image",
        type: "reels",
        caption: "",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      };

      // Müzik seçildiyse akıllı 5. kullanım R2 şutlama ve sayaç takibi
      if (selectedMusic) {
        try {
          const shareResult = await processSongShareAndGetUrl(
            db,
            {
              id: selectedMusic.id,
              title: selectedMusic.title,
              artist: selectedMusic.artist,
              duration: selectedMusic.duration || 180,
            },
            selectedMusic.startTime || 0
          );
          postData.audioMeta = {
            id: selectedMusic.id,
            title: selectedMusic.title,
            artist: selectedMusic.artist,
            url: shareResult.audioUrl,
            chunkKey: shareResult.chunkKey,
            startTime: shareResult.start,
            duration: 15,
            isShuttled: shareResult.isShuttled,
            coverUrl: selectedMusic.coverUrl,
          };
        } catch (e) {
          postData.audioMeta = {
            id: selectedMusic.id,
            title: selectedMusic.title,
            artist: selectedMusic.artist,
            url: selectedMusic.url,
            startTime: selectedMusic.startTime || 0,
            duration: 15,
            coverUrl: selectedMusic.coverUrl,
          };
        }
      }

      await addDoc(collection(db, "posts"), postData);

      await updateDoc(doc(db, "users", profile.uid), {
        "stats.postsCount": increment(1),
        updatedAt: serverTimestamp(),
      });

      await refreshProfile();

      setTimeout(() => {
        router.push("/profile");
      }, 400);
    } catch (err) {
      console.error("Paylaşım hatası:", err);
      setIsPublishing(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentFontCfg = FONT_PRESET_CONFIGS[activeFontPreset];

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-black text-white overflow-hidden select-none no-select touch-none">
      {/* 1. Görünmez Taban Medya Dosya Seçici */}
      <input
        type="file"
        ref={baseFileInputRef}
        onChange={handleBaseFileChange}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* 2. Görünmez İkincil Medya / Çıkartma Dosya Seçici */}
      <input
        type="file"
        ref={overlayFileInputRef}
        onChange={handleOverlayFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* 3. TAM EKRAN ÇERÇEVESİZ TUVAL (BORDERLESS CANVAS STAGE - TÜM EKRANI KAPLAR) */}
      <div
        className="fixed inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none"
        style={{
          background: activeFilterGradient,
          transition: "background 400ms cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "background",
        }}
      >
        <canvas
          key={canvasKey}
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            touchAction: "none",
          }}
          className="w-full h-full block cursor-default select-none touch-none"
        />
      </div>

      {/* 4. CANLI FİLTRE ROZETİ (0.5s Minimal Instagram Swipe Toast) */}
      {filterToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/60 backdrop-blur-md px-5 py-2 rounded-full text-sm font-bold text-white shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {filterToast}
        </div>
      )}

      {/* 5. SOL ÜST: GERİ VE İNDİRME BUTONLARI */}
      {!isTextEditing && (
        <div className="fixed left-4 top-6 z-40 flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleBackClick}
            disabled={isPublishing}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {hasMedia && (
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isPublishing}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
            >
              <Download className="w-4 h-4 text-zinc-300" />
            </button>
          )}

          {hasMedia && selectedMusic && (
            <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-pink-500/30 text-white shadow-xl animate-in fade-in duration-150">
              <button
                type="button"
                onClick={handleTogglePlayAudio}
                className="text-pink-400 hover:text-pink-300 transition-colors flex items-center justify-center"
                title={isPlayingAudio ? "Duraklat" : "Oynat"}
              >
                {isPlayingAudio ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
              <span className="text-xs font-medium max-w-[110px] truncate text-zinc-200">
                {selectedMusic.title}
              </span>
              <button
                type="button"
                onClick={handleRemoveMusic}
                className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
                title="Müziği Kaldır"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Taban Medya Henüz Seçilmediyse: Ortada Minimal Medya Seç Butonu */}
      {!hasMedia && (
        <div className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
          <button
            type="button"
            onClick={() => baseFileInputRef.current?.click()}
            className="pointer-events-auto flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-xl border border-white/20 text-white font-semibold text-sm shadow-2xl transition-all"
          >
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span>Fotoğraf veya Video Seç</span>
          </button>
        </div>
      )}

      {/* 6. SAĞ DİKEY 4'LÜ AKSİYON BARI (KATMAN 4) */}
      {!isTextEditing && hasMedia && (
        <div className="fixed right-4 top-6 flex flex-col gap-3.5 z-40 pointer-events-auto animate-in fade-in duration-200">
          {/* #1: Metin Aracı (Aa) */}
          <button
            type="button"
            onClick={() => openTextEditor()}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <CaseSensitive className="w-5 h-5" />
          </button>

          {/* #2: Çıkartmalar & Fotoğraf Ekle (Sticker) */}
          <button
            type="button"
            onClick={() => setActiveDrawer("sticker_sheet")}
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === "sticker_sheet"
                ? "bg-white text-black border-white"
                : "bg-black/50 border-white/15 text-white hover:bg-black/70"
            }`}
          >
            <Sticker className="w-5 h-5 text-emerald-400" />
          </button>

          {/* #3: Müzik Aracı (Music) */}
          <button
            type="button"
            onClick={() => setActiveDrawer("music")}
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === "music"
                ? "bg-white text-black border-white"
                : "bg-black/50 border-white/15 text-white hover:bg-black/70"
            }`}
          >
            <Music className="w-5 h-5 text-pink-400" />
          </button>

          {/* #4: @Etiketleme Aracı (AtSign) */}
          <button
            type="button"
            onClick={() => setActiveDrawer("tag")}
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === "tag"
                ? "bg-white text-black border-white"
                : "bg-black/50 border-white/15 text-white hover:bg-black/70"
            }`}
          >
            <AtSign className="w-5 h-5 text-cyan-400" />
          </button>
        </div>
      )}

      {/* 7. SAĞ ALT: PAYLAŞ OKU (PRIMARY CTA) */}
      {!isTextEditing && hasMedia && (
        <div className="fixed right-4 bottom-6 z-40 pointer-events-auto animate-in fade-in duration-200">
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            className="group flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-full bg-white text-black font-semibold text-sm shadow-2xl hover:bg-neutral-100 active:scale-95 transition-all disabled:opacity-50"
          >
            {isPublishing ? (
              <>
                <span className="text-xs font-bold">Paylaşılıyor</span>
                <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </>
            ) : (
              <>
                <span className="text-xs font-bold">Paylaş</span>
                <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CircleChevronRight className="w-5 h-5" />
                </div>
              </>
            )}
          </button>
        </div>
      )}

      {/* 8. MIKNATISLI ÇÖP KUTUSU (MAGNETIC TRASH) */}
      {!isTextEditing && isDraggingObject && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 ${
              isTrashHot
                ? "scale-125 bg-red-600 text-white shadow-2xl shadow-red-500/50 ring-4 ring-red-400/40"
                : "bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl"
            }`}
          >
            <Trash2 className="w-5 h-5" />
          </div>
        </div>
      )}

      {/* 9. KARARTMA VE PANEL KAPATMA KATMANI */}
      {activeDrawer !== "none" && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-45 animate-in fade-in duration-200"
          onClick={() => setActiveDrawer("none")}
        />
      )}

      {/* 10. ALTTAN AÇILAN ÇIKARTMA & MEDYA PANELİ (STICKER SHEET) */}
      {activeDrawer === "sticker_sheet" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Çıkartmalar</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 overflow-y-auto no-scrollbar py-1">
            {/* Fotoğraf Ekle Kartı */}
            <button
              type="button"
              onClick={() => {
                setActiveDrawer("none");
                overlayFileInputRef.current?.click();
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Fotoğraf</span>
            </button>

            {/* @Bahset Kartı */}
            <button
              type="button"
              onClick={() => {
                setActiveDrawer("none");
                handleAddTagSticker();
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <AtSign className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">@Bahset</span>
            </button>

            {/* Müzik Kartı */}
            <button
              type="button"
              onClick={() => setActiveDrawer("music")}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Müzik</span>
            </button>
          </div>
        </div>
      )}

      {/* 11. ALTTAN AÇILAN MÜZİK PANELİ */}
      {activeDrawer === "music" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[72vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-pink-400" />
              <h3 className="text-white font-semibold text-base">Müzik Ekle</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 mb-3">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={searchMusicQuery}
              onChange={(e) => setSearchMusicQuery(e.target.value)}
              placeholder="Şarkı veya sanatçı ara..."
              className="bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none w-full"
            />
            {isSearchingMusic && <Loader2 className="w-4 h-4 text-pink-400 animate-spin shrink-0" />}
          </div>

          <div className="space-y-2 overflow-y-auto no-scrollbar flex-1 max-h-[35vh]">
            {musicResults.map((track) => {
              const isSelected = selectedMusic?.id === track.id;
              const isPreviewing = previewTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handlePreviewTrack(track)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                    isPreviewing
                      ? "bg-pink-500/15 border-pink-500/40 text-white shadow-lg"
                      : "bg-white/5 hover:bg-white/10 border-white/5 text-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-lg bg-zinc-800 overflow-hidden relative shrink-0 flex items-center justify-center">
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
                      {isPreviewing && isPlayingAudio && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Pause className="w-4 h-4 text-pink-400 fill-current" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{track.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-xs text-zinc-400 pl-2">
                    <span>{track.durationFormatted || "15s"}</span>
                    {isPreviewing && isPlayingAudio ? (
                      <div className="w-4 h-4 flex items-center justify-center">
                        <span className="w-1.5 h-3 bg-pink-400 rounded-full animate-pulse" />
                      </div>
                    ) : (
                      <Play className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </div>
                </button>
              );
            })}
            {musicResults.length === 0 && !isSearchingMusic && (
              <div className="py-8 text-center text-xs text-zinc-500">
                Şarkı bulunamadı
              </div>
            )}
          </div>

          {/* Aktif Seçilen Parçanın 15 Saniyelik Snippet / Isı Haritası Barı & Onay Butonu */}
          {previewTrack && (
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-medium text-zinc-300">
                  {Math.floor(selectedStartSec / 60)}:{String(Math.floor(selectedStartSec % 60)).padStart(2, "0")} - {Math.floor((selectedStartSec + 15) / 60)}:{String(Math.floor((selectedStartSec + 15) % 60)).padStart(2, "0")} (15s)
                </span>
                {hotspot && (
                  <button
                    type="button"
                    onClick={() => handleSeekChunk(hotspot.start)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold hover:bg-amber-500/30 transition-colors"
                  >
                    <Flame className="w-3 h-3 fill-amber-400" />
                    <span>Popüler Kısım ({hotspot.start}s)</span>
                  </button>
                )}
              </div>

              {/* Isı Haritası Barı & Slider */}
              <div className="relative w-full h-7 flex items-center">
                {/* Isı Haritası Blokları */}
                <div className="absolute inset-x-0 h-4 rounded-md bg-white/5 overflow-hidden flex items-end px-1 gap-0.5">
                  {(heatmapChunks.length > 0 ? heatmapChunks : Array.from({ length: 12 })).map((c: any, idx: number) => {
                    const isHot = c?.isHotspot;
                    const h = isHot ? 100 : Math.min(100, Math.max(25, (c?.intensity || 0.3) * 100));
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-sm transition-all ${
                          isHot
                            ? "bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                            : "bg-white/20"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, (previewTrack.duration || 180) - 15)}
                  step={1}
                  value={selectedStartSec}
                  onChange={(e) => handleSeekChunk(Number(e.target.value))}
                  className="w-full relative z-10 appearance-none bg-transparent cursor-pointer accent-pink-500 h-7"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmAddMusic}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-xs shadow-lg active:scale-98 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Hikayeye Ekle</span>
                <Check className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 12. ALTTAN AÇILAN ETİKETLEME PANELİ */}
      {activeDrawer === "tag" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Kişi Etiketle</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer("none");
              handleAddTagSticker(`@${profile?.username || "kullanici"}`);
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-white transition-all text-left"
          >
            <div className="w-9 h-9 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <AtSign className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">Profilini Etiketle</p>
              <p className="text-[11px] text-purple-300 truncate">@{profile?.username || "kullanici"}</p>
            </div>
          </button>
        </div>
      )}

      {/* 13. CANLI METİN YAZMA & RENK MODU (INSTAGRAM STORY ODAK MODU) */}
      {isTextEditing && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex flex-col justify-between p-4 pt-safe pb-safe animate-in fade-in duration-150">
          {/* Üst Düzenleme Çubuğu */}
          <div className="h-14 flex items-center justify-between">
            {/* Metin Hizalama */}
            <button
              type="button"
              onClick={handleToggleAlign}
              className="p-2.5 rounded-full bg-white/10 text-white active:scale-90 transition-all"
            >
              {activeTextAlign === "left" && <AlignLeft className="w-5 h-5" />}
              {activeTextAlign === "center" && <AlignCenter className="w-5 h-5" />}
              {activeTextAlign === "right" && <AlignRight className="w-5 h-5" />}
            </button>

            {/* Font Stili Seçici Rozeti (5 Font: Modern / Klasik / Neon / Daktilo / Güçlü) */}
            <button
              type="button"
              onClick={handleCycleFont}
              className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold tracking-wide active:scale-95 transition-all"
            >
              {currentFontCfg.name}
            </button>

            {/* Arka Plan Hapı Butonu (A - 4 Mod) */}
            <button
              type="button"
              onClick={handleCycleBg}
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border transition-all active:scale-90 ${
                activeBgPreset === "solid"
                  ? "bg-black text-white border-white/30"
                  : activeBgPreset === "translucent"
                  ? "bg-black/50 text-white border-white/40"
                  : activeBgPreset === "neon"
                  ? "bg-transparent text-emerald-400 border-emerald-400 shadow-lg shadow-emerald-400/40"
                  : "bg-transparent text-white border-white/20"
              }`}
            >
              A
            </button>

            {/* Bitti Butonu */}
            <button
              type="button"
              onClick={closeTextEditor}
              className="px-4 py-1.5 rounded-full bg-white text-black font-bold text-xs active:scale-95 transition-all shadow-lg"
            >
              Bitti
            </button>
          </div>

          {/* Ortalanmış Canlı Metin Alanı */}
          <div className="flex-1 flex items-center justify-center px-4">
            <textarea
              ref={textareaRef}
              value={editingText}
              onChange={(e) => handleLiveTextChange(e.target.value)}
              placeholder="Yazmaya başlayın..."
              rows={2}
              style={{
                fontFamily: currentFontCfg.fontFamily,
                fontWeight: currentFontCfg.fontWeight,
                fontStyle: currentFontCfg.fontStyle,
                color: activeTextColor,
                textAlign: activeTextAlign,
                backgroundColor:
                  activeBgPreset === "solid"
                    ? "#000000"
                    : activeBgPreset === "translucent"
                    ? "rgba(0, 0, 0, 0.55)"
                    : "transparent",
                textShadow:
                  activeBgPreset === "neon" || activeFontPreset === "neon"
                    ? `0 0 24px ${activeTextColor}`
                    : "none",
              }}
              className="w-full max-w-sm rounded-xl p-4 text-2xl font-bold border-none outline-none resize-none placeholder:text-zinc-500 shadow-2xl transition-all"
            />
          </div>

          {/* Alt Yatay Kaydırılabilir 18 Renk Şeridi */}
          <div className="pb-3 flex items-center justify-center">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2 px-4 max-w-sm">
              {STORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleSelectColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full shrink-0 border transition-all active:scale-90 ${
                    activeTextColor.toUpperCase() === c.toUpperCase()
                      ? "border-white scale-125 shadow-xl ring-2 ring-white/60"
                      : "border-white/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 14. ÇIKIŞ VE DEĞİŞİKLİKLERİ SİLME ONAY MODALI */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150 pointer-events-auto">
          <div className="w-full max-w-xs rounded-3xl bg-neutral-900/95 border border-white/10 p-5 text-center shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-white font-bold text-base mb-1.5">
              Değişiklikler silinsin mi?
            </h3>
            <p className="text-zinc-400 text-xs mb-5">
              Şimdi çıkarsanız yaptığınız tüm değişiklikler kaybolacak.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirmExit}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 transition-all text-white text-xs font-bold shadow-lg shadow-red-600/30"
              >
                Değişiklikleri Sil
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white text-xs font-semibold"
              >
                Düzenlemeye Devam Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
