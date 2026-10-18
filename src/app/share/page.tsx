"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
// [MODIFIED BY Bedirhan]
import {
  CanvasEngine,
  BaseLayer,
  TextLayer,
  OverlayImageLayer,
  FontPreset,
  TextBgPreset,
  FONT_PRESET_CONFIGS,
  StoryAudioMeta,
  VideoState,
  VideoExporter,
  ImageExporter,
  generateVideoThumbnails,
  generatePhotoThumbnails,
  ShareMode,
  PostAdjustmentState,
  DEFAULT_POST_ADJUSTMENTS,
  ReelsEffectClip,
  ReelsEffectId,
  FILTER_PRESETS,
} from "@/lib/canvas-editor";
import MusicPickerDrawer from "@/components/share/MusicPickerDrawer";
// [START] CREATED BY Bedirhan
import VideoToolsDrawer from "@/components/share/VideoToolsDrawer";
import ExportProgress from "@/components/share/ExportProgress";
import ModeSelectorModal from "@/components/share/ModeSelectorModal";
import StoryEditor from "@/components/share/StoryEditor";
import ReelsEditor from "@/components/share/ReelsEditor";
import PostPhotoEditor from "@/components/share/PostPhotoEditor";
// [END] CREATED BY Bedirhan
import { commitAudioClip } from "@/services/soundService";
// [MODIFIED BY Bedirhan]
import {
  ChevronLeft,
  ChevronDown,
  ArrowRight,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  AtSign,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sticker,
  CircleChevronRight,
  X,
  Music,
} from "lucide-react";

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

// [MODIFIED BY Bedirhan]
type ActiveDrawer = "none" | "sticker_sheet" | "tag" | "video_tools";

// [START] CREATED BY Bedirhan
const INITIAL_VIDEO_STATE: VideoState = {
  isVideo: false,
  duration: 0,
  trimStart: 0,
  trimEnd: 0,
  playbackRate: 1.0,
  volume: 1.0,
  muted: false,
  currentTime: 0,
  isPlaying: false,
};
// [END] CREATED BY Bedirhan

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

  // [START] CREATED BY Bedirhan
  // 3 Modlu Medya Editörü Durumları (Hikaye / Reels / Gönderi)
  const [shareMode, setShareMode] = useState<ShareMode>("story");
  const shareModeRef = useRef<ShareMode>("story");
  const [isModeSelectorOpen, setIsModeSelectorOpen] = useState<boolean>(true);
  const [postAdjustments, setPostAdjustments] = useState<PostAdjustmentState>(DEFAULT_POST_ADJUSTMENTS);
  const [activeFilterIndex, setActiveFilterIndex] = useState<number>(0);
  const [activeReelsEffect, setActiveReelsEffect] = useState<ReelsEffectId>("none");
  const [effectClips, setEffectClips] = useState<ReelsEffectClip[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // [END] CREATED BY Bedirhan

  // Editör Durumları
  const [canvasKey, setCanvasKey] = useState<number>(0);
  const [hasMedia, setHasMedia] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<BaseLayer | null>(null);
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [activeFilterGradient, setActiveFilterGradient] = useState<string>("#000000");
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>("none");

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

  // Müzik Durumları
  const [isMusicDrawerOpen, setIsMusicDrawerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<StoryAudioMeta | null>(null);

  // [START] CREATED BY Bedirhan
  // Video Düzenleme ve Dışa Aktarma Durumları
  const [videoState, setVideoState] = useState<VideoState>(INITIAL_VIDEO_STATE);
  const [videoThumbnails, setVideoThumbnails] = useState<string[]>([]);
  const [musicVolume, setMusicVolume] = useState<number>(0.85);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [isReelsCropping, setIsReelsCropping] = useState<boolean>(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const thumbAbortRef = useRef<AbortController | null>(null);
  // [END] CREATED BY Bedirhan

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

  // [MODIFIED BY Bedirhan]
  // Editörü Tamamen Temizleme Fonksiyonu
  const resetEditor = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    exportAbortRef.current?.abort();
    thumbAbortRef.current?.abort();
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
    setIsDraggingObject(false);
    setIsTrashHot(false);
    setIsTextEditing(false);
    setEditingText("");
    setActiveFontPreset("modern");
    setActiveBgPreset("solid");
    setActiveTextColor("#FFFFFF");
    setActiveTextAlign("center");
    setSelectedMusic(null);
    setIsMusicDrawerOpen(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setVideoThumbnails([]);
    setMusicVolume(0.85);
    setIsExportingVideo(false);
    setIsReelsCropping(false);
    setExportProgress(0);
    setPostAdjustments(DEFAULT_POST_ADJUSTMENTS);
    setActiveFilterIndex(0);
    setActiveReelsEffect("none");
    setEffectClips([]);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
    }
    setShowExitConfirm(false);
  }, []);

  // Sayfadan çıkışta sesi tamamen durdur
  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
      thumbAbortRef.current?.abort();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = "";
      }
    };
  }, []);

  // [START] CREATED BY Bedirhan
  // Canlı Önizleme Ses Senkronizasyonu: Timeline üzerindeki şarkı kesimi (timelineStart..timelineEnd) ile birebir senkronize çalar
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.crossOrigin = "anonymous";
      previewAudioRef.current.preload = "auto";
    }
    const audio = previewAudioRef.current;

    if (!selectedMusic?.streamUrl || !hasMedia || isExportingVideo || isMusicDrawerOpen) {
      if (!audio.paused) audio.pause();
      return;
    }

    if (audio.src !== selectedMusic.streamUrl) {
      audio.src = selectedMusic.streamUrl;
    }
    audio.volume = Math.max(0, Math.min(1, musicVolume));

    let rafId: number | null = null;
    const syncAudioTick = () => {
      const eng = engineRef.current;
      if (!eng || !selectedMusic) return;

      if (!videoState.isVideo) {
        if (audio.paused) {
          audio.currentTime = selectedMusic.startTime || 0;
          audio.play().catch(() => {});
        }
        return;
      }

      if (!videoState.isPlaying) {
        if (!audio.paused) audio.pause();
        return;
      }

      const cur = eng.getCurrentTime();
      const clipStart =
        typeof selectedMusic.timelineStart === "number"
          ? selectedMusic.timelineStart
          : videoState.trimStart;
      const clipEnd =
        typeof selectedMusic.timelineEnd === "number" &&
        selectedMusic.timelineEnd > clipStart
          ? selectedMusic.timelineEnd
          : videoState.trimEnd || videoState.duration;

      if (cur >= clipStart && cur <= clipEnd) {
        const expectedSongTime =
          Math.max(0, selectedMusic.startTime || 0) + Math.max(0, cur - clipStart);
        if (Math.abs(audio.currentTime - expectedSongTime) > 0.35) {
          try {
            audio.currentTime = expectedSongTime;
          } catch {}
        }
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      } else {
        if (!audio.paused) audio.pause();
      }

      rafId = requestAnimationFrame(syncAudioTick);
    };

    rafId = requestAnimationFrame(syncAudioTick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (previewAudioRef.current && !previewAudioRef.current.paused) {
        previewAudioRef.current.pause();
      }
    };
  }, [
    hasMedia,
    isExportingVideo,
    isMusicDrawerOpen,
    musicVolume,
    selectedMusic,
    videoState.duration,
    videoState.isPlaying,
    videoState.isVideo,
    videoState.trimEnd,
    videoState.trimStart,
  ]);
  // [END] CREATED BY Bedirhan
  

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

  // [MODIFIED BY Bedirhan]
  // Tuval Motorunu Başlatma (Moda Göre 9:16 Tam Ekran veya 4:3 Gönderi Boyutları)
  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) return engineRef.current;
    if (!canvasRef.current) return null;

    const currentMode = shareModeRef.current;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
    const aspect = vh / (vw || 1);
    const canvasWidth = currentMode === "post" ? 1440 : 1080;
    const canvasHeight = currentMode === "post" ? 1080 : Math.round(1080 * aspect);

    const engine = new CanvasEngine({
      canvas: canvasRef.current,
      width: canvasWidth,
      height: canvasHeight,
      fitMode: currentMode === "post" ? "cover" : "contain",
    });
    engine.setShareMode(currentMode);

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
      setActiveFilterIndex(engine.getCurrentFilterIndex());
      setFilterToast(filterName);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setFilterToast(null);
      }, 500);
    });

    // Mıknatıslı Çöp Kutusu Sürükleme Takibi (Reels NLE modunda fırlatarak silme kapalıdır)
    engine.on("drag-move", (info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }) => {
      if (info.layer.type === "media" || shareModeRef.current === "reels") return;
      setIsDraggingObject(true);

      const trashCenterX = window.innerWidth / 2;
      const trashCenterY = window.innerHeight - 68;
      const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);
      const isOver = dist < 75;

      setIsTrashHot(isOver);
    });

    // Mıknatıslı Çöp Kutusu Bırakma Takibi (Reels NLE modunda silme yalnızca Sil butonuyla yapılır)
    engine.on("drag-end", (info: { layer: BaseLayer; clientX: number; clientY: number }) => {
      setIsDraggingObject(false);

      if (info.layer && info.layer.type !== "media" && shareModeRef.current !== "reels") {
        const trashCenterX = window.innerWidth / 2;
        const trashCenterY = window.innerHeight - 68;
        const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);

        if (dist < 75) {
          if (info.layer.type === "music_sticker") {
            setSelectedMusic(null);
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

    // [START] CREATED BY Bedirhan
    engine.on("video-time", (vState: VideoState) => {
      setVideoState(vState);
    });
    // [END] CREATED BY Bedirhan

    engineRef.current = engine;
    return engine;
  }, []);

  // [MODIFIED BY Bedirhan]
  // Pencere boyutu değiştiğinde tuval çözünürlüğünü dinamik olarak güncelle
  useEffect(() => {
    const handleResize = () => {
      if (engineRef.current && canvasRef.current) {
        if (shareModeRef.current === "post") {
          engineRef.current.updateCanvasResolution(1440, 1080);
        } else if (shareModeRef.current === "reels") {
          engineRef.current.updateCanvasResolution(1080, 1920);
        } else {
          const vw = window.innerWidth || 1080;
          const vh = window.innerHeight || 1920;
          const aspect = vh / (vw || 1);
          const w = 1080;
          const h = Math.round(1080 * aspect);
          engineRef.current.updateCanvasResolution(w, h);
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // [START] CREATED BY Bedirhan
  // 1. MOD SEÇİMİ VE TABAN MEDYA AKIŞI (HİKAYE / REELS / GÖNDERİ)
  const handleSelectMode = useCallback(
    (mode: ShareMode) => {
      shareModeRef.current = mode;
      setShareMode(mode);
      setIsModeSelectorOpen(false);
      setActiveDrawer("none");

      const engine = getOrCreateEngine();
      if (engine) {
        if (mode === "post") {
          engine.setFitMode("cover");
          engine.updateCanvasResolution(1440, 1080);
        } else if (mode === "reels") {
          engine.setFitMode("cover");
          engine.updateCanvasResolution(1080, 1920);
        } else {
          const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
          const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
          const aspect = vh / (vw || 1);
          engine.setFitMode("contain");
          engine.updateCanvasResolution(1080, Math.round(1080 * aspect));
        }
        engine.setShareMode(mode);
        setVideoState(engine.getVideoState());
      }

      if (!hasMedia) {
        setTimeout(() => {
          baseFileInputRef.current?.click();
        }, 60);
      }
    },
    [getOrCreateEngine, hasMedia]
  );

  const handleChangePostAdjustments = useCallback((partial: Partial<PostAdjustmentState>) => {
    if (!engineRef.current) return;
    engineRef.current.setPostAdjustments(partial);
    setPostAdjustments(engineRef.current.getPostAdjustments());
  }, []);

  const handleResetPostAdjustments = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.resetPostAdjustments();
    setPostAdjustments(engineRef.current.getPostAdjustments());
  }, []);

  const handleSelectFilterIndex = useCallback((index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setFilterByIndex(index);
    setActiveFilterIndex(index);
    const preset = FILTER_PRESETS[index];
    if (preset) {
      setActiveFilterGradient(preset.backgroundGradient);
    }
  }, []);

  const handleSelectReelsEffect = useCallback((effect: ReelsEffectId) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setReelsEffect(effect);
    setActiveReelsEffect(effect);
  }, []);

  const handleChangeEffectClips = useCallback((clips: ReelsEffectClip[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setEffectClips(clips);
    setEffectClips(clips);
  }, []);
  // [END] CREATED BY Bedirhan

  // [MODIFIED BY Bedirhan]
  const handleBaseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_FILE_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_FILE_BYTES) {
      setFilterToast("Maksimum 100 MB dosya seçilebilir");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setFilterToast(null), 2200);
      e.target.value = "";
      return;
    }

    if (shareModeRef.current === "post" && file.type.startsWith("video/")) {
      setFilterToast("Gönderi modunda yalnızca fotoğraf seçilebilir");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setFilterToast(null), 2200);
      e.target.value = "";
      return;
    }

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      engine.setShareMode(shareModeRef.current);
      if (shareModeRef.current === "post") {
        engine.setFitMode("cover");
        engine.updateCanvasResolution(1440, 1080);
      } else if (shareModeRef.current === "reels") {
        engine.setFitMode("cover");
        engine.updateCanvasResolution(1080, 1920);
      } else {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
        const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
        const aspect = vh / (vw || 1);
        engine.setFitMode("contain");
        engine.updateCanvasResolution(1080, Math.round(1080 * aspect));
      }

      thumbAbortRef.current?.abort();
      setVideoThumbnails([]);

      const media = await engine.loadMedia(file, undefined, shareModeRef.current === "post");
      setHasMedia(true);
      setPostAdjustments(engine.getPostAdjustments());
      setActiveFilterIndex(engine.getCurrentFilterIndex());
      setActiveReelsEffect(engine.getReelsEffect());
      setEffectClips(engine.getEffectClips());
      e.target.value = "";

      if (media.type === "video") {
        setVideoState(engine.getVideoState());
        const abortCtrl = new AbortController();
        thumbAbortRef.current = abortCtrl;
        generateVideoThumbnails(file, {
          count: 8,
          signal: abortCtrl.signal,
          onThumbnail: (thumbs) => setVideoThumbnails(thumbs),
        }).catch(() => {});
      } else if (shareModeRef.current === "reels") {
        // Reels modunda fotoğraf otomatik 5 saniyelik hareketli klibe dönüşür
        setVideoState(engine.getVideoState());
        generatePhotoThumbnails(file, 8)
          .then((thumbs) => setVideoThumbnails(thumbs))
          .catch(() => {});
      } else {
        setVideoState(INITIAL_VIDEO_STATE);
      }
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

    engine.pauseVideo();

    let target = layer;
    if (!target) {
      target = engine.addText(
        "",
        {
          fontSize: 90,
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
        selectedLayer.visible = true;
        selectedLayer.temporalVisible = true;
        engineRef.current.selectLayerById(selectedLayer.id);
        engineRef.current.render();
        engineRef.current.requestRender();
        engineRef.current.emit("change");
        setSelectedLayer(selectedLayer);
      }
    }
    setIsTextEditing(false);
  };

  const handleLiveTextChange = (text: string) => {
    setEditingText(text);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setText(text);
      engineRef.current.render();
      engineRef.current.requestRender();
      engineRef.current.emit("change");
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
        fontSize: 72,
        color: "#000000",
        backgroundColor: "#ffffff",
        borderRadius: 14,
        backgroundPadding: 18,
        fontWeight: "800",
        fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, sans-serif",
      },
      0.5,
      0.5
    );

    setSelectedLayer(layer);
  };

  // Şarkıyı Seç ve Tuvale Çıkartma Olarak Ekle
  const handleSelectMusic = (meta: StoryAudioMeta) => {
    const engine = getOrCreateEngine();
    const vState = engine ? engine.getVideoState() : videoState;
    const defaultStart = vState.isVideo ? vState.trimStart : 0;
    const defaultEnd = vState.isVideo
      ? vState.trimEnd || vState.duration || 15
      : 15;
    const enrichedMeta: StoryAudioMeta = {
      ...meta,
      timelineStart:
        typeof meta.timelineStart === "number" ? meta.timelineStart : defaultStart,
      timelineEnd:
        typeof meta.timelineEnd === "number" && meta.timelineEnd > defaultStart
          ? meta.timelineEnd
          : defaultEnd,
    };
    setSelectedMusic(enrichedMeta);
    if (engine) {
      engine.addMusicSticker(enrichedMeta, 0.5, 0.65);
    }
  };

  // [START] CREATED BY Bedirhan
  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
    setIsExportingVideo(false);
    setIsPublishing(false);
    setExportProgress(0);
    engineRef.current?.playVideo().catch(() => {});
  };
  // [END] CREATED BY Bedirhan

  // [MODIFIED BY Bedirhan]
  // Cihaza WebP veya MP4 İndir
  const handleDownloadImage = async () => {
    const engine = getOrCreateEngine();
    if (!engine || isPublishing || isExportingVideo) return;
    try {
      if (videoState.isVideo) {
        setIsExportingVideo(true);
        setExportProgress(0);
        const abortCtrl = new AbortController();
        exportAbortRef.current = abortCtrl;
        const blob = await VideoExporter.exportToBlob(engine, {
          music: selectedMusic,
          musicVolume,
          onProgress: (p) => setExportProgress(p),
          signal: abortCtrl.signal,
        });
        setIsExportingVideo(false);
        const ext = blob.type.includes("webm") ? "webm" : "mp4";
        ImageExporter.downloadBlob(blob, `sigalmedia_${Date.now()}.${ext}`);
        await engine.playVideo();
      } else {
        await engine.downloadImage(`sigalmedia_${Date.now()}.webp`, {
          mimeType: "image/webp",
          quality: 0.95,
        });
      }
    } catch (e) {
      setIsExportingVideo(false);
      if ((e as Error)?.name !== "AbortError") {
        console.error("İndirme hatası:", e);
      }
    }
  };

  // [MODIFIED BY Bedirhan]
  // ─────────────────────────────────────────────────────────────
  // 4. HİKAYEYİ / GÖNDERİYİ PAYLAŞ (GÖRSEL WEBP VEYA VİDEO MP4)
  // ─────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!profile?.uid || !engineRef.current || isPublishing || isExportingVideo) return;

    try {
      setIsPublishing(true);
      const timestamp = Date.now();
      let blob: Blob;
      let filename: string;
      let contentType: string;
      let publishedMediaType: "image" | "video" = "image";

      if (videoState.isVideo) {
        setIsExportingVideo(true);
        setExportProgress(0);
        const abortCtrl = new AbortController();
        exportAbortRef.current = abortCtrl;

        blob = await VideoExporter.exportToBlob(engineRef.current, {
          music: selectedMusic,
          musicVolume,
          onProgress: (p) => setExportProgress(p),
          signal: abortCtrl.signal,
        });
        setIsExportingVideo(false);
        const isWebm = blob.type.includes("webm");
        filename = `${shareMode}_${profile.uid}_${timestamp}.${isWebm ? "webm" : "mp4"}`;
        contentType = isWebm ? "video/webm" : "video/mp4";
        publishedMediaType = "video";
      } else {
        blob = await engineRef.current.exportImage({
          mimeType: "image/webp",
          quality: 0.92,
        });
        filename = `${shareMode}_${profile.uid}_${timestamp}.webp`;
        contentType = "image/webp";
        publishedMediaType = "image";
      }

      const storageRef = ref(storage, `posts/${profile.uid}/${filename}`);

      await uploadBytes(storageRef, blob, {
        contentType,
      });

      const mediaUrl = await getDownloadURL(storageRef);

      const postData: Record<string, unknown> = {
        authorId: profile.uid,
        authorUsername: profile.username || "kullanici",
        authorDisplayName: profile.displayName || "Kullanıcı",
        authorPhotoURL: profile.photoURL || "",
        mediaUrl,
        mediaType: publishedMediaType,
        type: shareMode,
        caption: "",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      };

      // Müzik seçildiyse metaveriyi gönderiye ekle ve R2 commit'i tetikle
      if (selectedMusic) {
        postData.audio = {
          id: selectedMusic.id,
          title: selectedMusic.title,
          artist: selectedMusic.artist,
          album: selectedMusic.album || "",
          thumbnail: selectedMusic.thumbnail || "",
          streamUrl: selectedMusic.streamUrl,
          startTime: selectedMusic.startTime,
          duration: selectedMusic.duration,
          totalDuration: selectedMusic.totalDuration,
          lyricsSnippet: selectedMusic.lyricsSnippet || "",
        };

        commitAudioClip({
          videoId: selectedMusic.id,
          startTime: selectedMusic.startTime,
          duration: selectedMusic.duration,
        }).catch((e) => console.warn("Background commit error:", e));
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
      setIsExportingVideo(false);
      setIsPublishing(false);
      if ((err as Error)?.name !== "AbortError") {
        console.error("Paylaşım hatası:", err);
      }
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
  const modeLabel =
    shareMode === "story" ? "Hikaye" : shareMode === "reels" ? "Reels" : "Gönderi";

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-black text-white overflow-hidden select-none no-select touch-none">
      {/* 1. Görünmez Taban Medya Dosya Seçici */}
      <input
        type="file"
        ref={baseFileInputRef}
        onChange={handleBaseFileChange}
        accept={shareMode === "post" ? "image/*" : "image/*,video/*"}
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

      {/* [MODIFIED BY Bedirhan] */}
      {/* 3. TUVAL SAHNESİ: Hikaye için 9:16 Tam Ekran, Reels için Üst Yarı Yuvarlatılmış Önizleme (Kırpma modunda tam boy top-16 bottom-28), Gönderi için 4:3 Stüdyo Çerçevesi */}
      <div
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            engineRef.current?.pauseVideo();
            engineRef.current?.selectLayerById(null);
          }
        }}
        className={
          shareMode === "reels" && hasMedia && !isTextEditing
            ? isReelsCropping
              ? "fixed inset-x-0 top-16 bottom-28 flex items-center justify-center px-4 py-2 overflow-hidden select-none bg-black"
              : "fixed inset-x-0 top-16 bottom-[345px] flex items-center justify-center px-6 py-2 overflow-hidden select-none bg-black"
            : "fixed inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none"
        }
        style={{
          background:
            shareMode === "reels"
              ? "#000000"
              : shareMode === "post"
                ? "#09090b"
                : activeFilterGradient,
          transition: "background 400ms cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "background",
        }}
      >
        <div
          className={
            shareMode === "post"
              ? "w-full max-w-md aspect-[4/3] mx-3 mb-40 rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-black"
              : shareMode === "reels" && hasMedia && !isTextEditing
                ? "h-full aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl bg-neutral-900"
                : "w-full h-full"
          }
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
      </div>

      {/* 4. CANLI FİLTRE ROZETİ (0.5s Minimal Instagram Swipe Toast) */}
      {filterToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/60 backdrop-blur-md px-5 py-2 rounded-full text-sm font-bold text-white shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {filterToast}
        </div>
      )}

      {/* 5. ÜST BAR: GERİ, ORTADA MOD SEÇİCİ HAP VE SAĞ ÜST PAYLAŞ / İNDİR */}
      {!isTextEditing && !isModeSelectorOpen && (
        <div className="fixed inset-x-0 top-4 z-40 px-4 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackClick}
              disabled={isPublishing}
              className="w-11 h-11 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all shadow-xl flex items-center justify-center text-white"
            >
              {shareMode === "reels" ? (
                <ChevronDown className="w-6 h-6" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>

            {hasMedia && (
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isPublishing}
                className="w-11 h-11 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all shadow-xl flex items-center justify-center text-white"
              >
                <Download className="w-4 h-4 text-zinc-300" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsModeSelectorOpen(true)}
            disabled={isPublishing}
            className="h-11 px-4 rounded-2xl bg-[#1c1c1e] hover:bg-[#28282c] active:scale-95 transition-all shadow-xl flex items-center gap-2 text-sm font-semibold text-white"
          >
            <span className="w-4 h-4 rounded-md bg-gradient-to-tr from-pink-500 via-purple-500 to-amber-400 inline-block shrink-0" />
            <span>{modeLabel}</span>
          </button>

          {shareMode === "reels" && hasMedia ? (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="w-11 h-11 rounded-full bg-white text-black hover:bg-zinc-200 active:scale-90 transition-all shadow-xl flex items-center justify-center disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              )}
            </button>
          ) : (
            <div className="w-11" />
          )}
        </div>
      )}

      {/* Taban Medya Henüz Seçilmediyse: Ortada Minimal Medya Seç Butonu */}
      {!hasMedia && !isModeSelectorOpen && (
        <div className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
          <button
            type="button"
            onClick={() => baseFileInputRef.current?.click()}
            className="pointer-events-auto flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-xl border border-white/20 text-white font-semibold text-sm shadow-2xl transition-all"
          >
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span>
              {shareMode === "post" ? "Fotoğraf Seç" : "Fotoğraf veya Video Seç"}
            </span>
          </button>
        </div>
      )}

      {/* [START] CREATED BY Bedirhan */}
      {/* 6A. HİKAYE MODU (STORY): Video kırpma kapalı, dikey hikaye araçları + Sağ Alt Paylaş */}
      {!isTextEditing && hasMedia && shareMode === "story" && (
        <>
          <StoryEditor
            activeDrawer={activeDrawer}
            selectedMusic={selectedMusic}
            onOpenTextEditor={() => openTextEditor()}
            onOpenStickerSheet={() => setActiveDrawer("sticker_sheet")}
            onOpenMusicPicker={() => setIsMusicDrawerOpen(true)}
            onOpenTagSheet={() => setActiveDrawer("tag")}
          />

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
        </>
      )}

      {/* 6B. REELS MODU (SABİT PPS MERKEZ İBRELİ NLE TIMELINE + DİNAMİK ALT AKSİYON ÇUBUĞU) */}
      {!isTextEditing && hasMedia && shareMode === "reels" && (
        <ReelsEditor
          engine={engineRef.current}
          selectedCanvasLayer={selectedLayer}
          videoState={videoState}
          thumbnails={videoThumbnails}
          selectedMusic={selectedMusic}
          musicVolume={musicVolume}
          activeFilterIndex={activeFilterIndex}
          activeReelsEffect={activeReelsEffect}
          effectClips={effectClips}
          isPublishing={isPublishing}
          getCurrentTime={() => engineRef.current?.getCurrentTime() || 0}
          onChangeTrim={(start, end) => engineRef.current?.setTrim(start, end)}
          onChangeSpeed={(rate) => engineRef.current?.setSpeed(rate)}
          onChangeVolume={(vol, muted) => engineRef.current?.setVolume(vol, muted)}
          onChangeMusicVolume={(vol) => setMusicVolume(vol)}
          onChangeMusicMeta={(nextMusic) => setSelectedMusic(nextMusic)}
          onChangeEffectClips={handleChangeEffectClips}
          onCropModeChange={setIsReelsCropping}
          onSeek={(t) => engineRef.current?.seekVideo(t)}
          onTogglePlay={() => engineRef.current?.toggleVideoPlay()}
          onOpenTextEditor={() => openTextEditor()}
          onOpenMusicPicker={() => setIsMusicDrawerOpen(true)}
          onOpenStickerSheet={() => setActiveDrawer("sticker_sheet")}
          onOpenPhotoOverlay={() => overlayFileInputRef.current?.click()}
          onSelectFilterIndex={handleSelectFilterIndex}
          onSelectReelsEffect={handleSelectReelsEffect}
          onPublish={handlePublish}
        />
      )}

      {/* 6C. GÖNDERİ MODU (4:3 PROFESYONEL FOTOĞRAF STÜDYOSU) */}
      {!isTextEditing && hasMedia && shareMode === "post" && (
        <>
          <div className="fixed right-4 top-6 flex flex-col gap-2.5 z-40 pointer-events-auto">
            <button
              type="button"
              onClick={() => openTextEditor()}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center font-bold text-xs"
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setActiveDrawer("tag")}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
            >
              <AtSign className="w-5 h-5 text-cyan-400" />
            </button>
          </div>

          <PostPhotoEditor
            adjustments={postAdjustments}
            isPublishing={isPublishing}
            onChangeAdjustments={handleChangePostAdjustments}
            onResetAdjustments={handleResetPostAdjustments}
            onRotate90={() => engineRef.current?.rotateMedia90()}
            onFlipHorizontal={() => engineRef.current?.flipMediaHorizontal()}
            onFlipVertical={() => engineRef.current?.flipMediaVertical()}
            onResetGeometry={() => engineRef.current?.resetMediaGeometry()}
            onPublish={handlePublish}
          />
        </>
      )}

      {/* 3 MOD SEÇİCİ MODAL (Hikaye / Reels / Gönderi) */}
      <ModeSelectorModal
        isOpen={isModeSelectorOpen}
        activeMode={hasMedia ? shareMode : null}
        onSelectMode={handleSelectMode}
        onBack={() => {
          if (hasMedia) {
            setIsModeSelectorOpen(false);
          } else {
            router.back();
          }
        }}
      />
      {/* [END] CREATED BY Bedirhan */}

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
              onClick={() => {
                setActiveDrawer("none");
                setIsMusicDrawerOpen(true);
              }}
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

      {/* 11. ALTTAN AÇILAN MÜZİK ÇEKMECESİ (TAM EKRAN EN ÜSTE KADAR) */}
      <MusicPickerDrawer
        isOpen={isMusicDrawerOpen}
        onClose={() => setIsMusicDrawerOpen(false)}
        onSelectMusic={handleSelectMusic}
        currentMusic={selectedMusic}
      />
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

      {/* [START] CREATED BY Bedirhan */}
      <VideoToolsDrawer
        isOpen={activeDrawer === "video_tools" && videoState.isVideo}
        onClose={() => setActiveDrawer("none")}
        videoState={videoState}
        thumbnails={videoThumbnails}
        hasMusic={Boolean(selectedMusic)}
        musicVolume={musicVolume}
        onChangeTrim={(start, end) => engineRef.current?.setTrim(start, end)}
        onChangeSpeed={(rate) => engineRef.current?.setSpeed(rate)}
        onChangeVolume={(vol, muted) => engineRef.current?.setVolume(vol, muted)}
        onChangeMusicVolume={(vol) => setMusicVolume(vol)}
        onSeek={(t) => {
          engineRef.current?.seekVideo(t);
        }}
        onTogglePlay={() => {
          engineRef.current?.toggleVideoPlay();
        }}
      />

      <ExportProgress
        isOpen={isExportingVideo}
        progress={exportProgress}
        clipCount={engineRef.current?.getVideoClips().length || 1}
        onCancel={handleCancelExport}
      />
      {/* [END] CREATED BY Bedirhan */}

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
